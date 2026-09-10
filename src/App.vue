<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { MODELS, type ModelId } from './lib/models'
import { recommend, type Complexity, type Recommendation } from './lib/recommend'
import {
  formatCarbon,
  formatCarbonRange,
  formatTokens,
  percentSaved,
} from './lib/estimate'
import {
  initialGamification,
  onComparisonSeen,
  onRequestComplete,
  type GamificationState,
} from './lib/quests'
import { beginStudy, finishStudy, scoreStudy, type StudyAnswers } from './lib/study'
import { executeLivePrompt, type LivePromptResult } from './lib/live'
import { isSupabaseConfigured, supabase } from './lib/supabase'

const prompt = ref(
  'Translate this sentence to Thai: Software engineers should consider environmental impact.',
)
const modelId = ref<ModelId>('llama3-70b-8192')
const complexityOverride = ref<'auto' | Complexity>('auto')
const storePrompt = ref(false)
const conversation = ref<Array<{ role: 'user' | 'assistant'; content: string }>>([])
const contextClearedForNext = ref(false)
const game = ref<GamificationState>(initialGamification())
const showCompare = ref(false)
const lastRec = ref<Recommendation | null>(null)
const reply = ref<string | null>(null)
const providerUsage = ref<LivePromptResult | null>(null)
const comparisonResults = ref<LivePromptResult[]>([])
const comparisonId = ref<string | null>(null)
const toast = ref<string | null>(null)
const studySessionId = ref<string | null>(null)
const studyConsent = ref(false)
const preAnswers = ref<Partial<StudyAnswers>>({})
const postAnswers = ref<Partial<StudyAnswers>>({})
const privacyClarityRating = ref(5)
const quotaUnderstanding = ref(false)
const studyBusy = ref(false)
const email = ref('')
const signedInEmail = ref<string | null>(null)
const profile = ref<{ display_name: string; leaderboard_opt_in: boolean; right_size_streak?: number } | null>(null)
const profileDraft = ref('')
const leaderboardRows = ref<Array<{ display_name: string; completed_requests: number; right_size_rate: number; isYou?: boolean }>>([])
const history = ref<Array<{
  id: string
  created_at: string
  model_id: ModelId
  provider_model_id: string
  input_tokens: number
  output_tokens: number
  total_tokens: number
  modelled_carbon_low_g: number
  modelled_carbon_central_g: number
  modelled_carbon_high_g: number
  model_decision: string
  prompt_text: string | null
  prompt_storage_consented: boolean
}>>([])
const dualAcknowledged = ref(false)
const authBusy = ref(false)
const sending = ref(false)
let toastTimer: ReturnType<typeof setTimeout> | null = null
let stopAuthListener: (() => void) | null = null

const liveEstimate = computed(() => recommend(
  prompt.value,
  modelId.value,
  complexityOverride.value === 'auto' ? undefined : complexityOverride.value,
))
const leaderboard = computed(() => {
  if (isSupabaseConfigured && signedInEmail.value) return leaderboardRows.value
  return [{
    display_name: 'You',
    completed_requests: game.value.quests.filter((quest) => quest.progress >= quest.target).length,
    right_size_rate: game.value.requestsSent ? Math.round((game.value.requestsSent - game.value.switchesAccepted) / game.value.requestsSent * 100) : 0,
    isYou: true,
  }]
})
const savingsPct = computed(() => {
  const rec = lastRec.value ?? liveEstimate.value
  return percentSaved(rec.currentEstimate.carbonG, rec.suggestedEstimate.carbonG)
})
const meterPct = computed(() =>
  Math.min(100, Math.max(4, liveEstimate.value.currentEstimate.carbonG * 90)),
)

watch(showCompare, (open) => {
  if (open && !signedInEmail.value) game.value = onComparisonSeen(game.value)
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
onMounted(async () => {
  if (!supabase) return
  const { data } = await supabase.auth.getSession()
  await applySession(data.session)
  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    void applySession(session)
  })
  stopAuthListener = () => listener.subscription.unsubscribe()
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  if (toastTimer) clearTimeout(toastTimer)
  stopAuthListener?.()
})

function looksBatched(text: string) {
  const numbered = /^\s*\d+[\).]/m.test(text) || /\n\s*\d+[\).]/.test(text)
  const andQuestions = (text.match(/\?/g) || []).length >= 2
  return numbered || andQuestions
}

function resetAccountState() {
  signedInEmail.value = null
  profile.value = null
  profileDraft.value = ''
  history.value = []
  leaderboardRows.value = []
  game.value = initialGamification()
  studySessionId.value = null
}

async function hydrateAccount() {
  if (!supabase || !signedInEmail.value) return
  const [profileResult, questResult, badgeResult, historyResult, leaderboardResult] = await Promise.all([
    supabase.from('profiles').select('display_name, leaderboard_opt_in, right_size_streak').single(),
    supabase.from('quest_progress').select('quest_id, progress, target, completed_at'),
    supabase.from('badges').select('id, badge_id, earned_at').order('earned_at'),
    supabase.from('request_events').select('id, created_at, model_id, provider_model_id, input_tokens, output_tokens, total_tokens, modelled_carbon_low_g, modelled_carbon_central_g, modelled_carbon_high_g, model_decision, prompt_text, prompt_storage_consented').order('created_at', { ascending: false }).limit(30),
    supabase.rpc('get_efficiency_leaderboard'),
  ])

  if (profileResult.data) {
    profile.value = profileResult.data
    profileDraft.value = profileResult.data.display_name
  }
  const definitions = initialGamification().quests
  const progressRows = (questResult.data ?? []) as Array<{ quest_id: string; progress: number; target: number; completed_at: string | null }>
  game.value = {
    ...initialGamification(),
    quests: definitions.map((quest) => {
      const row = progressRows.find((item) => item.quest_id === quest.id)
      return row ? { ...quest, progress: row.progress, target: row.target } : quest
    }),
    badges: ((badgeResult.data ?? []) as Array<{ id: string; badge_id: string; earned_at: string }>).map((badge) => ({
      id: badge.id, name: badge.badge_id, earnedAt: badge.earned_at,
    })),
    rightSizeStreak: profile.value?.right_size_streak ?? 0,
  }
  history.value = (historyResult.data ?? []) as typeof history.value
  leaderboardRows.value = (leaderboardResult.data ?? []) as typeof leaderboardRows.value
}

async function applySession(session: { user?: { email?: string | null } } | null) {
  signedInEmail.value = session?.user?.email ?? null
  if (signedInEmail.value) await hydrateAccount()
  else resetAccountState()
}

function openFlow() {
  if (!prompt.value.trim()) {
    showToast('Enter a prompt first.')
    return
  }
  if (isSupabaseConfigured && !signedInEmail.value) {
    showToast('Sign in with email before sending a live prompt.')
    return
  }
  const selectedRec = recommend(prompt.value, modelId.value, complexityOverride.value === 'auto' ? undefined : complexityOverride.value)
  lastRec.value = selectedRec
  reply.value = null
  comparisonResults.value = []
  dualAcknowledged.value = false
  if (selectedRec.mismatch) {
    showCompare.value = true
  } else {
    void finishRequest(false, selectedRec)
  }
}

async function finishRequest(switched: boolean, rec: Recommendation) {
  showCompare.value = false
  dualAcknowledged.value = false
  if (switched) {
    modelId.value = rec.suggested.id
  }
  const finalModel = switched ? rec.suggested.id : rec.current.id
  const finalRec = recommend(prompt.value, finalModel, complexityOverride.value === 'auto' ? undefined : complexityOverride.value)
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

  providerUsage.value = null
  comparisonResults.value = []
  if (isSupabaseConfigured) {
    sending.value = true
    try {
      const result = await executeLivePrompt({
        prompt: prompt.value,
        modelId: finalModel,
        mode: 'single',
        detectedComplexity: rec.detectedComplexity,
        selectedComplexity: finalRec.selectedComplexity,
        wasRecommended: finalModel === rec.suggested.id,
        storePrompt: storePrompt.value,
        contextCleared: contextClearedForNext.value,
        initialModelId: rec.current.id,
        recommendedModelId: rec.suggested.id,
        modelDecision: switched ? 'switch' : complexityOverride.value === 'auto' ? 'keep' : 'override',
        studySessionId: studySessionId.value ?? undefined,
        conversation: conversation.value,
      })
      providerUsage.value = result.results[0]
      reply.value = providerUsage.value.output
      comparisonId.value = result.comparisonId
      conversation.value.push({ role: 'user', content: prompt.value.trim() }, { role: 'assistant', content: providerUsage.value.output })
      contextClearedForNext.value = false
      await hydrateAccount()
      showToast(`Provider reported ${formatTokens(providerUsage.value.totalTokens)} tokens.`)
    } catch (cause) {
      reply.value = null
      showToast(cause instanceof Error ? cause.message : 'The live request failed.')
    } finally {
      sending.value = false
    }
    return
  }

  game.value = onRequestComplete(game.value, {
    switched,
    rightSized: Boolean(rightSized && (switched || !rec.mismatch)),
    promptLength: prompt.value.trim().length,
    carbonSavedG: carbonSaved,
    tokensSaved,
    looksBatched: looksBatched(prompt.value),
    contextCleared: contextClearedForNext.value,
  })
  reply.value = mockReply(prompt.value, finalRec)
  conversation.value.push({ role: 'user', content: prompt.value.trim() }, { role: 'assistant', content: reply.value })
  contextClearedForNext.value = false
  showToast('Local demo response. Configure Supabase and sign in for provider-reported usage.')
}

async function compareBoth() {
  if (!lastRec.value) return
  if (!dualAcknowledged.value) {
    showToast('Acknowledge the extra model run before comparing.')
    return
  }
  const rec = lastRec.value
  const primary = rec.current.id
  const secondary = rec.suggested.id
  showCompare.value = false
  sending.value = true
  providerUsage.value = null
  try {
    if (isSupabaseConfigured) {
      const result = await executeLivePrompt({
        prompt: prompt.value,
        modelId: primary,
        comparisonModelId: secondary,
        mode: 'dual',
        detectedComplexity: rec.detectedComplexity,
        selectedComplexity: rec.selectedComplexity,
        wasRecommended: primary === rec.suggested.id,
        storePrompt: storePrompt.value,
        contextCleared: contextClearedForNext.value,
        initialModelId: primary,
        recommendedModelId: secondary,
        modelDecision: 'keep',
        studySessionId: studySessionId.value ?? undefined,
        conversation: conversation.value,
      })
      comparisonResults.value = result.results
      comparisonId.value = result.comparisonId
      providerUsage.value = result.results[0]
      reply.value = result.results[0].output
      conversation.value.push({ role: 'user', content: prompt.value.trim() }, { role: 'assistant', content: result.results[0].output })
      contextClearedForNext.value = false
      await hydrateAccount()
    } else {
      comparisonResults.value = [mockResult(primary, rec), mockResult(secondary, rec)]
      providerUsage.value = comparisonResults.value[0]
      reply.value = comparisonResults.value[0].output
      game.value = onRequestComplete(game.value, {
        switched: false, rightSized: false, promptLength: prompt.value.trim().length,
        carbonSavedG: 0, tokensSaved: 0, looksBatched: looksBatched(prompt.value),
        contextCleared: contextClearedForNext.value,
      })
      contextClearedForNext.value = false
    }
    showToast('Comparison complete. Both provider responses are shown below.')
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : 'The comparison failed.')
  } finally {
    sending.value = false
  }
}

function mockResult(id: ModelId, rec: Recommendation): LivePromptResult {
  const estimate = id === rec.current.id ? rec.currentEstimate : rec.suggestedEstimate
  return {
    modelId: id,
    providerModelId: id,
    output: mockReply(prompt.value, recommend(prompt.value, id, complexityOverride.value === 'auto' ? undefined : complexityOverride.value)),
    inputTokens: estimate.inputTokens,
    outputTokens: estimate.outputTokens,
    totalTokens: estimate.totalTokens,
    modelledCarbon: estimate.carbonRange,
  }
}

function keepCurrent() {
  if (!lastRec.value) return
  void finishRequest(false, lastRec.value)
}

function switchAndContinue() {
  if (!lastRec.value) return
  void finishRequest(true, lastRec.value)
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
    modelId.value = 'llama3-70b-8192'
  } else {
    prompt.value =
      'Refactor this module into a clean architecture with step-by-step reasoning: explain trade-offs, write the class design, and propose tests for edge cases.'
    modelId.value = 'llama3-8b-8192'
  }
  reply.value = null
  providerUsage.value = null
  comparisonResults.value = []
  dualAcknowledged.value = false
  showCompare.value = false
}

function removeTurn(index: number) {
  conversation.value.splice(index, 1)
}

function clearContext() {
  if (!conversation.value.length) return
  conversation.value = []
  contextClearedForNext.value = true
  showToast('Conversation context cleared for the next request.')
}

async function saveProfile() {
  if (!supabase || !profile.value || !profileDraft.value.trim()) return
  const displayName = profileDraft.value.trim()
  if (displayName.length < 2 || displayName.length > 32) {
    showToast('Display name must be 2–32 characters.')
    return
  }
  const { error } = await supabase.from('profiles').update({
    display_name: displayName,
    leaderboard_opt_in: profile.value.leaderboard_opt_in,
  }).eq('id', (await supabase.auth.getUser()).data.user?.id)
  if (error) showToast(error.message)
  else { profile.value.display_name = displayName; showToast('Profile saved.') }
}

async function updateLeaderboardOptIn(value: boolean) {
  if (!supabase || !profile.value) return
  profile.value.leaderboard_opt_in = value
  const { error } = await supabase.from('profiles').update({ leaderboard_opt_in: value }).eq('id', (await supabase.auth.getUser()).data.user?.id)
  if (error) {
    profile.value.leaderboard_opt_in = !value
    showToast(error.message)
  } else {
    await hydrateAccount()
  }
}

async function deleteSavedPrompt(eventId: string) {
  if (!supabase) return
  const { error } = await supabase.rpc('delete_saved_prompt', { p_event_id: eventId })
  if (error) showToast(error.message)
  else {
    const item = history.value.find((entry) => entry.id === eventId)
    if (item) { item.prompt_text = null; item.prompt_storage_consented = false }
    showToast('Saved prompt text deleted. Metadata remains.')
  }
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
    await finishStudy(studySessionId.value, scoreStudy(postAnswers.value), privacyClarityRating.value, quotaUnderstanding.value)
    showToast('Thank you. Your pseudonymous study response is complete.')
    studySessionId.value = null
    postAnswers.value = {}
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : 'Could not save the follow-up study.')
  } finally {
    studyBusy.value = false
  }
}

async function sendMagicLink() {
  if (!supabase || !email.value.trim()) {
    showToast('Enter your email address first.')
    return
  }
  authBusy.value = true
  try {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.value.trim(),
      options: { emailRedirectTo: window.location.href },
    })
    if (error) throw error
    showToast('Check your email for the sign-in link.')
  } catch (cause) {
    showToast(cause instanceof Error ? cause.message : 'Could not send sign-in link.')
  } finally {
    authBusy.value = false
  }
}

async function signOut() {
  if (!supabase) return
  await supabase.auth.signOut()
  resetAccountState()
  showToast('Signed out.')
}
</script>

<template>
  <div class="app">
    <div class="proto">
      <span class="proto-mark">PROTOTYPE</span>
      <span>Ethics 953420 · Group 13 · modelled ranges, not measured emissions</span>
      <form v-if="isSupabaseConfigured && !signedInEmail" class="auth" @submit.prevent="sendMagicLink">
        <label class="sr-only" for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        <button type="submit" class="btn ghost solid" :disabled="authBusy">Email sign-in</button>
      </form>
      <div v-else-if="signedInEmail" class="auth">
        <span>Signed in: {{ signedInEmail }}</span>
        <button type="button" class="btn ghost solid" @click="signOut">Sign out</button>
      </div>
      <span v-else>Local demo mode · provider usage unavailable</span>
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
          <textarea id="prompt" v-model="prompt" name="prompt" rows="8" spellcheck="false" />
        </label>

        <label class="field">
          <span class="label">Model</span>
          <select id="model" v-model="modelId" name="model">
            <option v-for="m in MODELS" :key="m.id" :value="m.id">
              {{ m.name }} · {{ m.tier }} · {{ m.provider }}
            </option>
          </select>
        </label>

        <label class="field">
          <span class="label">Complexity selection</span>
          <select id="complexity" v-model="complexityOverride" name="complexity">
            <option value="auto">Auto-detect (recommended)</option>
            <option value="simple">Simple</option>
            <option value="moderate">Moderate</option>
            <option value="complex">Complex</option>
          </select>
        </label>

        <label class="checkline">
          <input v-model="storePrompt" type="checkbox" />
          Save this prompt to my private history (off by default)
        </label>

        <div class="context-tools">
          <div>
            <span class="label">Browser-only conversation context</span>
            <span class="faint">{{ conversation.length }} retained turn{{ conversation.length === 1 ? '' : 's' }} · never stored</span>
          </div>
          <button type="button" class="btn ghost" :disabled="!conversation.length" @click="clearContext">Clear all context</button>
        </div>

        <ul v-if="conversation.length" class="context-list">
          <li v-for="(turn, index) in conversation" :key="`${index}-${turn.role}`">
            <span><strong>{{ turn.role }}</strong> · {{ turn.content.slice(0, 100) }}{{ turn.content.length > 100 ? '…' : '' }}</span>
            <button type="button" class="btn ghost" @click="removeTurn(index)">Remove</button>
          </li>
        </ul>

        <dl class="readout">
          <div>
            <dt>Detected</dt>
            <dd class="mono">{{ liveEstimate.detectedComplexity }}</dd>
          </div>
          <div>
            <dt>Selected</dt>
            <dd class="mono">{{ liveEstimate.selectedComplexity }}</dd>
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

        <button type="button" class="btn primary" :disabled="sending" @click="openFlow">
          {{ sending ? 'Sending…' : 'Estimate & send' }}
        </button>

        <article v-if="reply || comparisonResults.length" class="reply">
          <h3>{{ comparisonResults.length > 1 ? `Comparison${comparisonId ? ` · ${comparisonId.slice(0, 8)}` : ''}` : 'Response' }}</h3>
          <div v-if="comparisonResults.length > 1" class="live-compare">
            <div v-for="result in comparisonResults" :key="result.modelId" class="live-compare-col">
              <strong>{{ result.providerModelId }}</strong>
              <p class="mono faint">
                {{ isSupabaseConfigured ? 'Provider-reported usage' : 'Demo usage estimate' }}: {{ formatTokens(result.inputTokens) }} input + {{ formatTokens(result.outputTokens) }} output = {{ formatTokens(result.totalTokens) }} total<br />
                Modelled range: {{ formatCarbonRange(result.modelledCarbon) }}
              </p>
              <pre class="mono">{{ result.output }}</pre>
            </div>
          </div>
          <template v-else>
            <p v-if="providerUsage" class="mono faint">
              Provider-reported usage: {{ formatTokens(providerUsage.inputTokens) }} input +
              {{ formatTokens(providerUsage.outputTokens) }} output =
              {{ formatTokens(providerUsage.totalTokens) }} tokens<br />
              Modelled carbon range: {{ formatCarbonRange(providerUsage.modelledCarbon) }}
            </p>
            <pre class="mono">{{ reply }}</pre>
          </template>
        </article>
      </section>

      <aside class="rail">
        <section class="rail-block">
          <h2>Quests</h2>
          <p class="rail-note">
            Light tracking for efficient habits. Your local progress is shown here; opt-in leaderboard data comes from Supabase.
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
          <h2>Your efficiency</h2>
          <table class="board">
            <thead>
              <tr>
                <th>#</th>
                <th>Name</th>
                <th>Requests</th>
                <th>Right-size</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, idx) in leaderboard" :key="row.display_name" :class="{ you: row.isYou }">
                <td class="mono">{{ idx + 1 }}</td>
                <td>{{ row.display_name }}</td>
                <td class="mono">{{ row.completed_requests }}</td>
                <td class="mono">{{ row.right_size_rate }}%</td>
              </tr>
            </tbody>
          </table>
          <p class="rail-note">Only opted-in users with positive right-size results and at least 10 requests appear here.</p>
        </section>

        <section v-if="signedInEmail && profile" class="rail-block">
          <h2>Privacy &amp; profile</h2>
          <label class="field compact">
            <span class="label">Display name</span>
            <input id="display-name" v-model="profileDraft" name="display_name" maxlength="32" />
          </label>
          <label class="checkline">
            <input :checked="profile.leaderboard_opt_in" type="checkbox" @change="updateLeaderboardOptIn(($event.target as HTMLInputElement).checked)" />
            Show my display name on the positive leaderboard
          </label>
          <button type="button" class="btn ghost solid" @click="saveProfile">Save profile</button>
        </section>

        <section v-if="signedInEmail" class="rail-block">
          <h2>Private request history</h2>
          <p class="rail-note">Metadata is private to your account. Prompt text appears only for requests you explicitly saved.</p>
          <p v-if="!history.length" class="empty">No requests yet.</p>
          <ul v-else class="history">
            <li v-for="event in history" :key="event.id">
              <div class="history-head"><strong>{{ event.model_id }}</strong><span class="mono">{{ new Date(event.created_at).toLocaleString() }}</span></div>
              <span class="mono faint">{{ formatTokens(event.total_tokens) }} tokens · {{ formatCarbonRange({ lowG: event.modelled_carbon_low_g, centralG: event.modelled_carbon_central_g, highG: event.modelled_carbon_high_g }) }}</span>
              <span class="mono faint">Decision: {{ event.model_decision }}{{ event.prompt_storage_consented ? ' · prompt saved' : ' · prompt not saved' }}</span>
              <button v-if="event.prompt_storage_consented" type="button" class="btn ghost" @click="deleteSavedPrompt(event.id)">Delete saved prompt</button>
            </li>
          </ul>
        </section>

        <section class="rail-block study">
          <h2>Optional study</h2>
          <p class="rail-note">
            This pseudonymous course study records two quiz scores and your model decision. It
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
            <label class="field compact">
              <span class="label">Privacy behavior clarity (1–5)</span>
              <input v-model.number="privacyClarityRating" type="number" min="1" max="5" />
            </label>
            <label class="checkline">
              <input v-model="quotaUnderstanding" type="checkbox" />
              I understand the daily quota and 429 message.
            </label>
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
          Detected complexity: <strong>{{ lastRec.detectedComplexity }}</strong>; selected: <strong>{{ lastRec.selectedComplexity }}</strong>. Keep your choice anytime —
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
          <label class="checkline dual-check">
            <input v-model="dualAcknowledged" type="checkbox" />
            I understand this sends the prompt to both models.
          </label>
          <button type="button" class="btn ghost solid" :disabled="!dualAcknowledged || sending" @click="compareBoth">
            Compare both
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

.auth {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-left: auto;
}

.auth input {
  min-width: 11rem;
  border: 1px solid var(--line-strong);
  border-radius: 0;
  padding: 0.35rem 0.45rem;
  background: var(--surface);
}

.methodology {
  margin-top: 0.5rem;
  font-size: 0.78rem;
}

.methodology summary {
  cursor: pointer;
  font-weight: 600;
}

.methodology p {
  margin: 0.35rem 0 0;
}

.study fieldset {
  display: grid;
  gap: 0.35rem;
  margin: 0.8rem 0;
  border: 1px solid var(--line);
  padding: 0.65rem;
  font-size: 0.8rem;
}

.study legend {
  padding: 0 0.25rem;
  font-family: var(--mono);
  font-size: 0.72rem;
  font-weight: 600;
}

.study label,
.consent {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.study-active {
  color: var(--cool);
  font-weight: 600;
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

.field.compact {
  margin-bottom: 0.6rem;
}

.field input[type='text'],
.field input[type='number'] {
  width: 100%;
  border: 1px solid var(--line-strong);
  border-radius: 0;
  padding: 0.55rem 0.65rem;
  background: var(--surface);
  color: var(--ink);
}

.checkline {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  margin: 0.65rem 0;
  color: var(--ink);
  font-size: 0.86rem;
  font-weight: 600;
}

.context-tools {
  display: flex;
  justify-content: space-between;
  align-items: end;
  gap: 0.75rem;
  margin: 0.8rem 0 0.45rem;
}

.context-tools > div {
  display: grid;
  gap: 0.2rem;
}

.context-list,
.history {
  list-style: none;
  margin: 0 0 0.85rem;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.context-list li,
.history li {
  display: grid;
  gap: 0.25rem;
  padding: 0.5rem;
  border: 1px solid var(--line);
  font-size: 0.78rem;
}

.context-list li {
  grid-template-columns: 1fr auto;
  align-items: center;
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
  grid-template-columns: repeat(4, 1fr);
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

.live-compare {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.7rem;
}

.live-compare-col {
  min-width: 0;
  border: 1px solid var(--line-strong);
  padding: 0.65rem;
  background: var(--paper);
}

.live-compare-col pre {
  margin-top: 0.6rem;
}

.history-head {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.history .btn {
  justify-self: start;
  margin-top: 0.25rem;
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
  .compare,
  .live-compare {
    grid-template-columns: 1fr;
  }

  .compare-col + .compare-col {
    border-left: 0;
    border-top: 1px solid var(--line-strong);
  }

  .context-tools {
    align-items: stretch;
    flex-direction: column;
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
