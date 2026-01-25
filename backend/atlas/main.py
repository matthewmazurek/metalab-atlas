"""
FastAPI application for Metalab Atlas.

Run with:
    uvicorn atlas.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Metalab Atlas",
    description="Dashboard API for exploring metalab experiment runs",
    version="0.1.0",
)

# CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # Vite default
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "service": "metalab-atlas"}


@app.get("/api/health")
async def health():
    """API health check."""
    return {"status": "healthy"}
