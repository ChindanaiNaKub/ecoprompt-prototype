# EcoPrompt team task board

## How to use this board

Create one GitHub issue for each unchecked item below. Assign the listed owner, use the issue title as written, and link the dependency issue before starting work. Work is split across all four members; no one person owns the whole app.

**Deadlines:** core live app by **14 September**; feature-complete app and report evidence by **25 September**.

## Kirana — project lead, integration, and ethics

- [ ] **P0 — Configure deployment and ethical safeguards** — due 10 Sep
  - Create the Supabase project, configure Email magic-link Auth, permitted redirect URLs, and GitHub Pages build variables.
  - Create one Groq Free Plan account, add `GROQ_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` only as Supabase Edge Function secrets, then enable Groq Zero Data Retention.
  - Follow [docs/SETUP.md](docs/SETUP.md); never commit keys.
  - Depends on: none.
  - Done when: a teammate can sign in from the deployed site and secrets are absent from browser code/repository.

- [ ] **P0 — Integrate, deploy, and run the release gate** — due 14 Sep
  - Merge verified work, deploy database migration and Edge Function, run the full demo flow on GitHub Pages, and document known free-tier limits.
  - Review privacy copy, error states, keyboard navigation, and mobile layout.
  - Depends on: Titipon P0 backend, Chindanai P0 dashboard, Atiwit methodology.
  - Done when: sign-in → estimate → real response → actual usage works in production without exposing a secret.

- [ ] **P1 — Final ethics/accessibility/report integration** — due 25 Sep
  - Turn research and testing findings into final-report evidence; document autonomy, fairness, privacy, security, and estimation limitations.
  - Depends on: all P1 work and testing results.

## Chindanai — frontend and UX

- [ ] **P0 — Connect dashboard to magic-link sign-in and live Groq flow** — due 13 Sep
  - Use `src/lib/supabase.ts` and `src/lib/live.ts`; add sign-in/sign-out, live/demo status, complexity override, prompt-storage consent, loading, and quota/error states.
  - Replace simulated response only when a signed-in live backend is configured; preserve a clearly labeled local demo fallback.
  - Depends on: Titipon P0 backend contract.
  - Done when: actual response tokens and post-response carbon estimate replace the pre-send estimate.

- [ ] **P1 — Private history and prompt deletion UI** — due 18 Sep
  - Show only the signed-in user’s metadata history. Make prompt storage per-request opt-in and add delete-saved-text control.
  - Depends on: Titipon P0 schema/RLS.

- [ ] **P1 — Quests, badges, and browser-only chat context** — due 20 Sep
  - Implement all five quests, badge display, and a minimal current-session conversation where users can remove old turns before sending.
  - Do not persist conversation responses or context by default.
  - Depends on: Titipon quest persistence contract.

- [ ] **P1 — Dual-model comparison and leaderboard UI** — due 22 Sep
  - Require acknowledgement before a dual run, show both outputs/actual estimates, and show only eligible opted-in efficient users.
  - Depends on: Titipon P1 comparison and leaderboard API.

## Titipon — backend and estimation integration

- [ ] **P0 — Deploy and verify Supabase schema, Auth, and RLS** — due 11 Sep
  - Deploy `supabase/migrations/202609090001_ecoprompt.sql` and verify users can read only their own records.
  - Validate profile creation, prompt-text deletion, daily allowance, and leaderboard RPC permissions.
  - Depends on: Kirana’s Supabase project.

- [ ] **P0 — Deploy and verify the Groq Edge Function** — due 12 Sep
  - Deploy `supabase/functions/execute-prompt`; verify JWT validation, Groq Chat Completions, fixed output caps, 20 normal/3 dual daily allowance, metadata-only writes, and useful 429 errors.
  - Depends on: Kirana’s Groq key and Supabase secrets; deployed migration.

- [ ] **P1 — Persist quests and implement dual-run/leaderboard backend** — due 21 Sep
  - Add atomic quest/badge updates after saved request events, linked dual-run records, and an eligible-user leaderboard query ranked by right-size adherence.
  - Depends on: P0 backend.

## Atiwit — research, testing, and report evidence

- [ ] **P0 — Publish carbon-estimation methodology** — due 10 Sep
  - Replace provisional model coefficients with a cited, versioned methodology for the three Groq-hosted models; state Thailand grid assumption, central ranges, formula, uncertainty, and source links.
  - Give Titipon the final coefficients/version and Chindanai short in-app explanation copy.
  - Depends on: none.

- [ ] **P1 — Run usability study and prepare findings** — due 23 Sep
  - Run five think-aloud sessions and a ten-person anonymous SE-student survey.
  - Measure task completion, estimate-vs-actual comprehension, user control over recommendations, privacy clarity, quota-error clarity, and leaderboard fairness.
  - Depends on: deployed P1 app.

## Shared working agreement

- Make a branch per issue; open a pull request to `main` with screenshots or test evidence.
- Do not change another owner’s files without telling them in the issue/PR.
- Run `bun run build` before requesting review.
- Treat provider/model availability and all carbon values as estimates; never claim exact emissions or unlimited free usage.
