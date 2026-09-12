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
import QuestTab from './components/QuestTab.vue'
import LeaderboardTab from './components/LeaderboardTab.vue'
import StudyTab from './components/StudyTab.vue'
import SettingsTab from './components/SettingsTab.vue'

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
const activeTab = ref<'quests' | 'leaderboard' | 'study' | 'settings'>('quests')
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
const leaderboardOptIn = computed(() => profile.value?.leaderboard_opt_in ?? false)

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
      <form v-if="isSupabaseConfigured && !signedInEmail" class="auth" @submit.prevent="sendMagicLink">
        <label class="sr-only" for="email">Email</label>
        <input id="email" v-model="email" type="email" autocomplete="email" placeholder="you@example.com" required />
        <button type="submit" class="btn ghost solid" :disabled="authBusy">Email sign-in</button>
      </form>
      <div v-else-if="signedInEmail" class="auth">
        <span>Signed in: {{ signedInEmail }}</span>
        <button type="button" class="btn ghost solid" @click="signOut">Sign out</button>
      </div>
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
        <div class="tabbar" role="tablist" aria-label="Workspace tabs">
          <button type="button" class="tab-button" :class="{ active: activeTab === 'quests' }" :aria-selected="activeTab === 'quests'" @click="activeTab = 'quests'">Quest</button>
          <button type="button" class="tab-button" :class="{ active: activeTab === 'leaderboard' }" :aria-selected="activeTab === 'leaderboard'" @click="activeTab = 'leaderboard'">Leaderboard</button>
          <button type="button" class="tab-button" :class="{ active: activeTab === 'study' }" :aria-selected="activeTab === 'study'" @click="activeTab = 'study'">Study Progress</button>
          <button type="button" class="tab-button" :class="{ active: activeTab === 'settings' }" :aria-selected="activeTab === 'settings'" @click="activeTab = 'settings'">Settings</button>
        </div>

        <QuestTab v-if="activeTab === 'quests'" :game="game" />
        <LeaderboardTab v-else-if="activeTab === 'leaderboard'" :rows="leaderboard" />
        <StudyTab
          v-else-if="activeTab === 'study'"
          v-model:studyConsent="studyConsent"
          v-model:preAnswers="preAnswers"
          v-model:postAnswers="postAnswers"
          v-model:privacyClarityRating="privacyClarityRating"
          v-model:quotaUnderstanding="quotaUnderstanding"
          :study-session-id="studySessionId"
          :study-busy="studyBusy"
          @start-study="startStudy"
          @complete-study="completeStudy"
        />
        <SettingsTab
          v-else
          :is-configured="isSupabaseConfigured"
          :signed-in-email="signedInEmail"
          v-model:email="email"
          v-model:profile-draft="profileDraft"
          :leaderboard-opt-in="leaderboardOptIn"
          :auth-busy="authBusy"
          :history="history"
          @update:leaderboardOptIn="updateLeaderboardOptIn"
          @send-magic-link="sendMagicLink"
          @save-profile="saveProfile"
          @delete-saved-prompt="deleteSavedPrompt"
          @sign-out="signOut"
        />
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
