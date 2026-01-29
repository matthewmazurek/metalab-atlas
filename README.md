# MetaLab Atlas

Dashboard for exploring and visualizing [metalab](https://github.com/matthewmazurek/metalab) experiment runs.

## Features

- **Runs Table**: Filter, sort, and search across experiments with pagination and field-based filtering
- **Plot Builder**: Y vs X plots with grouping, faceting, replicate aggregation, and error bars
- **Histograms**: Visualize value distributions across runs
- **Run Detail**: View params, metrics, artifacts (with preview), and logs
- **Compare Runs**: Side-by-side comparison with diff highlighting
- **Experiment Manifests**: Browse experiment configuration history
- **Derived Metrics**: Access post-hoc computed metrics alongside captured metrics
- **Multi-Store Discovery**: Automatically aggregate runs from multiple experiment stores
- **Remote Stores**: Access experiment results on HPC clusters via SSH/SFTP with local caching

## Installation

Atlas is included in the metalab repository. Install dependencies with:

```bash
cd atlas
uv sync
```

Or install as a package:

```bash
pip install metalab-atlas
```

## Quick Start

### Local Store

```bash
# Serve a local experiment store
uv run metalab-atlas serve --store /path/to/runs

# Or use the default ./runs directory
uv run metalab-atlas serve
```

Then open http://localhost:8000

### Multi-Store Mode

Point Atlas at a parent directory containing multiple experiment stores:

```bash
uv run metalab-atlas serve --store /path/to/experiments
```

Atlas automatically discovers nested stores up to 2 levels deep and aggregates all runs.

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

For frontend development with hot reload:

```bash
cd frontend
npm install
npm run dev
```

Then open http://localhost:5173 (API requests proxy to the backend)

## Configuration

### CLI Options

| Option | Description | Default |
|--------|-------------|---------|
| `--store` | Path to local metalab store directory | `./runs` |
| `--remote` | Remote store URL (`ssh://user@host/path` or `user@host:/path`) | - |
| `--ssh-key` | Path to SSH private key | ssh-agent |
| `--cache-dir` | Local cache directory for remote stores | system temp |
| `--host` | Host to bind to | `127.0.0.1` |
| `--port` | Port to bind to | `8000` |
| `--reload` | Enable auto-reload for development | `false` |

### Environment Variables

The CLI sets these environment variables for the server:

- `ATLAS_STORE_PATH`: Path to the store (local or remote URL)
- `ATLAS_SSH_KEY`: Path to SSH private key (remote mode)
- `ATLAS_CACHE_DIR`: Local cache directory (remote mode)

## API Reference

### Runs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/runs` | GET | List runs with filtering, sorting, pagination |
| `/api/runs/{run_id}` | GET | Get run details |

### Artifacts & Logs

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/runs/{run_id}/artifacts` | GET | List artifacts for a run |
| `/api/runs/{run_id}/artifacts/{name}` | GET | Download artifact |
| `/api/runs/{run_id}/artifacts/{name}/preview` | GET | Get safe artifact preview |
| `/api/runs/{run_id}/logs` | GET | List available logs |
| `/api/runs/{run_id}/logs/{name}` | GET | Get log content |

### Metadata & Discovery

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/meta/fields` | GET | Discover available fields (params, metrics, derived) |
| `/api/meta/experiments` | GET | List experiments with run counts |
| `/api/meta/refresh` | POST | Refresh store discovery (pick up new experiments) |
| `/api/health` | GET | Health check |

### Experiments & Manifests

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/experiments/{id}/manifests` | GET | List manifest versions |
| `/api/experiments/{id}/manifests/latest` | GET | Get latest manifest |
| `/api/experiments/{id}/manifests/{timestamp}` | GET | Get specific manifest |

### Aggregation & Visualization

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/aggregate` | POST | Compute aggregated plot data with grouping |
| `/api/histogram` | POST | Compute binned value distributions |

All endpoints support `?pretty=true` for formatted JSON output.

## Architecture

### Namespaced Data Model

The dashboard uses a namespaced data model for clean field access:

- `record.*`: Core run fields (`run_id`, `status`, `started_at`, `duration_ms`, `provenance`, etc.)
- `params.*`: Resolved experiment parameters (inputs)
- `metrics.*`: Captured metrics (outputs)
- `derived.*`: Post-hoc computed metrics

This enables sweep plots like `Y=metrics.best_f` vs `X=params.dim` without requiring users to duplicate params into metrics.

### Store Discovery

Atlas supports three modes:

1. **Single Store**: Point directly at a valid metalab store (has `_meta.json`)
2. **Multi-Store**: Point at a parent directory; Atlas discovers all nested stores up to 2 levels deep
3. **Remote Store**: Access stores on remote machines via SSH/SFTP

### Field Index

The `/api/meta/fields` endpoint returns a field index with:

- Field names and inferred types (`numeric`, `string`, `boolean`)
- Value counts and ranges for numeric fields
- Unique values for categorical fields (up to 100)

This powers the filter dropdowns and plot axis selectors.

## Development

### Backend

```bash
cd atlas

# Install dependencies
uv sync

# Run with auto-reload
uv run metalab-atlas serve --store ../runs --reload

# Or run uvicorn directly
uv run uvicorn atlas.main:app --reload
```

### Frontend

```bash
cd atlas/frontend

# Install dependencies
npm install

# Development server with hot reload
npm run dev

# Type checking
npm run lint

# Production build
npm run build
```

### Building for Production

Build the frontend and copy static files:

```bash
cd atlas/frontend
npm run build

# Copy built files to backend static directory
cp -r dist/* ../atlas/static/
```

The backend serves the bundled frontend automatically when static files are present.

## Tech Stack

**Backend**
- FastAPI + Uvicorn
- Pydantic v2
- Paramiko (SSH/SFTP)
- NumPy

**Frontend**
- React 19 + TypeScript
- Vite 7
- Tailwind CSS v4 + shadcn/ui (Radix primitives)
- ECharts 6
- TanStack Query v5 (server state)
- TanStack Table v8
- Zustand v5 (UI state)

## License

MIT
