# Atlas Backend

FastAPI server for Metalab Atlas dashboard.

## Setup

```bash
# Install dependencies
uv sync

# Run development server
uv run uvicorn atlas.main:app --reload

# Or use the CLI
uv run metalab-atlas serve --store ../../runs/optbench

# Run tests
uv run pytest
```

## CLI

```bash
metalab-atlas serve --store ./runs --host 127.0.0.1 --port 8000 --reload
```

Options:
- `--store`: Path to metalab store directory (default: ./runs)
- `--host`: Host to bind to (default: 127.0.0.1)
- `--port`: Port to bind to (default: 8000)
- `--reload`: Enable auto-reload for development

## API Documentation

Once running, visit http://localhost:8000/docs for interactive API docs.

## Project Structure

```
atlas/
├── __init__.py
├── main.py          # FastAPI app entry point
├── cli.py           # CLI commands
├── deps.py          # Dependency injection
├── models.py        # Pydantic schemas
├── store.py         # StoreAdapter protocol + FileStoreAdapter
├── index.py         # Field indexer
├── aggregate.py     # Aggregation engine
└── routers/
    ├── runs.py      # Run list/detail endpoints
    ├── artifacts.py # Artifact endpoints
    ├── meta.py      # Field discovery
    └── aggregate.py # Aggregation endpoint
```

## Environment Variables

- `ATLAS_STORE_PATH`: Path to metalab store (default: ./runs)
