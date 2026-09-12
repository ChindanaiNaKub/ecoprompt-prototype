<script setup lang="ts">
import { formatCarbonRange } from '../lib/estimate'

defineProps<{
  isConfigured: boolean
  signedInEmail: string | null
  email: string
  profileDraft: string
  leaderboardOptIn: boolean
  authBusy: boolean
  history: Array<{
    id: string
    created_at: string
    model_id: string
    total_tokens: number
    modelled_carbon_low_g: number
    modelled_carbon_central_g: number
    modelled_carbon_high_g: number
    model_decision: string
    prompt_storage_consented: boolean
  }>
}>()

const emit = defineEmits<{
  (event: 'update:email', value: string): void
  (event: 'update:profileDraft', value: string): void
  (event: 'update:leaderboardOptIn', value: boolean): void
  (event: 'send-magic-link'): void
  (event: 'save-profile'): void
  (event: 'delete-saved-prompt', eventId: string): void
  (event: 'sign-out'): void
}>()
</script>

<template>
  <section class="rail-block">
    <h2>Privacy &amp; profile</h2>
    <form v-if="isConfigured && !signedInEmail" class="auth" @submit.prevent="emit('send-magic-link')">
      <label class="sr-only" for="email">Email</label>
      <input id="email" :value="email" type="email" autocomplete="email" placeholder="you@example.com" required @input="emit('update:email', ($event.target as HTMLInputElement).value)" />
      <button type="submit" class="btn ghost solid" :disabled="authBusy">Email sign-in</button>
    </form>
    <div v-else-if="signedInEmail" class="auth">
      <span>Signed in: {{ signedInEmail }}</span>
      <button type="button" class="btn ghost solid" @click="emit('sign-out')">Sign out</button>
    </div>
    <span v-else>Local demo mode · provider usage unavailable</span>

    <template v-if="signedInEmail">
      <label class="field compact">
        <span class="label">Display name</span>
        <input id="display-name" :value="profileDraft" maxlength="32" @input="emit('update:profileDraft', ($event.target as HTMLInputElement).value)" />
      </label>
      <label class="checkline">
        <input :checked="leaderboardOptIn" type="checkbox" @change="emit('update:leaderboardOptIn', ($event.target as HTMLInputElement).checked)" />
        Show my display name on the positive leaderboard
      </label>
      <button type="button" class="btn ghost solid" @click="emit('save-profile')">Save profile</button>
    </template>

    <h2>Private request history</h2>
    <p class="rail-note">Metadata is private to your account. Prompt text appears only for requests you explicitly saved.</p>
    <p v-if="!history.length" class="empty">No requests yet.</p>
    <ul v-else class="history">
      <li v-for="event in history" :key="event.id">
        <div class="history-head"><strong>{{ event.model_id }}</strong><span class="mono">{{ new Date(event.created_at).toLocaleString() }}</span></div>
        <span class="mono faint">{{ event.total_tokens }} tokens · {{ formatCarbonRange({ lowG: event.modelled_carbon_low_g, centralG: event.modelled_carbon_central_g, highG: event.modelled_carbon_high_g }) }}</span>
        <span class="mono faint">Decision: {{ event.model_decision }}{{ event.prompt_storage_consented ? ' · prompt saved' : ' · prompt not saved' }}</span>
        <button v-if="event.prompt_storage_consented" type="button" class="btn ghost" @click="emit('delete-saved-prompt', event.id)">Delete saved prompt</button>
      </li>
    </ul>
  </section>
</template>