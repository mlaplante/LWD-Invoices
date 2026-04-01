# Feature D: Global Search (Cmd+K)

## Summary

A command palette (Cmd+K / Ctrl+K) that searches across invoices, clients, projects, expenses, and tickets — plus quick actions like "New Invoice" and "Go to Settings."

## Architecture

Single `search.global` tRPC procedure that runs parallel Prisma queries. Quick actions filtered client-side from a static list. Uses shadcn/ui Command component (built on cmdk).

## Design

### Backend: search.global procedure

- Input: `{ query: string }` (min 2 chars)
- Parallel Prisma queries: invoices (number, client name), clients (name, email), projects (name), expenses (supplier name, notes), tickets (subject)
- Max 5 results per category
- Returns `{ invoices, clients, projects, expenses, tickets }`

### Frontend: CommandPalette component

- shadcn Command component (cmdk)
- Opens on Cmd+K / Ctrl+K (global keydown listener)
- Input at top, results grouped by category
- Quick actions (static, client-side filtered): New Invoice, New Client, New Project, New Expense, Settings, Team, Reports
- Debounced tRPC query (300ms)
- Selecting a result navigates via router.push()

### Integration

- Render in dashboard layout (always mounted, hidden until triggered)
- Search icon button in top bar for discoverability

## Data changes

None — query-only.

## Files

- `src/server/routers/search.ts` — new router
- `src/server/routers/_app.ts` — register router
- `src/components/layout/CommandPalette.tsx` — palette component
- `src/app/(dashboard)/layout.tsx` — mount palette + keyboard shortcut
