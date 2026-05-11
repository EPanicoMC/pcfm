from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from .routers import allocations, assumptions, dashboard, forecast, imports, projects

app = FastAPI(title="PCFM API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(imports.router)
app.include_router(projects.router)
app.include_router(forecast.router)
app.include_router(dashboard.router)
app.include_router(assumptions.router)
app.include_router(allocations.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── SPA fallback: serve React build in produzione ─────────────────────────────
_dist = Path(__file__).resolve().parents[3] / "apps" / "web" / "dist"


@app.get("/{full_path:path}", include_in_schema=False)
async def spa_fallback(full_path: str):
    if not _dist.exists():
        return {"detail": "Frontend non ancora buildato. Esegui: make build"}
    candidate = _dist / full_path
    if candidate.is_file():
        return FileResponse(str(candidate))
    return FileResponse(str(_dist / "index.html"))
