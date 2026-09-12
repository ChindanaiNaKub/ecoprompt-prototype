<script setup lang="ts">
import { formatCarbon, formatTokens } from '../lib/estimate'
import type { GamificationState } from '../lib/quests'

defineProps<{
  game: GamificationState
}>()
</script>

<template>
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
</template>