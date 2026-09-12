# EcoPrompt — UX/UI upgrade board

## Goal

Upgrade the prototype's UX and UI so it is more beautiful and easier to use for everyone, following the approved sketch: a header with user profile chip, tab navigation (**Quest · Leaderboard · Study Progress**), a prominent **CO₂ released** centerpiece, a chat-style prompt composer with Send + model select, and a "Suggest:" hint row.

## Working rules

- Create one GitHub issue per checkbox below. The person named first is the owner; the named support person reviews, pairs, or unblocks that issue.
- Run `bun run build` before asking for review.
- Do not break the verified backend contract: modelled carbon wording is **low/central/high modelled scenarios, never measured Groq emissions**. Preserve all consent, quota, and privacy behaviors while restyling.
- Keep `src/App.vue` and `src/style.css` working at every commit; prefer small, composable components under `src/components/`.

## Task 1 — Design system and layout shell

- [ ] **Extract design tokens and restructure the app shell** — owner: **Kirana**; support: Atiwit; due **12 Sep**
  - Formalize tokens in `src/style.css`: type scale, spacing scale, color states (ok / warn / hot), focus rings, radii, elevation.
  - Restructure `App.vue` layout: header with EcoPrompt wordmark + user name/avatar chip (sign-in state), and a tab navigation bar replacing the sidebar rail: **Quest · Leaderboard · Study Progress**.
  - Mobile-first responsive behavior: tabs collapse cleanly, gauge and composer stack, touch targets ≥ 44px.
  - Done when: every current screen is reachable through tabs, no feature is lost versus the rail layout, and keyboard navigation works across the tab bar.

## Task 2 — Prompt composer redesign

- [ ] **Chat-style composer with Send, model select, and suggestions** — owner: **Kirana**; support: Chindanai (composer state logic); due **13 Sep**
  - Large prompt box with an attached **Send** button and a compact **model select** pill beside it (same behavior as the current selects; no new request contract fields).
  - Add a **"Suggest:"** hint row with one-click prompt suggestions (reuse existing sample simple/complex prompts plus 2–3 new neutral examples).
  - Design all states: empty, typing, sending (inline progress, disabled controls), provider error, 429 quota message, and response streaming/loaded.
  - Keep complexity override and per-request prompt-storage consent visible but visually secondary (toggle/accordion, not clutter).
  - Done when: the existing demo path (Simple + large → Estimate & send → Switch & continue → Complex + small) still works with no regression, and every state is reachable without a console error.

## Task 3 — CO₂ released centerpiece

- [ ] **Prominent CO₂ released card with range visualization** — owner: **Atiwit**; support: Kirana; due **13 Sep**
  - Redesign the current gauge into a headline **"CO₂ released"** card: big central number, low/central/high band visualized on one track, and the meter position for the current model.
  - Add an at-a-glance before/after row when a recommendation exists: current model vs recommended model central estimate.
  - Keep methodology-safe copy: "modelled operational scenario", methodology version, link to `docs/METHODOLOGY.md`; never label modelled values as measured emissions.
  - Done when: the approved copy from the methodology board is displayed verbatim, the card reads correctly on mobile, and `aria-live` announcement remains polite and non-repetitive.

## Task 4 — Quest, Leaderboard, and Study Progress tab views

- [ ] **Turn the three rail blocks into full tab screens** — owner: **Atiwit**; support: Titipon (RPC/RLS questions); due **13 Sep**
  - **Quest tab:** quest cards with progress bars, earned badges, and clear locked/complete states; badge award moments visually celebrated once.
  - **Leaderboard tab:** styled ranked table rendering only `get_efficiency_leaderboard()` results (positive-only ranking, no raw events); highlight the signed-in user's row.
  - **Study Progress tab:** study invitation, pre/post question flow, and completion summary restyled as a guided card sequence.
  - Design empty, loading (skeleton), error, and signed-out states for all three tabs.
  - Done when: no raw events or negative rankings can appear, private history and privacy controls remain reachable (Settings area of the profile chip), and contrast/labels pass a keyboard + screen-reader walkthrough.

## Task 5 — Polish, accessibility, and release QA

- [ ] **Comparison modal, micro-interactions, and cross-device pass** — owner: **Kirana**; support: **Atiwit**; due **14 Sep**
  - Restyle the comparison pop-up (Switch / Keep / dual acknowledgement) with consistent modal styling, focus trap, and Escape-to-close.
  - Add restrained motion only: state transitions under 200ms, all gated behind `prefers-reduced-motion`.
  - Full accessibility sweep: contrast ratios, visible focus, form labels, error announcements, reduced-motion behavior.
  - Verify on the deployed GitHub Pages build across desktop + mobile widths; attach before/after screenshots to the release evidence.
  - Done when: `bun test` passes, `bun run build` deploys clean, and the full demo path is smooth for a fresh signed-in user.

## Dependencies and order

1. Task 1 first — Tasks 2–4 build on the shell and tokens.
2. Tasks 2, 3, 4 run in parallel on separate components once the shell merges.
3. Task 5 last — polish only after all tabs are functional.

## Ownership boundaries for this board

| Person | Owns | Must not become a bottleneck for |
|---|---|---|
| Kirana | design tokens, app shell, composer, modal, release QA | copy wording or methodology values |
| Atiwit | CO₂ card, tab content screens, copy + accessibility review | backend or deployment work |

## Daily checkpoint

- **12 Sep:** shell + tabs merged; composer redesign underway.
- **13 Sep:** CO₂ card and all three tab screens functional; copy approved.
- **14 Sep:** polish, accessibility sweep, deployed verification, screenshots captured.
