"""
Propofol PK/PD Model — Marsh/Schnider hybrid
Pharmacokinetic: 3-compartment model
Pharmacodynamic: Hill equation (Emax model) → BIS output

State vector: [C1, C2, C3, Ce]
  C1 = central compartment concentration (mg/L)
  C2 = rapid peripheral
  C3 = slow peripheral
  Ce = effect-site concentration (brain)
"""

import numpy as np


# ─── PK/PD Parameters by patient type ────────────────────────────────────────

PATIENT_PROFILES = {
    "child": {
        "label": "Trẻ em",
        "k10": 0.119,   # min⁻¹  central elimination
        "k12": 0.114,   # min⁻¹  central → rapid periph
        "k21": 0.055,   # min⁻¹  rapid periph → central
        "k13": 0.0419,  # min⁻¹  central → slow periph
        "k31": 0.0033,  # min⁻¹  slow periph → central
        "ke0": 0.26,    # min⁻¹  effect-site equilibration
        "V1":  15.9,    # L      central volume
        "EC50": 2.8,    # mg/L   concentration at 50% effect
        "gamma": 2.0,   # Hill coefficient (steepness)
        "E0":   97.0,   # BIS at zero drug
        "Emax": 97.0,   # maximum BIS reduction
    },
    "adult": {
        "label": "Người lớn",
        "k10": 0.0443,
        "k12": 0.302,
        "k21": 0.196,
        "k13": 0.0035,
        "k31": 0.00119,
        "ke0": 0.456,
        "V1":  15.9,
        "EC50": 3.4,
        "gamma": 2.6,
        "E0":   97.0,
        "Emax": 97.0,
    },
    "elderly": {
        "label": "Người già",
        "k10": 0.0443,
        "k12": 0.196,
        "k21": 0.114,
        "k13": 0.0035,
        "k31": 0.00119,
        "ke0": 0.26,
        "V1":  20.0,
        "EC50": 2.8,
        "gamma": 2.6,
        "E0":   97.0,
        "Emax": 97.0,
    },
}


class PKPDModel:
    """
    Discrete-time 3-compartment PK/PD simulation with RK4 integration.
    """

    def __init__(self, patient_type: str = "adult", weight: float = 70.0, dt: float = 1.0):
        self.dt = dt   # seconds per step
        self.patient_type = patient_type
        self.weight = weight
        params = PATIENT_PROFILES[patient_type].copy()

        # Scale volumes by weight
        weight_ratio = weight / 70.0
        self.V1 = params["V1"] * weight_ratio

        self.k10 = params["k10"] / 60.0   # convert min⁻¹ → s⁻¹
        self.k12 = params["k12"] / 60.0
        self.k21 = params["k21"] / 60.0
        self.k13 = params["k13"] / 60.0
        self.k31 = params["k31"] / 60.0
        self.ke0 = params["ke0"] / 60.0
        self.EC50 = params["EC50"]
        self.gamma = params["gamma"]
        self.E0 = params["E0"]
        self.Emax = params["Emax"]

        # State: [C1, C2, C3, Ce]
        self.state = np.zeros(4)

    def reset(self):
        self.state = np.zeros(4)

    def _derivatives(self, state, u_rate_mgL_s):
        """
        u_rate_mgL_s: infusion rate in mg/s entering central compartment
        """
        C1, C2, C3, Ce = state
        input_conc = u_rate_mgL_s / self.V1

        dC1 = input_conc - (self.k10 + self.k12 + self.k13) * C1 + self.k21 * C2 + self.k31 * C3
        dC2 = self.k12 * C1 - self.k21 * C2
        dC3 = self.k13 * C1 - self.k31 * C3
        dCe = self.ke0 * (C1 - Ce)

        return np.array([dC1, dC2, dC3, dCe])

    def step(self, infusion_ml_hr: float, density_mg_ml: float = 10.0) -> float:
        """
        Advance one time step.
        infusion_ml_hr: pump rate in ml/hr
        Returns current BIS value.
        """
        # Convert ml/hr → mg/s
        rate_mg_s = (infusion_ml_hr * density_mg_ml) / 3600.0

        # RK4 integration
        dt = self.dt
        k1 = self._derivatives(self.state, rate_mg_s)
        k2 = self._derivatives(self.state + 0.5 * dt * k1, rate_mg_s)
        k3 = self._derivatives(self.state + 0.5 * dt * k2, rate_mg_s)
        k4 = self._derivatives(self.state + dt * k3, rate_mg_s)
        self.state += (dt / 6.0) * (k1 + 2 * k2 + 2 * k3 + k4)

        Ce = max(self.state[3], 0.0)
        return self._hill_to_bis(Ce)

    def _hill_to_bis(self, Ce: float) -> float:
        """Hill equation → BIS (0-100)"""
        if Ce <= 0:
            return self.E0
        Ce_g = Ce ** self.gamma
        EC50_g = self.EC50 ** self.gamma
        effect = Ce_g / (EC50_g + Ce_g)
        bis = self.E0 - self.Emax * effect
        return float(np.clip(bis, 0.0, 100.0))

    def get_snapshot(self) -> dict:
        """Expose the current PK/PD state for downstream clinical visualization."""
        C1, C2, C3, Ce = self.state
        bis = self._hill_to_bis(max(Ce, 0.0))
        return {
            "C1": float(max(C1, 0.0)),
            "C2": float(max(C2, 0.0)),
            "C3": float(max(C3, 0.0)),
            "Ce": float(max(Ce, 0.0)),
            "bis": float(np.clip(bis, 0.0, 100.0)),
        }


def calculate_clinical_vitals(
    bis: float,
    ce: float,
    infusion_ml_hr: float,
    patient_type: str,
    disturbance: float = 0.0,
):
    """
    Derive bedside vitals from the simulated depth of anesthesia.

    These are still simulated values, but they are generated in the backend from
    the same PK/PD state that drives BIS instead of being guessed in the frontend.
    """
    bis = float(np.clip(bis, 0.0, 100.0))
    ce = max(float(ce), 0.0)
    infusion_ml_hr = max(float(infusion_ml_hr), 0.0)

    profile_baselines = {
        "child":   {"hr": 96.0, "rr": 22.0, "spo2": 99.0, "sys": 104.0, "dia": 62.0},
        "adult":   {"hr": 78.0, "rr": 16.0, "spo2": 99.0, "sys": 118.0, "dia": 76.0},
        "elderly": {"hr": 72.0, "rr": 15.0, "spo2": 98.0, "sys": 132.0, "dia": 78.0},
    }
    base = profile_baselines[patient_type]

    sedation = np.clip((100.0 - bis) / 100.0, 0.0, 1.0)
    ce_load = np.clip(ce / 6.0, 0.0, 1.3)
    infusion_load = np.clip(infusion_ml_hr / 50.0, 0.0, 1.2)
    disturbance_load = np.clip(abs(disturbance) / 20.0, 0.0, 1.0)

    heart_rate = (
        base["hr"]
        - 26.0 * sedation
        - 10.0 * ce_load
        - 5.0 * infusion_load
        + 16.0 * disturbance_load
    )
    respiratory_rate = (
        base["rr"]
        - 8.5 * sedation
        - 4.5 * ce_load
        - 2.0 * infusion_load
        + 3.0 * disturbance_load
    )
    spo2 = (
        base["spo2"]
        - 1.2 * sedation
        - 2.0 * ce_load
        - 0.8 * infusion_load
    )
    systolic_bp = (
        base["sys"]
        - 18.0 * sedation
        - 13.0 * ce_load
        - 8.0 * infusion_load
        + 12.0 * disturbance_load
    )
    diastolic_bp = (
        base["dia"]
        - 11.0 * sedation
        - 8.0 * ce_load
        - 5.0 * infusion_load
        + 7.0 * disturbance_load
    )

    heart_rate = float(np.clip(heart_rate, 35.0, 140.0))
    respiratory_rate = float(np.clip(respiratory_rate, 4.0, 28.0))
    spo2 = float(np.clip(spo2, 88.0, 100.0))
    systolic_bp = float(np.clip(systolic_bp, 70.0, 180.0))
    diastolic_bp = float(np.clip(diastolic_bp, 35.0, 110.0))

    if bis < 20:
        state = "critical"
    elif bis < 40:
        state = "deep"
    elif bis < 60:
        state = "ideal"
    elif bis < 80:
        state = "light"
    else:
        state = "awake"

    return {
        "heart_rate": round(heart_rate, 2),
        "respiratory_rate": round(respiratory_rate, 2),
        "spo2": round(spo2, 2),
        "sys_bp": round(systolic_bp, 2),
        "dia_bp": round(diastolic_bp, 2),
        "state": state,
    }
