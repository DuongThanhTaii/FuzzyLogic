from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.simulate import router as sim_router
from api.membership import router as mf_router
from api.ws_simulate import router as ws_router

app = FastAPI(title="Fuzzy Anesthesia API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(sim_router, prefix="/api")
app.include_router(mf_router,  prefix="/api")
app.include_router(ws_router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
