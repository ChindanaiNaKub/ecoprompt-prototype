# EcoPrompt Prototype

**Live demo:** https://chindanainakub.github.io/ecoprompt-prototype/

**Course:** Ethics and Professionalism for Software Engineers (953420) · Group 13

Throwaway interactive prototype for the course milestone. Not production.

## What it shows

1. **Carbon & token estimator** — live estimate from prompt + model
2. **Comparison pop-up** — right-size recommendation with Switch / Keep
3. **Quests, badges, efficient-user leaderboard** — light gamification

No real AI API calls. All carbon figures are **estimates**.

## Demo path (~2 min)

1. Click **Simple + large** → **Estimate & send** → comparison pop-up
2. Click **Switch & continue** → quest progress updates
3. Click **Complex + small** → upsizing suggestion

## Local run

```bash
bun install
bun run dev
```

## Stack

Vue 3 + Vite + TypeScript + Bun · GitHub Pages
