"""
WebSocket /ws/simulate — streams simulation step by step.

Scenarios:
  robustness   — different patient types converge to BIS=50
  disturbance  — white-noise surgical interference at t=disturbance_time
  overdose     — patient pre-loaded with high drug → BIS crashes, controller rescues
  resistance   — high EC50 patient, controller must ramp hard to reach target
  induction    — rapid induction bolus + maintenance (realistic OR flow)
"""

import json
import asyncio
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fuzzy.controller import get_flc
from fuzzy.pkpd_model import PKPDModel, calculate_clinical_vitals

router = APIRouter()

SETPOINT    = 50.0
DT_S        = 1.0
STREAM_EVERY = 5           # emit 1 point per 5 sim-seconds
STREAM_DELAY = STREAM_EVERY * DT_S / 20.0  # 20× speed → ~0.25 s/point
RESISTANCE_EC50_MULT = 1.8

# Scenario-specific pharmacologic calibration after moving infusion range to 0-30 ml/hr.
# These values keep each demo scenario aligned with its narrative.
SCENARIO_DENSITY_MG_ML = {
    "robustness": 42.0,
    "disturbance": 42.0,
    "overdose": 38.0,
    "resistance": 52.0,
    "induction": 44.0,
}


def _demo_speed_factor(duration_min: float, scenario: str) -> float:
    """Speed up PK/PD response for short demos so BIS changes are visible in 5-minute runs."""
    if scenario == "overdose":
        return 1.0
    dur = max(1.0, float(duration_min))
    # duration=10 -> 1.0x, duration=5 -> 2.0x
    return float(np.clip(10.0 / dur, 1.0, 2.0))


def _pre_charge_plant(plant, infusion_ml_hr: float, seconds: int):
    """Advance plant N seconds at fixed infusion without recording — simulates pre-op drug."""
    for _ in range(seconds):
        plant.step(infusion_ml_hr)


def _set_overdose_state(plant, target_ce: float = 6.0):
    """
    Force an overdose-like initial PK/PD state so first BIS is in deep/critical range.
    This avoids the previous under-dosed precharge that still produced BIS > 90.
    """
    ce0 = float(target_ce)
    plant.state = np.array([ce0 * 1.05, ce0 * 0.9, ce0 * 0.7, ce0], dtype=float)


def _get_scenario_event(scenario: str, step: int, dist_start: int):
    if scenario == "disturbance":
        if step == dist_start:
            return "disturbance_start"
        if step == dist_start + 180:
            return "disturbance_decay"
    if scenario == "induction":
        if step == 0:
            return "induction_start"
        if step == 60:
            return "maintenance_start"
    if scenario == "overdose" and step == 0:
        return "overdose_rescue"
    if scenario == "resistance" and step == 0:
        return "resistance_detected"
    return None


def _scenario_scaled_inputs(scenario: str, error: float, delta_e: float, disturbance: float):
    """Scale controller inputs per scenario to keep BIS response clinically plausible."""
    e_in = error
    de_in = delta_e

    if scenario == "resistance":
        # Resistance needs stronger corrective action because EC50 is shifted right.
        e_in *= 1.70
        de_in *= 1.35
    elif scenario == "robustness":
        # Slightly stronger action to ensure convergence around BIS target in demo duration.
        e_in *= 1.20
        de_in *= 1.10
    elif scenario == "induction":
        # Induction should drop BIS quickly then switch to maintenance.
        e_in *= 1.25
        de_in *= 1.10
    elif scenario == "disturbance" and abs(disturbance) > 0.0:
        # Slightly amplify dynamic response during surgical interference.
        e_in *= 1.15
        de_in *= 1.25

    return e_in, de_in


def _scenario_rate_guard(scenario: str, step: int, bis: float, infusion: float, dist_start: int):
    """Apply safety/phase guards to the commanded infusion rate."""
    rate = float(np.clip(infusion, 0.0, 30.0))

    if scenario == "induction":
        # Fast induction, then taper to maintenance to avoid prolonged deep hypnosis.
        if step < 90 and bis > 62:
            return 30.0
        if step < 210 and bis > 55:
            return max(rate, 16.0)

    if scenario == "disturbance":
        # During early disturbance burst, keep enough support so BIS can recover.
        if dist_start <= step < dist_start + 120 and bis > 62:
            return max(rate, 16.0)

    if scenario == "overdose":
        # In overdose rescue, keep pump off until BIS exits dangerous range,
        # then reintroduce cautiously before allowing full closed-loop control.
        if bis < 35:
            return 0.0
        if bis < 45:
            return min(rate, 8.0)
        if bis < 55:
            return min(rate, 18.0)

    if scenario == "resistance" and step < 12 * 60 and bis > 60:
        # Early minimum support dose helps overcome delayed onset in resistant patients.
        return max(rate, 18.0)

    if scenario == "resistance":
        # Once approaching/under target, aggressively taper to avoid drifting too deep.
        if bis < 48:
            return min(rate, 6.0)
        if bis < 52:
            return min(rate, 10.0)

    return rate


@router.websocket("/ws/simulate")
async def ws_simulate(websocket: WebSocket):
    await websocket.accept()
    try:
        raw = await websocket.receive_text()
        req = json.loads(raw)

        patient_type    = req.get("patient_type", "adult")
        weight          = float(req.get("weight", 70.0))
        scenario        = req.get("scenario", "robustness")
        duration_min    = float(req.get("duration", 30.0))
        dist_time       = float(req.get("disturbance_time", 10.0))
        dist_amp        = float(req.get("disturbance_amplitude", 15.0))

        flc   = get_flc()
        plant = PKPDModel(patient_type=patient_type, weight=weight, dt=DT_S)

        # ── Scenario-specific pre-conditioning ──────────────────────────────
        if scenario == "overdose":
            # Start from deep anesthesia (BIS < 20) so rescue behavior is visible immediately.
            _set_overdose_state(plant, target_ce=6.0)

        elif scenario == "resistance":
            # Drug resistance per scenario definition: EC50 increases 1.8x.
            plant.EC50 *= RESISTANCE_EC50_MULT

        elif scenario == "induction":
            # Start controller with a small induction boost (higher initial infusion)
            pass  # handled in the loop via induction_bolus flag

        total_steps   = int(duration_min * 60 / DT_S)
        dist_start    = int(dist_time * 60 / DT_S)
        total_stream_points = max(1, (total_steps + STREAM_EVERY - 1) // STREAM_EVERY)
        base_density = SCENARIO_DENSITY_MG_ML.get(scenario, SCENARIO_DENSITY_MG_ML["robustness"])
        density_mg_ml = base_density * _demo_speed_factor(duration_min, scenario)

        prev_error = 0.0
        # Overdose rescue starts with pump OFF; controller should hold/reintroduce cautiously.
        infusion   = 0.0
        rng = np.random.default_rng(42)

        for step in range(total_steps):
            t_min = step * DT_S / 60.0

            # ── Disturbance injection ────────────────────────────────────────
            disturbance = 0.0
            if scenario == "disturbance" and step >= dist_start:
                # Burst disturbance: intense for first 3 min then moderate
                burst = 1.8 if step < dist_start + 180 else 0.7
                disturbance = float(rng.normal(0, dist_amp * 0.22 * burst))
                disturbance = float(np.clip(disturbance, -dist_amp, dist_amp))

            # ── Plant step ──────────────────────────────────────────────────
            bis_raw = plant.step(infusion, density_mg_ml=density_mg_ml)
            bis     = float(np.clip(bis_raw + disturbance, 0.0, 100.0))

            # ── Fuzzy controller ────────────────────────────────────────────
            error   = SETPOINT - bis
            delta_e = (error - prev_error) / DT_S
            e_in, de_in = _scenario_scaled_inputs(scenario, error, delta_e, disturbance)

            # Induction scenario: override to high rate for first 3 min
            if scenario == "induction" and step < 180:
                infusion = 30.0 if step < 45 and bis > 65 else flc.compute(e_in, de_in)
            else:
                infusion = flc.compute(e_in, de_in)

            infusion = _scenario_rate_guard(scenario, step, bis, infusion, dist_start)

            prev_error = error

            # ── Stream every N steps ────────────────────────────────────────
            if step % STREAM_EVERY == 0:
                stream_idx = (step // STREAM_EVERY) + 1
                progress = min(100.0, (stream_idx / total_stream_points) * 100.0)
                snapshot = plant.get_snapshot()
                vitals = calculate_clinical_vitals(
                    bis=bis,
                    ce=snapshot["Ce"],
                    infusion_ml_hr=infusion,
                    patient_type=patient_type,
                    disturbance=disturbance,
                )
                scenario_event = _get_scenario_event(scenario, step, dist_start)

                payload = {
                    "t":        round(t_min, 3),
                    "bis":      round(bis, 2),
                    "rate":     round(infusion, 3),
                    "error":    round(error, 2),
                    "delta_error": round(delta_e, 3),
                    "setpoint": SETPOINT,
                    "state":    vitals["state"],
                    "ce":       round(snapshot["Ce"], 4),
                    "c1":       round(snapshot["C1"], 4),
                    "heart_rate": vitals["heart_rate"],
                    "respiratory_rate": vitals["respiratory_rate"],
                    "spo2": vitals["spo2"],
                    "sys_bp": vitals["sys_bp"],
                    "dia_bp": vitals["dia_bp"],
                    "scenario": scenario,
                    "patient_type": patient_type,
                    "disturbance": round(disturbance, 3),
                    "scenario_event": scenario_event,
                    "step":     stream_idx,
                    "total_steps": total_stream_points,
                    "progress": round(progress, 2),
                    "done":     False,
                }
                await websocket.send_text(json.dumps(payload))
                await asyncio.sleep(STREAM_DELAY)

        await websocket.send_text(json.dumps({
            "done": True,
            "step": total_stream_points,
            "total_steps": total_stream_points,
            "progress": 100.0,
        }))

    except WebSocketDisconnect:
        pass
    except Exception as exc:
        try:
            await websocket.send_text(json.dumps({"error": str(exc)}))
        except Exception:
            pass
