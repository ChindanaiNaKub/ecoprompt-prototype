# EcoPrompt — 14 September delivery board

## Delivery rule

**Every proposed feature must be working in the deployed app by 14 September.** This board deliberately shares difficult work across the team. Do not wait for one person to finish an entire layer before another starts.

Create one GitHub issue per checkbox below. The person named first is the owner; the named support person reviews, pairs, or unblocks that issue. Run `bun run build` before asking for review.

## What “complete” means on 14 September

- A signed-in user sends a real prompt to Groq, sees a pre-send modeled range and post-response provider-reported token usage, and can keep or switch models.
- Prompt storage is opt-in; metadata history is private; saved prompt text can be deleted.
- All five quests, badges, browser-only context clearing, opt-in dual-model comparison, and positive-only leaderboard are usable—not mock data.
- Groq/Supabase secrets remain server-side; the deployed GitHub Pages app handles loading, sign-in, quota, and provider-error states.
- Carbon claims use low/central/high modelled scenarios with a methodology version; they never claim measured Groq emissions.

## Critical path — start 9 September

### 1. Kirana + Titipon — Provision and prove the live platform

- [ ] **Configure Supabase, Groq, GitHub Pages variables, and data controls** — owner: Kirana; support: Titipon; due **9 Sep**
  - Create Supabase project; enable magic-link Auth; add local and GitHub Pages redirect URLs.
  - Create Groq Free account; enable Zero Data Retention; add `GROQ_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` only as Supabase Function secrets.
  - Put only `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` into GitHub Actions build variables.
  - Done when: no secret appears in the repository/browser, and a test user receives a magic link.

- [ ] **Deploy schema and Groq Edge Function; prove one real request** — owner: Titipon; support: Kirana; due **10 Sep**
  - Deploy `supabase/migrations/202609090001_ecoprompt.sql` and `execute-prompt`.
  - Verify JWT validation, Groq response/usage parsing, 20 normal + 3 dual daily limits, 429 message, RLS isolation, and metadata-only writes.
  - Done when: a curl/browser test creates a private request event with real provider token counts.

### 2. Chindanai + Kirana — Build the live user journey in parallel

- [ ] **Core dashboard: sign-in, estimate, override, switch/keep, and live response** — owner: Chindanai; support: Kirana; due **11 Sep**
  - Connect `src/lib/supabase.ts` and `src/lib/live.ts` to the existing dashboard.
  - Add magic-link sign-in/sign-out, configured/demo state, complexity override, prompt-storage consent, loading state, and useful provider/quota errors.
  - Show actual input/output tokens and post-response carbon after a live send; preserve local demo fallback only when no public Supabase configuration exists.
  - Depends on: Task 1 infrastructure; backend contract from Task 2.

- [ ] **Private history and public leaderboard screens** — owner: Kirana; support: Chindanai; due **12 Sep**
  - Add private event history, delete-saved-prompt action, display-name edit, and leaderboard opt-in control.
  - Render `get_efficiency_leaderboard()` results only; never expose raw events or a negative ranking.
  - Depends on: Task 2 schema/RLS; can use static UI fixtures until function deploy completes.

### 3. Titipon + Chindanai — Finish persistence and learning features

- [ ] **Persist quests, badges, dual runs, and leaderboard eligibility** — owner: Titipon; support: Chindanai; due **12 Sep**
  - Extend the Edge Function/database path so completed requests atomically update quest progress and award one badge per quest.
  - Store linked dual-run events and expose safe progress/leaderboard reads through RLS/RPC.
  - Done when: progress survives refresh, prompt text remains absent without consent, and users cannot read another user’s events.
  - Depends on: Task 2.

- [ ] **Comparison experiment and browser-only context controls** — owner: Chindanai; support: Titipon; due **12 Sep**
  - Add explicit acknowledgement before a dual-model request, side-by-side outputs and actual usage, plus clear 429/failure behavior.
  - Keep current conversation in browser memory only; let users remove earlier turns before a request and record only the context-cleared event.
  - Depends on: Task 2; coordinate payload fields with Task 5.

### 4. Atiwit — unblock methodology and make the release defensible

- [ ] **Publish methodology values and in-app transparency copy** — owner: Atiwit; support: Kirana; due **10 Sep**
  - Triangulate at least two sources, then supply a versioned low/central/high coefficient table for the three selected Groq models, Thailand grid factor, formula, uncertainty statement, and citation links.
  - Supply short UI copy for “estimate,” provider processing, prompt-storage consent, dual-run extra impact, and quota limits.
  - Done when: Titipon has final constants/version and Chindanai can display the approved language.

- [ ] **Run a compact acceptance study and capture evidence** — owner: Atiwit; support: all; due **13 Sep**
  - Run five consented pseudonymous pre/post sessions using the in-app three-question study flow.
  - Record task completion, pre/post knowledge score, initial/final model selection, recommendation acceptance, privacy clarity, and quota-error understanding; export no email or prompt text.
  - Done when: findings and screenshots are ready for the submission/report.

## Final integration and release

- [ ] **Full-team release rehearsal** — owner: Kirana; support: everyone; due **13 Sep**
  - Test the exact demo: sign in → simple prompt/large model → switch → real response/actual estimate → quest/badge → history → opt-in dual comparison → leaderboard.
  - Fix only release-blocking failures: secrets, login, request execution, persistence, mobile/keyboard blockers, misleading estimate labels, or claims of measured emissions.

- [ ] **Deploy and submit working app** — owner: Kirana; support: everyone; due **14 Sep**
  - Verify GitHub Pages production build, Supabase Function, and public demo link on a fresh browser session.
  - Attach screenshots, methodology source link, and known free-tier limitations to the submission.

## Ownership boundaries

| Person | Owns | Must not become a bottleneck for |
|---|---|---|
| Kirana | setup, deployment, release QA, history/leaderboard UI | core dashboard implementation |
| Chindanai | core dashboard, comparison, chat-context UI | Supabase deployment or research values |
| Titipon | schema, Edge Function, quest/badge persistence | visual styling and report copy |
| Atiwit | methodology, consent/explanation copy, testing evidence | backend implementation |

## Daily checkpoint

- **9 Sep:** accounts/secrets configured; methodology values delivered; migration/function deployment started.
- **10 Sep:** one real Groq request is persisted; dashboard integration underway.
- **11 Sep:** complete signed-in core flow works on a preview/deployed URL.
- **12 Sep:** history, quests/badges, context clearing, dual run, and leaderboard work together.
- **13 Sep:** rehearsal, user checks, only release blockers fixed.
- **14 Sep:** production verification and submission.
