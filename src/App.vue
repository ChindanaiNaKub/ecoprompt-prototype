<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { MODELS, type ModelId } from './lib/models'
import { recommend, type Recommendation } from './lib/recommend'
import {
  formatCarbon,
  formatCarbonRange,
  formatTokens,
  percentSaved,
} from './lib/estimate'
import {
  demoLeaderboard,
  initialGamification,
  onComparisonSeen,
  onRequestComplete,
  type GamificationState,
} from './lib/quests'
import { beginStudy, finishStudy, scoreStudy, type StudyAnswers } from './lib/study'

const prompt = ref(
  'Translate this sentence to Thai: Software engineers should consider environmental impact.',
)
const modelId = ref<ModelId>('gpt-oss-120b')
const game = ref<GamificationState>(initialGamification())
const showCompare = ref(false)
const lastRec = ref<Recommendation | null>(null)
const reply = ref<string | null>(null)
const toast = ref<string | null>(null)
const studySessionId = ref<string | null>(null)
const studyConsent = ref(false)
const preAnswers = ref<Partial<StudyAnswers>>({})
const postAnswers = ref<Partial<StudyAnswers>>({})
const studyBusy = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null

const liveEstimate = computed(() => recommend(prompt.value, modelId.value))
const leaderboard = computed(() => demoLeaderboard(game.value))
const savingsPct = computed(() => {
  const rec = lastRec.value ?? liveEstimate.value
  return percentSaved(rec.currentEstimate.carbonG, rec.suggestedEstimate.carbonG)
})
const meterPct = computed(() =>
  Math.min(100, Math.max(4, liveEstimate.value.currentEstimate.carbonG * 90)),
)

watch(showCompare, (open) => {
  if (open) game.value = onComparisonSeen(game.value)
})

function showToast(message: string) {
  toast.value = message
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toast.value = null
  }, 2800)
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && showCompare.value) {
    keepCurrent()
  }
}

window.addEventListener('keydown', onKeydown)
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (toastTimer) clearTimeout(toastTimer)
})

function looksBatched(text: string) {
  const numbered = /^\s*\d+[\).]/m.test(text) || /\n\s*\d+[\).]/.test(text)
  const andQuestions = (text.match(/\?/g) || []).length >= 2
  return numbered || andQuestions
}

function openFlow() {
  if (!prompt.value.trim()) {
    showToast('Enter a prompt first.')
    return
  }
  const rec = recommend(prompt.value, modelId.value)
  lastRec.value = rec
  reply.value = null
  if (rec.mismatch) {
    showCompare.value = true
  } else {
    finishRequest(false, rec)
  }
}

function finishRequest(switched: boolean, rec: Recommendation) {
  showCompare.value = false
  if (switched) {
    modelId.value = rec.suggested.id
  }
  const finalModel = switched ? rec.suggested.id : rec.current.id
  const finalRec = recommend(prompt.value, finalModel)
  lastRec.value = finalRec

  const rightSized =
    finalRec.direction === 'ok' ||
    (switched && rec.mismatch) ||
    finalRec.suggested.id === finalRec.current.id

  const carbonSaved = switched
    ? Math.max(0, rec.currentEstimate.carbonG - rec.suggestedEstimate.carbonG)
    : 0
  const tokensSaved = switched
    ? Math.max(0, rec.currentEstimate.totalTokens - rec.suggestedEstimate.totalTokens)
    : 0

  game.value = onRequestComplete(game.value, {
    switched,
    rightSized: Boolean(rightSized && (switched || !rec.mismatch)),
    promptLength: prompt.value.trim().length,
    carbonSavedG: carbonSaved,
    tokensSaved,
    looksBatched: looksBatched(prompt.value),
  })

  reply.value = mockReply(prompt.value, finalRec)
  showToast(
    switched
      ? `Switched to ${rec.suggested.name}. Saved ~${formatCarbon(carbonSaved)}.`
      : `Sent with ${finalRec.current.name}.`,
  )
}

function keepCurrent() {
  if (!lastRec.value) return
  finishRequest(false, lastRec.value)
}

function switchAndContinue() {
  if (!lastRec.value) return
  finishRequest(true, lastRec.value)
}

function mockReply(text: string, rec: Recommendation) {
  const preview = text.trim().slice(0, 120)
  return [
    `[Simulated ${rec.current.name} — no API key]`,
    '',
    `Complexity: ${rec.complexity}.`,
    `Placeholder for: “${preview}${text.length > 120 ? '…' : ''}”`,
  ].join('\n')
}

function useSample(kind: 'simple' | 'complex') {
  if (kind === 'simple') {
    prompt.value = 'Translate to Thai: The meeting is at 3pm.'
    modelId.value = 'gpt-oss-120b'
  } else {
    prompt.value =
      'Refactor this module into a clean architecture with step-by-step reasoning: explain trade-offs, write the class design, and propose tests for edge cases.'
    modelId.value = 'gpt-oss-20b'
  }
  reply.value = null
  showCompare.value = false
}

async function startStudy() {
  if (!studyConsent.value || Object.keys(preAnswers.value).length !== 3) {
    showToast('Confirm consent and answer all three questions first.')
    return
  }
  studyBusy.value = true
  try {
    studySessionId.value = await beginStudy(scoreStudy(preAnswers.value))
    showToast('Study started. Complete one model-selection task, then answer the follow-up questions.')
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : 'Could not start the study.')
  } finally {
    studyBusy.value = false
  }
}

async function completeStudy() {
  if (!studySessionId.value || Object.keys(postAnswers.value).length !== 3) {
    showToast('Answer all three follow-up questions first.')
    return
  }
  studyBusy.value = true
  try {
    await finishStudy(studySessionId.value, scoreStudy(postAnswers.value))
    showToast('Thank you. Your pseudonymous study response is complete.')
    studySessionId.value = null
    postAnswers.value = {}
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : 'Could not save the follow-up study.')
  } finally {
    studyBusy.value = false
  }
}
</script>

<template>
  <div class="app">
    <div class="proto">
      <span class="proto-mark">PROTOTYPE</span>
      <span>Ethics 953420 · Group 13 · modelled ranges, not measured emissions</span>
    </div>

    <header class="masthead">
      <div class="masthead-copy">
        <p class="kicker">Carbon-aware prompting</p>
        <h1>EcoPrompt</h1>
        <p class="lede">
          Write a prompt. Pick a model. See a transparent impact scenario before you send — and
          choose the model that fits the task.
        </p>
      </div>

      <aside class="gauge" aria-live="polite" aria-label="Modelled carbon estimate">
        <div class="gauge-top">
          <span>Modelled carbon</span>
          <span class="mono gauge-chip" :data-state="liveEstimate.mismatch ? 'hot' : 'ok'">
            {{ liveEstimate.mismatch ? liveEstimate.direction : 'matched' }}
          </span>
        </div>
        <p class="gauge-value mono">{{ formatCarbon(liveEstimate.currentEstimate.carbonRange.centralG) }}</p>
        <p class="gauge-meta mono">
          Predicted {{ formatTokens(liveEstimate.currentEstimate.totalTokens) }} tokens
          <br />
          Low–high scenario {{ formatCarbonRange(liveEstimate.currentEstimate.carbonRange) }}
        </p>
        <div class="gauge-track" role="presentation">
          <span class="gauge-fill" :style="{ width: meterPct + '%' }" />
        </div>
        <p class="gauge-formula">
          Sensitivity model · methodology {{ liveEstimate.currentEstimate.methodologyVersion }}
        </p>
        <details class="methodology">
          <summary>How to read this</summary>
          <p>
            Tokens are predicted before sending. Carbon is a low–high operational scenario, not a
            measurement of the provider’s emissions.
            <a href="https://github.com/ChindanaiNaKub/ecoprompt-prototype/blob/main/docs/METHODOLOGY.md" target="_blank" rel="noreferrer">Method and sources</a>
          </p>
        </details>
      </aside>
    </header>

    <div class="workbench">
      <section class="composer">
        <div class="row-between">
          <h2>Prompt</h2>
          <div class="samples">
            <button type="button" class="btn ghost" @click="useSample('simple')">
              Simple + large
            </button>
            <button type="button" class="btn ghost" @click="useSample('complex')">
              Complex + small
            </button>
          </div>
        </div>

        <label class="field">
          <span class="label">Text</span>
          <textarea v-model="prompt" rows="8" spellcheck="false" />
        </label>

        <label class="field">
          <span class="label">Model</span>
          <select v-model="modelId">
            <option v-for="m in MODELS" :key="m.id" :value="m.id">
              {{ m.name }} · {{ m.tier }} · {{ m.provider }}
            </option>
          </select>
        </label>

        <dl class="readout">
          <div>
            <dt>Complexity</dt>
            <dd class="mono">{{ liveEstimate.complexity }}</dd>
          </div>
          <div>
            <dt>Suggested</dt>
            <dd>{{ liveEstimate.suggested.name }}</dd>
          </div>
          <div>
            <dt>Fit</dt>
            <dd class="mono" :data-hot="liveEstimate.mismatch || undefined">
              {{ liveEstimate.mismatch ? liveEstimate.direction : 'ok' }}
            </dd>
          </div>
        </dl>

        <ul class="reasons">
          <li v-for="(r, i) in liveEstimate.reasons" :key="i">{{ r }}</li>
        </ul>

        <button type="button" class="btn primary" @click="openFlow">Estimate &amp; send</button>

        <article v-if="reply" class="reply">
          <h3>Response</h3>
          <pre class="mono">{{ reply }}</pre>
        </article>
      </section>

      <aside class="rail">
        <section class="rail-block">
          <h2>Quests</h2>
          <p class="rail-note">
            Light tracking for efficient habits. Leaderboard shows top savers only — no shame board.
          </p>
          <ul class="quests">
            <li v-for="q in game.quests" :key="q.id">
              <div class="quest-head">
                <strong>{{ q.title }}</strong>
                <span class="mono">{{ q.progress }}/{{ q.target }}</span>
              </div>
              <p>{{ q.description }}</p>
              <div class="bar" role="presentation">
                <span :style="{ width: (q.progress / q.target) * 100 + '%' }" />
              </div>
            </li>
          </ul>
          <div v-if="game.badges.length" class="stamps">
            <span v-for="b in game.badges" :key="b.id">{{ b.name }}</span>
          </div>
          <p v-else class="empty">No stamps yet.</p>
          <p v-if="game.totalCarbonSavedG > 0" class="saved mono">
            Modelled avoided (central scenario) ≈ {{ formatCarbon(game.totalCarbonSavedG) }} ·
            {{ formatTokens(game.totalTokensSaved) }} tok
          </p>
        </section>

        <section class="rail-block">
          <h2>Top efficient</h2>
          <table class="board">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Saved</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in leaderboard" :key="row.name" :class="{ you: row.isYou }">
                <td class="mono">{{ idx + 1 }}</td>
                <td>{{ row.name }}</td>
                <td class="mono">{{ row.carbonSavedG.toFixed(2) }} g</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="rail-block study">
          <h2>Optional study</h2>
          <p class="rail-note">
            This anonymous-style course study records two quiz scores and your model decision. It
            never exports your email or prompt text.
          </p>
          <template v-if="!studySessionId">
            <label class="consent">
              <input v-model="studyConsent" type="checkbox" />
              I consent to this course study.
            </label>
            <fieldset>
              <legend>Before using EcoPrompt</legend>
              <label><input v-model="preAnswers.emissions" type="radio" value="a" /> It measures Groq’s exact emissions.</label>
              <label><input v-model="preAnswers.emissions" type="radio" value="b" /> It shows a modelled carbon range.</label>
              <label><input v-model="preAnswers.emissions" type="radio" value="c" /> It has no environmental information.</label>
              <label><input v-model="preAnswers.usage" type="radio" value="a" /> Tokens after a response are provider-reported usage.</label>
              <label><input v-model="preAnswers.usage" type="radio" value="b" /> Tokens are exact electricity measurements.</label>
              <label><input v-model="preAnswers.usage" type="radio" value="c" /> Tokens reveal carbon intensity.</label>
              <label><input v-model="preAnswers.rightSizing" type="radio" value="a" /> The smallest model is always best.</label>
              <label><input v-model="preAnswers.rightSizing" type="radio" value="b" /> Recommendations block larger models.</label>
              <label><input v-model="preAnswers.rightSizing" type="radio" value="c" /> A larger model can be appropriate for complex work.</label>
            </fieldset>
            <button type="button" class="btn ghost solid" :disabled="studyBusy" @click="startStudy">
              Start study task
            </button>
          </template>
          <template v-else>
            <p class="study-active">Study task active: complete one prompt flow, then answer the same questions again.</p>
            <fieldset>
              <legend>After using EcoPrompt</legend>
              <label><input v-model="postAnswers.emissions" type="radio" value="a" /> It measures Groq’s exact emissions.</label>
              <label><input v-model="postAnswers.emissions" type="radio" value="b" /> It shows a modelled carbon range.</label>
              <label><input v-model="postAnswers.emissions" type="radio" value="c" /> It has no environmental information.</label>
              <label><input v-model="postAnswers.usage" type="radio" value="a" /> Tokens after a response are provider-reported usage.</label>
              <label><input v-model="postAnswers.usage" type="radio" value="b" /> Tokens are exact electricity measurements.</label>
              <label><input v-model="postAnswers.usage" type="radio" value="c" /> Tokens reveal carbon intensity.</label>
              <label><input v-model="postAnswers.rightSizing" type="radio" value="a" /> The smallest model is always best.</label>
              <label><input v-model="postAnswers.rightSizing" type="radio" value="b" /> Recommendations block larger models.</label>
              <label><input v-model="postAnswers.rightSizing" type="radio" value="c" /> A larger model can be appropriate for complex work.</label>
            </fieldset>
            <button type="button" class="btn ghost solid" :disabled="studyBusy" @click="completeStudy">
              Complete study
            </button>
          </template>
        </section>
      </aside>
    </div>

    <div v-if="toast" class="toast" role="status">{{ toast }}</div>

    <div
      v-if="showCompare && lastRec"
      class="modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-title"
    >
      <div class="modal-backdrop" @click="keepCurrent" />
      <div class="modal">
        <p class="kicker">Right-size check · estimate</p>
        <h2 id="compare-title">
          {{
            lastRec.direction === 'upsize'
              ? 'This task may need a stronger model'
              : 'A smaller model may be enough'
          }}
        </h2>
        <p class="modal-copy">
          Detected complexity: <strong>{{ lastRec.complexity }}</strong>. Keep your choice anytime —
          nothing is blocked.
        </p>

        <div class="compare">
          <div class="compare-col">
            <p class="compare-label">Current</p>
            <p class="compare-name">{{ lastRec.current.name }}</p>
            <p class="compare-num mono">{{ formatCarbon(lastRec.currentEstimate.carbonRange.centralG) }}</p>
            <p class="mono faint">
              {{ formatCarbonRange(lastRec.currentEstimate.carbonRange) }} · predicted {{ formatTokens(lastRec.currentEstimate.totalTokens) }} tok
            </p>
          </div>
          <div class="compare-col suggest">
            <p class="compare-label">Suggested</p>
            <p class="compare-name">{{ lastRec.suggested.name }}</p>
            <p class="compare-num mono">{{ formatCarbon(lastRec.suggestedEstimate.carbonRange.centralG) }}</p>
            <p class="mono faint">
              {{ formatCarbonRange(lastRec.suggestedEstimate.carbonRange) }} · predicted {{ formatTokens(lastRec.suggestedEstimate.totalTokens) }} tok
            </p>
            <p v-if="lastRec.direction === 'downsize'" class="delta">
              ≈ −{{ savingsPct }}% central-scenario impact
            </p>
            <p v-else class="delta hot">Weak model + retries can cost more</p>
          </div>
        </div>

        <div class="modal-actions">
          <button type="button" class="btn primary" @click="switchAndContinue">
            Switch &amp; continue
          </button>
          <button type="button" class="btn ghost solid" @click="keepCurrent">
            Keep current model
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.app {
  max-width: 1080px;
  margin: 0 auto;
  padding: 1rem 1.15rem 4rem;
}

.proto {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 0.85rem;
  margin-bottom: 1.35rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--line-strong);
  font-family: var(--mono);
  font-size: 0.74rem;
  color: var(--ink);
  font-weight: 500;
}

.proto-mark {
  display: inline-block;
  padding: 0.15rem 0.4rem;
  background: var(--ink);
  color: var(--surface);
  letter-spacing: 0.04em;
}

.masthead {
  display: grid;
  grid-template-columns: 1.2fr 0.8fr;
  gap: 1.5rem;
  margin-bottom: 1.75rem;
  align-items: end;
}

.kicker {
  margin: 0 0 0.4rem;
  font-family: var(--mono);
  font-size: 0.74rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink);
  font-weight: 600;
}

.masthead h1 {
  margin: 0;
  font-size: clamp(2.6rem, 7vw, 4.2rem);
  line-height: 0.92;
  letter-spacing: -0.045em;
  font-weight: 700;
}

.lede {
  margin: 0.85rem 0 0;
  max-width: 40ch;
  color: var(--ink);
  font-size: 1.08rem;
  line-height: 1.5;
  font-weight: 600;
}

.gauge {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  padding: 0.95rem 1rem 1rem;
}

.gauge-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--mono);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink);
  font-weight: 600;
}

.gauge-chip {
  padding: 0.12rem 0.35rem;
  border: 1px solid var(--line);
  text-transform: lowercase;
  letter-spacing: 0;
}

.gauge-chip[data-state='hot'] {
  border-color: var(--signal);
  color: var(--signal);
  background: var(--signal-wash);
}

.gauge-chip[data-state='ok'] {
  border-color: var(--cool);
  color: var(--cool);
  background: var(--cool-wash);
}

.gauge-value {
  margin: 0.55rem 0 0.2rem;
  font-size: 2rem;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--signal);
}

.gauge-meta,
.gauge-formula {
  margin: 0;
  font-size: 0.82rem;
  color: var(--mute);
  font-weight: 500;
}

.gauge-formula {
  margin-top: 0.65rem;
}

.gauge-track {
  margin-top: 0.8rem;
  height: 8px;
  background: #ddd8ce;
  overflow: hidden;
}

.gauge-fill {
  display: block;
  height: 100%;
  background: var(--signal);
  transition: width 220ms var(--ease-out);
}

.workbench {
  display: grid;
  grid-template-columns: 1.35fr 0.85fr;
  gap: 1.5rem;
  border-top: 1px solid var(--line-strong);
  padding-top: 1.35rem;
}

.composer {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  padding: 1rem 1.05rem 1.15rem;
}

.rail-block {
  background: var(--surface);
  border: 1px solid var(--line-strong);
  padding: 0.95rem 1rem 1.05rem;
}

.composer h2,
.rail-block h2 {
  margin: 0;
  font-size: 1rem;
  letter-spacing: -0.01em;
  font-weight: 700;
  color: var(--ink);
}

.row-between {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.9rem;
}

.samples {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.field {
  display: grid;
  gap: 0.3rem;
  margin-bottom: 0.85rem;
}

.label {
  font-family: var(--mono);
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink);
  font-weight: 600;
}

textarea,
select {
  width: 100%;
  border: 1px solid var(--line-strong);
  border-radius: 0;
  padding: 0.7rem 0.75rem;
  background: var(--surface);
  color: var(--ink);
  resize: vertical;
}

textarea {
  min-height: 10rem;
  line-height: 1.5;
}

textarea:focus,
select:focus,
.btn:focus-visible {
  outline: 2px solid var(--cool);
  outline-offset: 2px;
}

.readout {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.65rem;
  margin: 0 0 0.75rem;
  padding: 0.7rem 0;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.readout dt {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--label);
  font-weight: 600;
}

.readout dd {
  margin: 0.2rem 0 0;
  font-weight: 600;
}

.readout dd[data-hot] {
  color: var(--signal);
}

.reasons {
  margin: 0 0 1rem;
  padding-left: 1.05rem;
  color: var(--mute);
  font-size: 0.94rem;
  font-weight: 500;
}

.btn {
  border: 1px solid var(--line-strong);
  border-radius: 0;
  padding: 0.65rem 0.95rem;
  font-weight: 600;
  background: var(--surface);
  color: var(--ink);
  transition: transform 140ms var(--ease-out), background-color 160ms ease, color 160ms ease;
}

.btn:active {
  transform: scale(0.97);
}

.btn.primary {
  background: var(--ink);
  color: var(--surface);
}

.btn.ghost {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.35rem 0.55rem;
  border-color: var(--line-strong);
  color: var(--ink);
}

.btn.ghost.solid {
  font-size: 0.95rem;
  padding: 0.65rem 0.95rem;
  color: var(--ink);
  border-color: var(--line-strong);
}

@media (hover: hover) and (pointer: fine) {
  .btn.primary:hover {
    background: var(--cool);
    border-color: var(--cool);
  }

  .btn.ghost:hover {
    border-color: var(--ink);
    color: var(--ink);
  }
}

.reply {
  margin-top: 1.15rem;
  padding-top: 1rem;
  border-top: 1px dashed var(--line);
}

.reply h3 {
  margin: 0 0 0.45rem;
  font-size: 0.85rem;
}

.reply pre {
  margin: 0;
  white-space: pre-wrap;
  font-size: 0.8rem;
  background: #e4e1d9;
  padding: 0.8rem;
  border: 1px solid var(--line);
}

.rail {
  display: grid;
  gap: 1.25rem;
  align-content: start;
}

.rail-note {
  margin: 0.45rem 0 0.85rem;
  color: var(--ink);
  font-size: 0.95rem;
  line-height: 1.45;
  font-weight: 600;
}

.empty {
  margin: 0.45rem 0 0.85rem;
  color: var(--mute);
  font-size: 0.9rem;
  font-weight: 500;
}

.quests {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.85rem;
}

.quest-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.quests p {
  margin: 0.2rem 0 0.4rem;
  font-size: 0.86rem;
  color: var(--mute);
  font-weight: 500;
  line-height: 1.4;
}

.bar {
  height: 4px;
  background: #ddd8ce;
  overflow: hidden;
}

.bar span {
  display: block;
  height: 100%;
  background: var(--cool);
  transition: width 220ms var(--ease-out);
}

.stamps {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.85rem;
}

.stamps span {
  font-family: var(--mono);
  font-size: 0.7rem;
  padding: 0.25rem 0.4rem;
  border: 1px solid var(--cool);
  color: var(--cool);
  background: var(--cool-wash);
}

.saved {
  margin: 0.75rem 0 0;
  font-size: 0.78rem;
  color: var(--cool);
}

.board {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.86rem;
}

.board th,
.board td {
  text-align: left;
  padding: 0.4rem 0.25rem;
  border-bottom: 1px solid var(--line);
}

.board th {
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--label);
}

.board td {
  color: var(--ink);
  font-weight: 500;
}

.board tr.you td {
  background: var(--cool-wash);
  font-weight: 600;
}

.faint {
  color: var(--mute);
  font-weight: 500;
}

.toast {
  position: fixed;
  bottom: 1.15rem;
  left: 50%;
  translate: -50% 0;
  z-index: 40;
  max-width: min(90vw, 400px);
  padding: 0.7rem 0.9rem;
  background: var(--ink);
  color: var(--surface);
  font-size: 0.88rem;
  border: 1px solid var(--ink);
  transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: translateY(12px);
  }
}

.modal-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  padding: 1rem;
}

.modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(17, 17, 17, 0.42);
  transition: opacity 200ms var(--ease-out);

  @starting-style {
    opacity: 0;
  }
}

.modal {
  position: relative;
  width: min(540px, 100%);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  padding: 1.2rem 1.25rem 1.3rem;
  transform-origin: center;
  transition: opacity 220ms var(--ease-out), transform 220ms var(--ease-out);

  @starting-style {
    opacity: 0;
    transform: scale(0.96);
  }
}

.modal h2 {
  margin: 0.15rem 0 0.5rem;
  font-size: 1.35rem;
  letter-spacing: -0.025em;
  line-height: 1.15;
}

.modal-copy {
  margin: 0 0 1rem;
  color: var(--ink);
  font-size: 0.98rem;
  font-weight: 500;
  line-height: 1.45;
}

.compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid var(--line-strong);
}

.compare-col {
  padding: 0.85rem;
  background: var(--paper);
}

.compare-col + .compare-col {
  border-left: 1px solid var(--line-strong);
}

.compare-col.suggest {
  background: var(--cool-wash);
}

.compare-label {
  margin: 0;
  font-family: var(--mono);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--label);
  font-weight: 600;
}

.compare-name {
  margin: 0.3rem 0 0.45rem;
  font-weight: 600;
}

.compare-num {
  margin: 0 0 0.2rem;
  font-size: 1.15rem;
  font-weight: 600;
}

.delta {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--cool);
}

.delta.hot {
  color: var(--signal);
}

.modal-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1.1rem;
}

@media (max-width: 860px) {
  .masthead,
  .workbench,
  .readout,
  .compare {
    grid-template-columns: 1fr;
  }

  .compare-col + .compare-col {
    border-left: 0;
    border-top: 1px solid var(--line-strong);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toast,
  .modal,
  .modal-backdrop,
  .gauge-fill,
  .bar span,
  .btn {
    transition: none;
  }
}
</style>
