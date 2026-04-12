"""
POST /api/simulate  — batch simulation (returns full time-series at once)
"""

import numpy as np
from fastapi import APIRouter
from models.schemas import SimulationRequest
from fuzzy.controller import get_flc
from fuzzy.pkpd_model import PKPDModel, calculate_clinical_vitals

router = APIRouter()

SETPOINT = 50.0   # BIS target
DT_S = 1.0        # simulation step in seconds


def _set_overdose_state(plant, target_ce: float = 6.0):
    ce0 = float(target_ce)
    plant.state = np.array([ce0 * 1.05, ce0 * 0.9, ce0 * 0.7, ce0], dtype=float)


@router.post("/simulate")
def run_simulation(req: SimulationRequest):
    flc  = get_flc()
    plant = PKPDModel(
        patient_type=req.patient.patient_type,
        weight=req.patient.weight,
        dt=DT_S,
    )

    if req.scenario == "overdose":
        _set_overdose_state(plant, target_ce=6.0)
    elif req.scenario == "resistance":
        plant.EC50 *= 2.6

    total_steps = int(req.duration * 60 / DT_S)
    disturbance_start = int(req.disturbance_time * 60 / DT_S)

    times        = []
    bis_values   = []
    infusion_rates = []
    error_values = []
    delta_error_values = []
    heart_rates = []
    respiratory_rates = []
    spo2_values = []
    sys_bp_values = []
    dia_bp_values = []
    ce_values = []

    prev_error = 0.0
    infusion  = 0.0

    rng = np.random.default_rng(42)

    for step in range(total_steps):
        t_min = step * DT_S / 60.0

        # Disturbance injection (Scenario 2)
        disturbance = 0.0
        if req.scenario == "disturbance" and step >= disturbance_start:
            disturbance = rng.normal(0, req.disturbance_amplitude * 0.3)

        bis_raw = plant.step(infusion)
        bis = float(np.clip(bis_raw + disturbance, 0, 100))

        error = SETPOINT - bis          # positive → need more drug
        delta_error = (error - prev_error) / DT_S

        infusion = flc.compute(error, delta_error)
        prev_error = error
        snapshot = plant.get_snapshot()
        vitals = calculate_clinical_vitals(
            bis=bis,
            ce=snapshot["Ce"],
            infusion_ml_hr=infusion,
            patient_type=req.patient.patient_type,
            disturbance=disturbance,
        )

        # Record every 5 seconds to reduce payload
        if step % 5 == 0:
            times.append(round(t_min, 3))
            bis_values.append(round(bis, 2))
            infusion_rates.append(round(infusion, 3))
            error_values.append(round(error, 2))
            delta_error_values.append(round(delta_error, 3))
            heart_rates.append(vitals["heart_rate"])
            respiratory_rates.append(vitals["respiratory_rate"])
            spo2_values.append(vitals["spo2"])
            sys_bp_values.append(vitals["sys_bp"])
            dia_bp_values.append(vitals["dia_bp"])
            ce_values.append(round(snapshot["Ce"], 4))

    return {
        "time":          times,
        "bis":           bis_values,
        "infusion_rate": infusion_rates,
        "error":         error_values,
        "delta_error":   delta_error_values,
        "heart_rate":    heart_rates,
        "respiratory_rate": respiratory_rates,
        "spo2":          spo2_values,
        "sys_bp":        sys_bp_values,
        "dia_bp":        dia_bp_values,
        "ce":            ce_values,
        "setpoint":      SETPOINT,
        "patient_type":  req.patient.patient_type,
        "scenario":      req.scenario,
    }
