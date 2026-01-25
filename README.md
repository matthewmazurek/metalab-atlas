# Metalab Atlas

Dashboard for exploring and visualizing [metalab](../metalab) experiment runs.

## Features

- **Run Table**: Filter, sort, and search across experiments with pagination
- **Plot Builder**: Y vs X plots with grouping, faceting, and replicate aggregation
- **Run Detail**: View params, metrics, artifacts (with preview), and logs
- **Compare Runs**: Side-by-side comparison with diff highlighting

## Quick Start

### 1. Start the Backend

```bash
cd backend
uv sync
uv run metalab-atlas serve --store ../../runs/optbench --port 8000
```

Or directly with uvicorn:

```bash
cd backend
ATLAS_STORE_PATH=../../runs/optbench uv run uvicorn atlas.main:app --reload
```

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173

## Stack

- **Backend**: FastAPI + Uvicorn + Pydantic
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS v4 + shadcn/ui
- **Charts**: ECharts
- **State**: React Query (server) + Zustand (UI)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/runs` | GET | List runs with filtering/pagination |
| `/api/runs/{run_id}` | GET | Get run details |
| `/api/runs/{run_id}/artifacts` | GET | List artifacts |
| `/api/runs/{run_id}/artifacts/{name}` | GET | Download artifact |
| `/api/runs/{run_id}/artifacts/{name}/preview` | GET | Safe artifact preview |
| `/api/runs/{run_id}/logs/{name}` | GET | Get log content |
| `/api/meta/fields` | GET | Discover available fields |
| `/api/meta/experiments` | GET | List experiments |
| `/api/aggregate` | POST | Compute aggregated plot data |

## Architecture

The dashboard uses a namespaced data model:

- `record.*`: Core run fields (run_id, status, timestamps, provenance)
- `params.*`: Resolved experiment parameters (inputs)
- `metrics.*`: Captured metrics (outputs)

This enables clean sweep plots like `Y=metrics.best_f` vs `X=params.dim` without requiring users to duplicate params into metrics.

## License

MIT
