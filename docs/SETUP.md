# EcoPrompt deployment setup

1. Create a Supabase project, then run migrations in filename order: `202609090001_ecoprompt.sql`,
   `202609090002_methodology_and_study.sql`, and `202609100003_release_completion.sql`.
2. Enable Email magic-link authentication. Add `http://localhost:5173` and the GitHub Pages URL to Supabase Auth redirect URLs.
3. Add `GROQ_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` as Edge Function secrets. Never add either to a Vite environment file.
4. In Groq Data Controls, enable Zero Data Retention. Do not enable batch or fine-tuning features for this project.
5. Deploy `execute-prompt`, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the GitHub Pages build environment.

## Privacy and request behavior

`execute-prompt` accepts one or two validated model IDs. Single requests are limited to 20 per user
per day; dual requests are limited to 3. Dual requests require two distinct models and return a
shared comparison ID. Provider usage is reported separately from the low/central/high modelled
carbon scenario. There is no provider fallback.

Prompt storage is off by default and decided per request. A stored prompt can be removed later with
the private `delete_saved_prompt` RPC; deleting it leaves non-content metadata. Conversation turns
are retained only in browser memory, can be removed individually or cleared before sending, and
only the `context_cleared` marker is persisted. Profiles, request history, quest progress, and badges
are private under RLS. The leaderboard is an aggregate RPC restricted to opted-in users with
positive right-size results.

Study sessions are consented and pseudonymous at the application layer: the database stores the
authenticated account UUID rather than exporting email. It records pre/post scores, task
completion, initial/final model, recommendation acceptance, privacy clarity, and quota understanding;
it does not export prompt text.

## Local verification

```bash
bun test
bun run build
```

This repository has no local Deno or Supabase CLI. Run deployed Supabase/Groq checks manually with a
test account, including JWT rejection, request limits, 429 handling, prompt-storage consent, RLS
isolation, and dual result linkage.

The frontend can run without these public variables as a clearly labeled local demonstration. Live requests require a signed-in user and deployed function.
