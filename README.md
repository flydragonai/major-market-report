# major-market-report

Standalone FlyDragon app that aggregates AI scoring data across a fixed
watchlist of major US real estate markets and renders a cross-market
"who's winning" report.

## What it does

Pulls every complete (non-baseline, non-archived) `client_results` row
from the score Supabase, filters to runs whose `(town_name, state)`
match the watchlist in [lib/markets.ts](./lib/markets.ts), aggregates
agents and citations across them, and renders a single page with:

- **Market pill strip** — All / per-market filter
- **Hero stats** — distinct agents, total AI mentions, #1 placements, sources cited
- **Citation mix** — donut + click-to-drill slice breakdown (lifted from
  client-reporting admin)
- **Agent leaderboard** — top 25, ranked by mentions, ties broken by
  Top 3 → #1 → name

The leaderboard is content-agnostic: it tallies every ranked agent the
LLMs returned for queries in those markets, including FlyDragon clients
and their competitors. The Highlights-layout-style report at the
agent-pool level.

## Tracked markets

15 in v1, defined in [lib/markets.ts](./lib/markets.ts):

Manhattan, LA, Chicago, Houston, Dallas, Austin, Phoenix, Miami,
Atlanta, Seattle, Denver, Boston, Washington DC, San Francisco,
Nashville.

6 of those (Seattle, Denver, Boston, DC, Nashville, NYC-ish via FL
clients) already have FlyDragon clients running scoring, so they have
live data immediately. The rest start empty until either a client in
that market exists OR market-only scoring is wired up (deferred).

## Cadence

Monthly. The app itself doesn't schedule runs — it only reads. The
scoring backend (`live-ai-visibility-score`) is what produces
`client_results` rows, on whatever schedule each client is set to.

For market-only runs (no real client to anchor to), the cleanest path
is to create a synthetic "market client" per watchlist entry in the
score Supabase and schedule monthly runs. Not built yet — when
ready, just add the synthetic clients and they'll flow into this
report automatically.

## Auth

Single-secret bearer-token gate. Set `ADMIN_TOKEN` in env; the
unauthorized page accepts the token and sets a 30-day cookie. Same
shape as the score app's admin gate. If `ADMIN_TOKEN` is unset
(e.g. local dev), the gate is open.

## Setup

```bash
npm install
cp .env.example .env.local
# Fill in MMR_SUPABASE_URL, MMR_SUPABASE_KEY, ADMIN_TOKEN
npm run dev
```

Then open http://localhost:3000.

## Not-built-yet

- Per-market sub-pages (`/markets/[slug]`) — the pill filter on the
  main page already covers this; deferred until there's a need
- CSV export
- Time series — current view is a snapshot, not "who climbed/dropped
  last month"
- Market-only scoring runs (see Cadence above)
