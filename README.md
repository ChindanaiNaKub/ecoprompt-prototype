# EcoPrompt

**Live demo:** https://chindanainakub.github.io/ecoprompt-prototype/

**Course:** Ethics and Professionalism for Software Engineers (953420), Group 13

EcoPrompt is a Vue dashboard that makes the hidden resource cost of an AI request visible at
the moment a person chooses a prompt and model. It teaches carbon-aware prompting and model
right-sizing through estimates, transparent uncertainty, user control, and light gamification.

EcoPrompt does **not** measure a provider's exact emissions. The application reports provider
token usage when a live request succeeds, then applies a documented sensitivity model to estimate
an operational carbon range. This distinction is central to the project's ethics and must not be
changed into a claim of measured emissions.

## What a user sees

The main dashboard displays:

- A prompt editor, selected model, and complexity choice: auto, simple, moderate, or complex.
- A pre-send carbon scenario showing central, low, and high grams of modelled CO2e.
- Predicted input, output, and total tokens before sending.
- Detected task complexity, reasons for the classification, suggested model, and whether the
	selected model is a fit.
- A comparison prompt when the selected model appears too large for a simple/moderate task or
	too small for a complex task.
- A response plus provider-reported input/output/total token counts after a live request.
- A modelled carbon range calculated from the tokens actually reported by the provider.
- Optional comparison results from two different models, with an explicit acknowledgement that
	the comparison consumes an additional model run.

The interface labels predicted tokens, provider-reported tokens, demo values, and modelled
carbon separately. In local demo mode, no provider is called and the response and usage are
simulated. Live mode requires Supabase configuration, authentication, and a deployed Edge Function.

## Complete prompt flow

1. The user writes a prompt and selects a model.
2. `classifyComplexity` scores the text using length, simple-task hints, complex-task hints,
	 structure, and code-like patterns. It returns `simple`, `moderate`, or `complex` plus human-
	 readable reasons. The user can override the detected result.
3. `recommend` maps the selected complexity to a preferred tier: small for simple, medium for
	 moderate, and large for complex. It prefers the same provider where possible.
4. `estimateRequest` predicts tokens, energy, and carbon for the current and suggested model.
5. If the model is mismatched, the user can **Switch and continue** or **Keep current model**.
	 The recommendation never blocks the original choice. For learning, the user can also compare
	 both models after acknowledging the extra run.
6. In live mode, the browser sends the request to the Supabase Edge Function. The server validates
	 the authenticated user and payload, calls the selected Groq model or models, and returns the
	 provider response and usage values.
7. The request outcome records task complexity, model choice, recommendation decision, token
	 counts, carbon range, context clearing, batching, and consent metadata. Quest progress and
	 badges are updated atomically on the server.

## How carbon and token values work

### Before sending

The local estimator uses a deliberately simple, inspectable token approximation:

`estimated input tokens = ceil(trimmed prompt characters / 4)`

The expected output is selected from the complexity class: 80 tokens for simple, 256 for
moderate, and 512 for complex tasks. The pre-send total is input plus expected output.

### After a live response

Groq returns `prompt_tokens`, `completion_tokens`, and `total_tokens`. These are the authoritative
usage values shown for that completed request; they are not electricity measurements and they do
not reveal the provider's carbon intensity.

EcoPrompt then calculates a modelled range using:

`modelled CO2e (g) = tokens / 1,000 x scenario Wh per 1,000 tokens x grid intensity`

The current grid factor is `0.475 gCO2e/Wh`. Each model has low, central, and high energy
scenarios. The current methodology version is `2026-09-sensitivity-v1`. The low/central/high
values communicate uncertainty caused by unknown hardware, batching, utilization, data-center
overhead, model architecture, and electricity location. They are not Groq measurements.

When a user switches from a recommended model, the dashboard tracks the positive difference
between the original and switched model's central scenario and estimated tokens. These are
modelled avoided values, not verified environmental savings. Values are never presented as exact
carbon emissions.

See [methodology and limitations](docs/METHODOLOGY.md) for assumptions, validation rules, and
sources.

## Models and right-sizing

The prototype exposes three model tiers through a single Groq-backed function:

| Tier | Display model | Intended task fit |
| --- | --- | --- |
| Small | Llama 3 8B | Focused transforms and simple requests |
| Medium | Mixtral 8x7B | General explanation and moderate work |
| Large | Llama 3 70B | Coding, architecture, and multi-step reasoning |

The classifier is a heuristic, not an AI evaluator and not a guarantee of answer quality. A
complexity override is provided because the user may understand their task better than the rules.
The system can recommend a larger model for complex work; it does not treat the smallest model as
automatically ethical or universally correct.

## Learning and dashboard features

- **Quests:** right-size streak, prompt efficiency, batching, model comparison, and context
	management.
- **Badges:** Right-Sizer, Lean Prompter, Batcher, Comparer, and Context Master.
- **History:** private request metadata and modelled ranges; prompt text is opt-in per request.
- **Leaderboard:** only positive efficiency results from opted-in users with at least ten requests;
	there is no public "wasteful user" ranking.
- **Optional study:** consented pre/post quiz, one model-selection task, privacy clarity rating,
	and quota understanding. The study stores an account UUID, not an exported email or prompt text.
- **Context controls:** recent conversation turns stay in browser memory, can be removed, and can
	be cleared before a request. Clearing stores only the fact that context was cleared.

## Software ethics implemented

### Transparency and epistemic honesty

The UI distinguishes estimates from provider facts, shows the methodology version, exposes the
reason for a recommendation, and links to the methodology document. A range is used instead of
false precision. This addresses the information gap created when AI providers show an answer but
do not explain the request's resource cost.

### Autonomy and informed choice

The comparison pop-up informs rather than forces. Users can keep the current model, override the
complexity classification, compare models knowingly, or decline prompt storage. The app records a
decision so a recommendation is not mistaken for user consent.

### Privacy and data minimization

Prompt storage is off by default and controlled per request. Conversation content is retained only
in browser memory. Saved prompt text can be deleted while non-content metadata remains. Study data
is pseudonymous at the application layer, and profile/usage data is protected by Supabase RLS.

### Security and least privilege

Provider and service-role keys stay server-side. The Edge Function requires a valid JWT, validates
model IDs, modes, complexity values, UUIDs, prompt length, and dual-model rules, and applies daily
allowances of 20 single requests and 3 dual runs per user. CORS is restricted to the deployed site
and local development origin. Database writes use a server-side RPC and owner-scoped policies.

### Fairness and non-shaming design

The recommendation engine accounts for task complexity and can upsize when a small model is
inappropriate. The leaderboard rewards positive behavior only and excludes negative ranking or
public waste scores. This avoids treating users with genuinely difficult work as unethical because
their model needs are different.

### Environmental responsibility without greenwashing

EcoPrompt makes resource responsibility actionable while explicitly documenting uncertainty. It
does not claim that one prompt has a universally exact carbon value, and it avoids real-world
equivalences such as phone charging. Any future methodology update should record its source,
assumptions, units, version, and review date.

### Accessibility, explainability, and contestability

Recommendations include readable reasons, visible status values, and a manual override. This gives
users a way to understand, challenge, and correct an incorrect classification instead of silently
accepting an opaque automated decision.

### Research ethics and accountability

The optional study requires consent, uses pre/post questions, records privacy clarity and quota
understanding, and treats the small faculty sample as a limitation rather than a representative
claim. Daily quotas, provider rate-limit failures, and the absence of fallback models are surfaced
instead of hidden.

## Proposal alignment and current limitations

Implemented proposal goals include the estimator, transparent comparison flow, right-sizing,
quests/badges, opt-in positive leaderboard, protected live API path, methodology write-up, and
ethical study flow.

The following limitations remain important for a truthful project report:

- Complexity detection is a rules-based heuristic and can misclassify ambiguous prompts.
- Pre-send token counts are approximations; live token counts are available only after a provider
	response.
- Carbon values are modelled scenarios based on third-party-informed assumptions, not provider
	telemetry or measured emissions.
- The current provider function uses Groq, while the UI's friendly model names represent the
	prototype's tiered model catalog. Provider model IDs are returned separately for transparency.
- There is no provider fallback when Groq is unavailable or rate-limited.
- The repository's automated tests cover pure logic and backend contracts. They do not replace a
	deployed Supabase test with real JWT, RLS, quota, CORS, provider, and deletion checks.
- Before a production release, verify the Supabase column names used by account hydration against
	the final migrations. The current codebase has legacy naming differences between the original
	schema and the release migration around quest and request-history fields.

## Run locally

```bash
bun install
bun run dev
bun test
bun run build
```

The local app can demonstrate the estimator and mock response without public variables. Live
requests require `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, a deployed `execute-prompt`
function, magic-link authentication, and server-side `GROQ_API_KEY` plus
`SUPABASE_SERVICE_ROLE_KEY`. Never place provider or service-role keys in Vite environment files.

Follow [deployment setup](docs/SETUP.md). Apply migrations in order:

1. `supabase/migrations/202609090001_ecoprompt.sql`
2. `supabase/migrations/202609090002_methodology_and_study.sql`
3. `supabase/migrations/202609100003_release_completion.sql`

## Verification status

The repository currently passes 52 Bun tests and `bun run build`. Deployed Supabase/Groq behavior
still needs manual verification with a test account, including JWT rejection, daily limits, 429
handling, prompt-consent storage, prompt deletion, RLS isolation, CORS, and dual comparison
linkage.

## Stack

Vue 3 + Vite + TypeScript + Bun + Supabase Edge Functions + Groq · GitHub Pages
