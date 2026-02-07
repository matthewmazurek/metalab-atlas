"""
FastAPI application for MetaLab Atlas.

Run with:
    uvicorn atlas.main:app --reload

Or using the CLI:
    metalab-atlas serve --store ./runs
"""

import json
import logging
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response

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
    artifacts_router,
    experiments_router,
    field_values_router,
    meta_router,
    runs_router,
    search_router,
)

# Path to bundled static files
STATIC_DIR = Path(__file__).parent / "static"

app = FastAPI(
    title="MetaLab Atlas",
    description="Dashboard API for exploring metalab experiment runs",
    version="0.1.0",
)

# CORS for local frontend development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default
        "http://localhost:5175",  # redesign-chartmogul
        "http://localhost:3000",  # Alternative
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5175",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PrettyJSONMiddleware:
    """Pure ASGI middleware to pretty-print JSON responses when ?pretty=true is passed."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # Check for ?pretty=true in query string
        query_string = scope.get("query_string", b"").decode()
        if "pretty=true" not in query_string:
            await self.app(scope, receive, send)
            return

        # Intercept response to pretty-print JSON
        response_started = False
        response_headers = []
        response_status = 200
        body_parts = []
        content_type = ""

        async def send_wrapper(message):
            nonlocal response_started, response_headers, response_status, content_type

            if message["type"] == "http.response.start":
                response_started = True
                response_status = message["status"]
                response_headers = list(message.get("headers", []))
                # Extract content-type
                for name, value in response_headers:
                    if name.lower() == b"content-type":
                        content_type = value.decode()
                        break
                # Don't send yet - wait to see if we need to modify
                return

            elif message["type"] == "http.response.body":
                body = message.get("body", b"")
                more_body = message.get("more_body", False)
                body_parts.append(body)

                if not more_body:
                    # Complete response - check if JSON and pretty-print
                    full_body = b"".join(body_parts)

                    if "application/json" in content_type:
                        try:
                            data = json.loads(full_body)
                            full_body = json.dumps(
                                data, indent=2, ensure_ascii=False
                            ).encode()
                            # Update content-length header
                            response_headers = [
                                (name, value)
                                for name, value in response_headers
                                if name.lower() != b"content-length"
                            ]
                            response_headers.append(
                                (b"content-length", str(len(full_body)).encode())
                            )
                        except (json.JSONDecodeError, UnicodeDecodeError):
                            pass  # Keep original body

                    # Now send the response
                    await send(
                        {
                            "type": "http.response.start",
                            "status": response_status,
                            "headers": response_headers,
                        }
                    )
                    await send(
                        {
                            "type": "http.response.body",
                            "body": full_body,
                            "more_body": False,
                        }
                    )

        await self.app(scope, receive, send_wrapper)


app.add_middleware(PrettyJSONMiddleware)

# Include API routers (search first so /api/search is matched before the SPA catch-all)
app.include_router(search_router)
app.include_router(runs_router)
app.include_router(artifacts_router)
app.include_router(meta_router)
app.include_router(field_values_router)
app.include_router(experiments_router)


@app.get("/api/health")
async def health():
    """API health check."""
    from atlas.deps import get_store_path

    store_path = get_store_path()
    path_obj = Path(store_path)
    return {
        "status": "healthy",
        "store_path": store_path,
        "store_exists": path_obj.exists(),
    }


# Serve static files if the bundled frontend exists
if STATIC_DIR.exists():
    # Mount static assets (JS, CSS, etc.)
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")

    # Serve index.html for all non-API routes (SPA fallback)
    @app.get("/{full_path:path}")
    async def serve_spa(request: Request, full_path: str):
        """Serve the SPA for all non-API routes."""
        # Don't intercept API routes - let FastAPI handle those
        if full_path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
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
            <head><title>MetaLab Atlas</title></head>
            <body style="font-family: system-ui; padding: 2rem;">
                <h1>MetaLab Atlas API</h1>
                <p>The API is running. No bundled frontend found.</p>
                <p>For development, run the frontend separately:</p>
                <pre>cd frontend && npm run dev</pre>
                <p><a href="/docs">API Documentation</a></p>
            </body>
            </html>
            """,
            status_code=200,
        )
