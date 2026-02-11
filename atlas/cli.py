"""
CLI entry point for MetaLab Atlas.

Usage:
    metalab-atlas serve --store postgresql://user@localhost:5432/metalab --port 8000
    metalab-atlas serve --discover /path/to/file_root
"""

from __future__ import annotations

import os
from pathlib import Path

import click


@click.group()
def main():
    """MetaLab Atlas - Dashboard for exploring experiment runs."""
    pass


@main.command()
@click.option(
    "--store",
    default=None,
    help="PostgreSQL connection URL (postgresql://user@host:port/db)",
)
@click.option(
    "--discover",
    default=None,
    help="Auto-discover store connection from bundle.json at given path",
    type=click.Path(exists=True),
)
@click.option(
    "--file-root",
    default=None,
    help="Root directory for files (logs, artifacts). Optional; enables content serving.",
    type=click.Path(exists=True),
)
@click.option(
    "--host",
    default="127.0.0.1",
    help="Host to bind to",
)
@click.option(
    "--port",
    default=8000,
    help="Port to bind to",
    type=int,
)
@click.option(
    "--reload",
    is_flag=True,
    help="Enable auto-reload for development",
)
def serve(
    store: str | None,
    discover: str | None,
    file_root: str | None,
    host: str,
    port: int,
    reload: bool,
):
    """Start the Atlas dashboard server.

    Atlas requires a PostgreSQL backend for query operations.

    Examples:

        # PostgreSQL store
        metalab-atlas serve --store postgresql://user@localhost:5432/metalab

        # With filesystem access for artifacts/logs
        metalab-atlas serve --store postgresql://... --file-root /path/to/experiments

        # Auto-discover from service bundle
        metalab-atlas serve --discover /path/to/file_root
    """
    import uvicorn

    from atlas.deps import is_postgres_url

    # Handle --discover mode
    if discover:
        import json

        bundle_path = Path(discover) / "services" / "bundle.json"
        if not bundle_path.exists():
            click.echo(f"Error: No bundle.json found at {bundle_path}", err=True)
            click.echo(
                "Run 'metalab services up' first to provision services.", err=True
            )
            raise SystemExit(1)

        bundle_data = json.loads(bundle_path.read_text())
        discovered_store = bundle_data.get("store_locator")
        if not discovered_store:
            click.echo("Error: bundle.json has no store_locator", err=True)
            raise SystemExit(1)

        if store:
            click.echo("Warning: --discover overrides --store", err=True)
        store = discovered_store

        # Use discover path as file_root if not explicitly set
        if not file_root:
            file_root = discover

        click.echo(f"Discovered store: {store}")

    # Validate: must have a store
    if not store:
        click.echo(
            "Error: --store is required (PostgreSQL URL). "
            "Example: --store postgresql://user@localhost:5432/metalab",
            err=True,
        )
        raise SystemExit(1)

    # Validate: must be a Postgres URL
    if not is_postgres_url(store):
        click.echo(
            f"Error: --store must be a PostgreSQL URL, got: {store}",
            err=True,
        )
        click.echo(
            "Atlas requires a PostgreSQL backend. "
            "Example: --store postgresql://user@localhost:5432/metalab",
            err=True,
        )
        raise SystemExit(1)

    # Check if bundled frontend exists
    static_dir = Path(__file__).parent / "static"
    has_frontend = (static_dir / "index.html").exists()

    click.echo("Starting MetaLab Atlas...")

    # Set environment variables for the app
    os.environ["ATLAS_STORE_PATH"] = store

    if file_root:
        os.environ["ATLAS_FILE_ROOT"] = str(Path(file_root).resolve())

    # Parse connection string for display
    from urllib.parse import urlparse

    parsed = urlparse(store)
    db_name = parsed.path.lstrip("/") if parsed.path else "metalab"
    host_port = f"{parsed.hostname or 'localhost'}:{parsed.port or 5432}"

    click.echo(f"  PostgreSQL: {host_port}/{db_name}")
    if file_root:
        click.echo(f"  File root: {file_root}")
    else:
        click.echo(f"  File root: (not set - artifact/log content unavailable)")

    if has_frontend:
        click.echo(f"  Dashboard: http://{host}:{port}")
    else:
        click.echo(f"  API only: http://{host}:{port}")
        click.echo(f"  (No bundled frontend - run frontend dev server separately)")
    click.echo(f"  API docs: http://{host}:{port}/docs")
    click.echo()

    uvicorn.run(
        "atlas.main:app",
        host=host,
        port=port,
        reload=reload,
    )


if __name__ == "__main__":
    main()
