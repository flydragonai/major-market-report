# Major Market Report — migrations

Three migrations stand up the schema this app expects. Apply in order.

## Tables

| File | Table | Purpose |
|---|---|---|
| `0001_mmr_markets.sql` | `mmr_markets` | Registry of tracked markets — seeds the 15 starter rows on first apply |
| `0002_mmr_runs.sql` | `mmr_runs` | One row per (market × scheduled_for) scoring run |
| `0003_mmr_responses.sql` | `mmr_responses` | One row per (run × model × query) — ranked agents + citations + raw response |

No FKs to `clients` / `locations`. Market data is self-contained — the
"no customer-data pollution" rule from the design conversation.

## Where to apply

Either Supabase project works — they only use standard PG features:

- **Prod** (recommended) — aligns with the broader plan to move customer
  reporting tables there too. The scoring backend would then write to
  prod for market runs, score for legacy customer runs (during migration).
- **Score** — single-DB simplicity until the broader migration. Easier
  on the scoring backend.

Pick once; the migration files are identical either way.

## Apply via Supabase MCP

```
mcp__supabase__apply_migration name=0001_mmr_markets query=<paste 0001 file>
mcp__supabase__apply_migration name=0002_mmr_runs    query=<paste 0002 file>
mcp__supabase__apply_migration name=0003_mmr_responses query=<paste 0003 file>
```

The seed `INSERT` in 0001 uses `ON CONFLICT DO NOTHING`, so re-applying
is safe.

## Apply via psql

```
psql "$DATABASE_URL" -f 0001_mmr_markets.sql
psql "$DATABASE_URL" -f 0002_mmr_runs.sql
psql "$DATABASE_URL" -f 0003_mmr_responses.sql
```

## RLS

Each table is RLS-enabled with a single `authenticated_read_*` policy —
any signed-in user can read. Writes happen via the scoring backend's
service-role key, which bypasses RLS automatically.

If the app eventually has signed-in viewers other than internal
operators, tighten the policies then.

## What's NOT in these migrations (deferred)

- **Snapshots table** — for "this month vs last month" climbed/dropped
  storytelling. Computable on the fly from `mmr_responses`. Materialize
  later if read perf demands.
- **Job-queue table** — the scoring backend can drive the monthly
  fire-off from its existing job system; no new queue table needed here.
- **Network benchmark / "vs avg"** — same as customer reporting,
  computed in TS from the underlying rows. No table needed.
