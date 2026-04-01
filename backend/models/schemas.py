from pydantic import BaseModel
from typing import Literal, Optional


class PatientParams(BaseModel):
    weight: float = 70.0       # kg
    age: float = 35.0          # years
    gender: Literal["male", "female"] = "male"
    patient_type: Literal["child", "adult", "elderly"] = "adult"


class SimulationRequest(BaseModel):
    patient: PatientParams
    scenario: Literal["robustness", "disturbance", "overdose", "resistance", "induction"] = "robustness"
    duration: float = 30.0     # minutes
    disturbance_time: float = 10.0   # minutes (Scenario 2)
    disturbance_amplitude: float = 15.0  # BIS units noise amplitude


class MembershipUpdateRequest(BaseModel):
    variable: Literal["error", "delta_error", "infusion_rate"]
    term: str
    center: float
    sigma: float


class RuleUpdateRequest(BaseModel):
    error_term: str
    delta_term: str
    output_term: str
