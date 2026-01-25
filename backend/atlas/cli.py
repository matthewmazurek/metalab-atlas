"""
CLI entry point for Metalab Atlas.

Usage:
    metalab-atlas serve --store ./runs --port 8000
"""

from __future__ import annotations

import os
from pathlib import Path

import click


@click.group()
def main():
    """Metalab Atlas - Dashboard for exploring experiment runs."""
    pass


@main.command()
@click.option(
    "--store",
    default="./runs",
    help="Path to metalab store directory",
    type=click.Path(exists=False),
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
def serve(store: str, host: str, port: int, reload: bool):
    """Start the Atlas dashboard server."""
    import uvicorn

    # Resolve store path
    store_path = Path(store).resolve()
    if not store_path.exists():
        click.echo(f"Warning: Store path does not exist: {store_path}", err=True)
        click.echo("The server will start but no runs will be available.", err=True)

    # Set environment variable for the app
    os.environ["ATLAS_STORE_PATH"] = str(store_path)

    click.echo(f"Starting Metalab Atlas...")
    click.echo(f"  Store: {store_path}")
    click.echo(f"  Server: http://{host}:{port}")
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
