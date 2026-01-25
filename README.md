# Metalab Atlas

Dashboard for exploring and visualizing [metalab](../metalab) experiment runs.

## Features (planned)

- **Run table**: filter, sort, and search across experiments
- **Plot builder**: Y vs X with grouping, faceting, and aggregation
- **Run detail**: metrics, artifacts browser, logs viewer
- **Compare runs**: overlay metrics, diff provenance

## Stack

- **Backend**: FastAPI + Uvicorn
- **Frontend**: React + Vite + TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **Charts**: ECharts

## Development

```bash
# Backend
cd backend
uv sync
uv run uvicorn atlas.main:app --reload

# Frontend
cd frontend
npm install
npm run dev
```

## License

MIT
