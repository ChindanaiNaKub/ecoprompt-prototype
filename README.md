# EcoPrompt Prototype

**Live demo:** https://chindanainakub.github.io/ecoprompt-prototype/

**Course:** Ethics and Professionalism for Software Engineers (953420) · Group 13

Interactive course prototype for teaching transparent, carbon-aware model selection. It does not measure provider emissions.

## What it shows

1. **Provider tokens + modelled carbon range** — a pre-send scenario and provider-reported token usage after live requests
2. **Comparison pop-up** — right-size recommendation with Switch / Keep, or an acknowledged dual run
3. **Private history, quests, badges, and efficient-user leaderboard** — opt-in persistence and light gamification

Live requests use Groq through a Supabase Edge Function when configured. Carbon figures are low/central/high modelled operational scenarios, not measured Groq emissions. See [methodology and limitations](docs/METHODOLOGY.md).

## Demo path (~2 min)

1. Click **Simple + large** → **Estimate & send** → comparison pop-up
2. Click **Switch & continue** → quest progress updates
3. Click **Complex + small** → upsizing suggestion

## Live deployment

GitHub Pages hosts the Vue app. Supabase provides magic-link authentication, data storage, and the protected Groq function. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as GitHub repository variables; keep Groq and service-role keys only in Supabase secrets. Follow [deployment setup](docs/SETUP.md).

## Local run

```bash
bun install
bun run dev
bun test
bun run build
```

## Request contract

The browser sends `prompt`, `modelId`, `mode`, detected and selected complexity, recommendation
decision metadata, per-request `storePrompt`, `contextCleared`, and retained browser-memory
conversation turns to the `execute-prompt` Supabase Edge Function. `mode: "dual"` requires a
different `comparisonModelId` and one acknowledgement in the UI. The function validates the JWT,
enforces 20 single requests / 3 dual requests per day, calls only the selected Groq model(s), and
returns each result's `providerModelId`, input/output/total provider token counts, and low/central/high
modelled carbon range. A shared `comparisonId` links dual events.

The append-only migrations run in filename order: `202609090001_ecoprompt.sql`,
`202609090002_methodology_and_study.sql`, then `202609100003_release_completion.sql`. The final
migration adds request metadata, study completion fields, and the atomic `record_request_outcome`
RPC, which writes private events and idempotently updates quests/badges. Deploy all three before
deploying `execute-prompt`.

Prompt text is never stored unless its individual request checkbox is enabled. History, quests,
badges, and profiles are read through owner RLS; leaderboard rows come only from opted-in users with
at least ten requests and a positive right-size rate. Conversation context stays in browser memory,
and clearing it sends only a boolean event marker—not the discarded turns.

Supabase/Groq verification is manual in this workspace because no local Deno or Supabase CLI is
available. Verify secrets, JWTs, Groq usage parsing, RLS isolation, and 429 behavior after deploy.

## Stack

Vue 3 + Vite + TypeScript + Bun · GitHub Pages
