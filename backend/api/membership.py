"""
GET  /api/membership          — get all MF data
PUT  /api/membership          — update one MF parameter
GET  /api/membership/rules    — get rule base
PUT  /api/membership/rules    — update one rule
"""

from fastapi import APIRouter
from models.schemas import MembershipUpdateRequest, RuleUpdateRequest
from fuzzy.controller import get_flc

router = APIRouter()


@router.get("/membership")
def get_membership():
    return get_flc().get_mf_data()


@router.put("/membership")
def update_membership(req: MembershipUpdateRequest):
    flc = get_flc()
    flc.update_mf(req.variable, req.term, req.center, req.sigma)
    return {"status": "ok", "updated": req.dict()}


@router.get("/membership/rules")
def get_rules():
    return {"rules": get_flc().get_rules()}


@router.put("/membership/rules")
def update_rule(req: RuleUpdateRequest):
    flc = get_flc()
    flc.update_rule(req.error_term, req.delta_term, req.output_term)
    return {"status": "ok"}
