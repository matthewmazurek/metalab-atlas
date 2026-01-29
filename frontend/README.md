# Atlas Frontend

React frontend for MetaLab Atlas dashboard.

## Setup

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build
```

## Configuration

Create a `.env.local` file to configure the API URL:

```
VITE_API_URL=http://localhost:8000
```

## Project Structure

```
src/
├── api/
│   ├── client.ts    # Axios client
│   ├── types.ts     # TypeScript interfaces
│   └── hooks.ts     # React Query hooks
├── components/
│   ├── ui/          # shadcn components
│   ├── layout/      # Layout components
│   ├── runs/        # Run table components
│   ├── plots/       # Plot builder components
│   ├── detail/      # Run detail components
│   └── compare/     # Compare components
├── pages/
│   ├── RunsPage.tsx
│   ├── RunDetailPage.tsx
│   ├── PlotsPage.tsx
│   └── ComparePage.tsx
├── store/
│   └── useAtlasStore.ts  # Zustand UI state
├── lib/
│   └── utils.ts
├── App.tsx
├── main.tsx
└── index.css
```

## Stack

- React 18 + TypeScript
- Vite
- Tailwind CSS v4
- shadcn/ui components
- React Query (server state)
- Zustand (UI state only)
- ECharts
- React Router
