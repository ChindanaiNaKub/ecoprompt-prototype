# EcoPrompt Prototype

**Live demo:** https://chindanainakub.github.io/ecoprompt-prototype/

**Course:** Ethics and Professionalism for Software Engineers (953420) · Group 13

Interactive course prototype for teaching transparent, carbon-aware model selection. It does not measure provider emissions.

## What it shows

1. **Provider tokens + modelled carbon range** — a pre-send scenario and provider-reported token usage after live requests
2. **Comparison pop-up** — right-size recommendation with Switch / Keep
3. **Quests, badges, efficient-user leaderboard** — light gamification

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
```

## Stack

Vue 3 + Vite + TypeScript + Bun · GitHub Pages
