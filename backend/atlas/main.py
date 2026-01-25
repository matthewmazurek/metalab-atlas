"""
FastAPI application for Metalab Atlas.

Run with:
    uvicorn atlas.main:app --reload

Or using the CLI:
    metalab-atlas serve --store ./runs
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from atlas.routers import (
    aggregate_router,
    artifacts_router,
    meta_router,
    runs_router,
)

app = FastAPI(
    title="Metalab Atlas",
    description="Dashboard API for exploring metalab experiment runs",
    version="0.1.0",
)

# CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default
        "http://localhost:3000",  # Alternative
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(runs_router)
app.include_router(artifacts_router)
app.include_router(meta_router)
app.include_router(aggregate_router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "metalab-atlas"}


@app.get("/api/health")
async def health():
    """API health check."""
    from atlas.deps import get_store_path

    store_path = get_store_path()
    return {
        "status": "healthy",
        "store_path": str(store_path),
        "store_exists": store_path.exists(),
    }
