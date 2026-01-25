# Atlas Backend

FastAPI server for Metalab Atlas dashboard.

## Setup

```bash
# Install dependencies
uv sync

# Run development server
uv run uvicorn atlas.main:app --reload

# Run tests
uv run pytest
```

## API Endpoints (planned)

- `GET /api/runs` - List runs with filtering
- `GET /api/runs/{run_id}` - Get run details
- `GET /api/runs/{run_id}/artifacts` - List artifacts for a run
- `GET /api/artifacts` - Stream artifact content
- `GET /api/runs/{run_id}/logs/{name}` - Get log content
