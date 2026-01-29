# MetaLab Atlas

Dashboard for exploring and visualizing [metalab](../metalab) experiment runs.

## Features

- **Run Table**: Filter, sort, and search across experiments with pagination
- **Plot Builder**: Y vs X plots with grouping, faceting, and replicate aggregation
- **Run Detail**: View params, metrics, artifacts (with preview), and logs
- **Compare Runs**: Side-by-side comparison with diff highlighting
- **Remote Stores**: Access experiment results on HPC clusters via SSH/SFTP

## Quick Start

### Local Store

```bash
cd backend
uv sync
uv run metalab-atlas serve --store /path/to/runs
```

### Remote Store (SSH)

Access experiment results on a remote machine (e.g., HPC cluster) without copying data:

```bash
# Using scp-style syntax
uv run metalab-atlas serve --remote user@hpc.cluster.edu:/scratch/runs

# Using SSH URL syntax
uv run metalab-atlas serve --remote ssh://user@host/path/to/runs

# With explicit SSH key
uv run metalab-atlas serve --remote user@host:/path --ssh-key ~/.ssh/id_rsa

# With custom local cache directory
uv run metalab-atlas serve --remote user@host:/path --cache-dir ./cache
```

Remote stores use local caching for performance:
- Run records cached with 60s TTL
- Artifacts cached locally on first access (1hr TTL)
- SSH agent and default keys supported automatically

### Frontend Development

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
