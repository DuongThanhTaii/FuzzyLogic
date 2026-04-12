"""
Mamdani Fuzzy Logic Controller for Closed-loop Anesthesia
Inputs:  e  (BIS error)      — 5 terms: NB, NS, Z, PS, PB
         de (delta-error)    — 3 terms: N, Z, P
Output:  u  (infusion rate ml/hr) — 4 terms: Z, S, M, L
Membership functions: Gaussian
"""

import numpy as np
import skfuzzy as fuzz
from skfuzzy import control as ctrl
from typing import Dict, Any

# ─── Default Gaussian MF parameters: (center, sigma) ────────────────────────

DEFAULT_MF = {
    "error": {
        "NB": (-40, 12),
        "NS": (-20, 10),
        "Z":  (  0,  8),
        "PS": ( 20, 10),
        "PB": ( 40, 12),
    },
    "delta_error": {
        "N": (-5, 2.5),
        "Z": ( 0, 2),
        "P": ( 5, 2.5),
    },
    "infusion_rate": {
        "Z": ( 0,   1.8),
        "S": (10,   3.0),
        "M": (19,   4.0),
        "L": (28,   3.8),
    },
}

# ─── Rule base: (error_term, delta_term) → output_term ──────────────────────

DEFAULT_RULES = [
    # e = 50 - BIS  →  NB means BIS very HIGH (awake), PB means BIS very LOW (overdose)
    # de/dt = d(50-BIS)/dt = -dBIS/dt  →  N means BIS rising (lighter), P means BIS falling (deeper)

    # NB (e≈-40): BIS≈90, patient AWAKE → pump maximum drug
    ("NB", "N", "L"),   # awake + BIS still rising    → emergency: maximum
    ("NB", "Z", "L"),   # awake + stable              → large dose
    ("NB", "P", "M"),   # awake + BIS falling (deeper)→ moderate (already responding)

    # NS (e≈-20): BIS≈70, slightly light → pump moderate
    ("NS", "N", "M"),   # slightly light + getting lighter → moderate
    ("NS", "Z", "M"),   # slightly light + stable          → moderate
    ("NS", "P", "S"),   # slightly light + getting deeper  → slow (already converging)

    # Z  (e≈0):  BIS≈50, IDEAL zone → maintain slow drip
    ("Z",  "N", "M"),   # ideal + getting lighter → bump up slightly
    ("Z",  "Z", "S"),   # ideal + stable          → slow maintenance
    ("Z",  "P", "Z"),   # ideal + getting deeper  → stop (will recover)

    # PS (e≈+20): BIS≈30, slightly deep → reduce/stop
    ("PS", "N", "S"),   # slightly deep + getting lighter → slow (recovering)
    ("PS", "Z", "Z"),   # slightly deep + stable          → stop
    ("PS", "P", "Z"),   # slightly deep + getting deeper  → stop

    # PB (e≈+40): BIS≈10, OVERDOSE → stop pump immediately (safety)
    ("PB", "N", "Z"),   # overdose + getting lighter → stop
    ("PB", "Z", "Z"),   # overdose + stable          → stop
    ("PB", "P", "Z"),   # overdose + getting deeper  → stop (critical)
]


class MamdaniFLC:
    def __init__(self, mf_params: Dict = None, rules: list = None):
        self.mf_params = mf_params or DEFAULT_MF
        self.rules_def = rules or DEFAULT_RULES
        self._build()

    def _build(self):
        # Define universes
        e_universe   = np.linspace(-50, 50, 1000)
        de_universe  = np.linspace(-10, 10, 1000)
        u_universe   = np.linspace(0, 30, 1000)

        # Antecedents / Consequent
        self.e_ant  = ctrl.Antecedent(e_universe,  "error")
        self.de_ant = ctrl.Antecedent(de_universe, "delta_error")
        self.u_con  = ctrl.Consequent(u_universe,  "infusion_rate", defuzzify_method="centroid")

        # Membership functions — Gaussian
        for term, (c, s) in self.mf_params["error"].items():
            self.e_ant[term] = fuzz.gaussmf(e_universe, c, s)

        for term, (c, s) in self.mf_params["delta_error"].items():
            self.de_ant[term] = fuzz.gaussmf(de_universe, c, s)

        for term, (c, s) in self.mf_params["infusion_rate"].items():
            self.u_con[term] = fuzz.gaussmf(u_universe, c, s)

        # Build rules
        rule_objects = []
        for e_t, de_t, u_t in self.rules_def:
            rule_objects.append(
                ctrl.Rule(self.e_ant[e_t] & self.de_ant[de_t], self.u_con[u_t])
            )

        self.ctrl_sys = ctrl.ControlSystem(rule_objects)
        self.sim = ctrl.ControlSystemSimulation(self.ctrl_sys)

    def compute(self, error: float, delta_error: float) -> float:
        """Returns infusion rate (ml/hr), clamped to [0, 30]."""
        e_clipped  = float(np.clip(error,       -50, 50))
        de_clipped = float(np.clip(delta_error, -10, 10))
        try:
            self.sim.input["error"]       = e_clipped
            self.sim.input["delta_error"] = de_clipped
            self.sim.compute()
            rate = float(self.sim.output["infusion_rate"])
            return float(np.clip(rate, 0.0, 30.0))
        except Exception:
            return 0.0

    def update_mf(self, variable: str, term: str, center: float, sigma: float):
        """Hot-update one MF parameter and rebuild the controller."""
        self.mf_params[variable][term] = (center, sigma)
        self._build()

    def get_mf_data(self) -> Dict[str, Any]:
        """Return all MF parameters for the frontend editor."""
        result = {}
        universes = {
            "error":         np.linspace(-50, 50, 300).tolist(),
            "delta_error":   np.linspace(-10, 10, 300).tolist(),
            "infusion_rate": np.linspace(0, 30, 300).tolist(),
        }
        for var, terms in self.mf_params.items():
            universe = np.array(universes[var])
            result[var] = {
                "universe": universes[var],
                "terms": {}
            }
            for term, (c, s) in terms.items():
                result[var]["terms"][term] = {
                    "center": c,
                    "sigma": s,
                    "values": fuzz.gaussmf(universe, c, s).tolist(),
                }
        return result

    def get_rules(self) -> list:
        return [
            {"error": e, "delta_error": de, "output": u}
            for e, de, u in self.rules_def
        ]

    def update_rule(self, error_term: str, delta_term: str, output_term: str):
        for i, (e, de, u) in enumerate(self.rules_def):
            if e == error_term and de == delta_term:
                self.rules_def[i] = (error_term, delta_term, output_term)
                break
        self._build()


# Singleton shared across API
_flc_instance = None


def get_flc() -> MamdaniFLC:
    global _flc_instance
    if _flc_instance is None:
        _flc_instance = MamdaniFLC()
    return _flc_instance
