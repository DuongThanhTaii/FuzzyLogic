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


def _pre_charge_plant(plant, infusion_ml_hr: float, seconds: int):
    """Advance plant N seconds at fixed infusion without recording — simulates pre-op drug."""
    for _ in range(seconds):
        plant.step(infusion_ml_hr)


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
            # Pre-load: pump 30 ml/hr for 8 min → Ce above EC50 → BIS drops hard
            _pre_charge_plant(plant, 30.0, seconds=8 * 60)

        elif scenario == "resistance":
            # Simulate high EC50: scale the plant's EC50 × 1.8
            plant.EC50 *= 1.8

        elif scenario == "induction":
            # Start controller with a small induction boost (higher initial infusion)
            pass  # handled in the loop via induction_bolus flag

        total_steps   = int(duration_min * 60 / DT_S)
        dist_start    = int(dist_time * 60 / DT_S)
        total_stream_points = max(1, (total_steps + STREAM_EVERY - 1) // STREAM_EVERY)

        prev_error = 0.0
        # For overdose start: controller begins at 0, has to recover from low BIS
        infusion   = 30.0 if scenario == "overdose" else 0.0
        rng = np.random.default_rng(42)

        for step in range(total_steps):
            t_min = step * DT_S / 60.0

            # ── Disturbance injection ────────────────────────────────────────
            disturbance = 0.0
            if scenario == "disturbance" and step >= dist_start:
                # Burst disturbance: intense for first 3 min then moderate
                burst = 1.8 if step < dist_start + 180 else 0.7
                disturbance = float(rng.normal(0, dist_amp * 0.35 * burst))

            # ── Plant step ──────────────────────────────────────────────────
            bis_raw = plant.step(infusion)
            bis     = float(np.clip(bis_raw + disturbance, 0.0, 100.0))

            # ── Fuzzy controller ────────────────────────────────────────────
            error   = SETPOINT - bis
            delta_e = (error - prev_error) / DT_S

            # Induction scenario: override to high rate for first 3 min
            if scenario == "induction" and step < 180:
                infusion = 30.0 if step < 60 else flc.compute(error, delta_e)
            else:
                infusion = flc.compute(error, delta_e)

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
