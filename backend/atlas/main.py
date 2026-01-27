"""
FastAPI application for Metalab Atlas.

Run with:
    uvicorn atlas.main:app --reload

Or using the CLI:
    metalab-atlas serve --store ./runs
"""

import logging
from pathlib import Path

from fastapi import FastAPI, Request

# Configure logging to show INFO level for atlas modules
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
# Reduce noise from other libraries
logging.getLogger("uvicorn").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

from atlas.routers import (
    aggregate_router,
    artifacts_router,
    meta_router,
    runs_router,
)

# Path to bundled static files
STATIC_DIR = Path(__file__).parent / "static"

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

# Include API routers
app.include_router(runs_router)
app.include_router(artifacts_router)
app.include_router(meta_router)
app.include_router(aggregate_router)


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


# Serve static files if the bundled frontend exists
if STATIC_DIR.exists():
    # Mount static assets (JS, CSS, etc.)
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # Serve index.html for all non-API routes (SPA fallback)
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve the SPA for all non-API routes."""
        # Check if it's a static file request
        file_path = STATIC_DIR / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        # Return index.html for SPA routing
        return FileResponse(STATIC_DIR / "index.html")
else:
    # No bundled frontend - show helpful message
    @app.get("/")
    async def root():
        """Show message when no frontend is bundled."""
        return HTMLResponse(
            content="""
            <html>
            <head><title>Metalab Atlas</title></head>
            <body style="font-family: system-ui; padding: 2rem;">
                <h1>Metalab Atlas API</h1>
                <p>The API is running. No bundled frontend found.</p>
                <p>For development, run the frontend separately:</p>
                <pre>cd frontend && npm run dev</pre>
                <p><a href="/docs">API Documentation</a></p>
            </body>
            </html>
            """,
            status_code=200,
        )
