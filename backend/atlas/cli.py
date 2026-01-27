"""
CLI entry point for Metalab Atlas.

Usage:
    metalab-atlas serve --store ./runs --port 8000
    metalab-atlas serve --remote user@hpc:/path/to/runs --port 8000
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
    default=None,
    help="Path to local metalab store directory",
    type=click.Path(exists=False),
)
@click.option(
    "--remote",
    default=None,
    help="Remote store URL (ssh://user@host/path or user@host:/path)",
)
@click.option(
    "--ssh-key",
    default=None,
    help="Path to SSH private key for remote connections",
    type=click.Path(exists=True),
)
@click.option(
    "--cache-dir",
    default=None,
    help="Local cache directory for remote stores",
    type=click.Path(),
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
    remote: str | None,
    ssh_key: str | None,
    cache_dir: str | None,
    host: str,
    port: int,
    reload: bool,
):
    """Start the Atlas dashboard server.

    Examples:

        # Local store
        metalab-atlas serve --store ./runs

        # Remote store via SSH
        metalab-atlas serve --remote user@hpc.cluster.edu:/scratch/runs

        # Remote with SSH key
        metalab-atlas serve --remote ssh://user@host/path --ssh-key ~/.ssh/id_rsa
    """
    import uvicorn

    # Validate options
    if store and remote:
        raise click.UsageError("Cannot specify both --store and --remote")

    if not store and not remote:
        store = "./runs"  # Default to local

    # Check if bundled frontend exists
    static_dir = Path(__file__).parent / "static"
    has_frontend = (static_dir / "index.html").exists()

    click.echo("Starting Metalab Atlas...")

    if remote:
        # Remote store mode
        os.environ["ATLAS_STORE_PATH"] = remote

        if ssh_key:
            os.environ["ATLAS_SSH_KEY"] = str(Path(ssh_key).expanduser())

        if cache_dir:
            os.environ["ATLAS_CACHE_DIR"] = str(Path(cache_dir).resolve())

        click.echo(f"  Remote store: {remote}")
        click.echo(f"  Mode: remote (SSH/SFTP)")

        if ssh_key:
            click.echo(f"  SSH key: {ssh_key}")
        else:
            click.echo(f"  SSH key: (using ssh-agent or default keys)")

        if cache_dir:
            click.echo(f"  Cache dir: {cache_dir}")
        else:
            click.echo(f"  Cache dir: (system temp)")

    else:
        # Local store mode
        from atlas.store import discover_stores, is_valid_store

        store_path = Path(store).resolve()
        os.environ["ATLAS_STORE_PATH"] = str(store_path)

        click.echo(f"  Store path: {store_path}")

        if not store_path.exists():
            click.echo(f"  Warning: Store path does not exist", err=True)
            click.echo(
                "  The server will start but no runs will be available.", err=True
            )
        else:
            stores = discover_stores(store_path)
            if len(stores) == 0:
                click.echo(f"  Warning: No valid experiment stores found", err=True)
            elif len(stores) == 1 and is_valid_store(store_path):
                click.echo(f"  Mode: single store")
            else:
                click.echo(
                    f"  Mode: multi-store ({len(stores)} experiments discovered)"
                )
                for s in stores:
                    rel_path = s.relative_to(store_path) if s != store_path else "."
                    click.echo(f"    - {rel_path}")

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
