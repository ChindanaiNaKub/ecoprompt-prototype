<script setup lang="ts">
import type { StudyAnswers } from '../lib/study'

type StudyField = keyof StudyAnswers
type Choice = 'a' | 'b' | 'c'

const props = defineProps<{
  studySessionId: string | null
  studyConsent: boolean
  preAnswers: Partial<StudyAnswers>
  postAnswers: Partial<StudyAnswers>
  privacyClarityRating: number
  quotaUnderstanding: boolean
  studyBusy: boolean
}>()

const emit = defineEmits<{
  (event: 'update:studyConsent', value: boolean): void
  (event: 'update:preAnswers', value: Partial<StudyAnswers>): void
  (event: 'update:postAnswers', value: Partial<StudyAnswers>): void
  (event: 'update:privacyClarityRating', value: number): void
  (event: 'update:quotaUnderstanding', value: boolean): void
  (event: 'start-study'): void
  (event: 'complete-study'): void
}>()

const questions: Array<{ key: StudyField; options: Array<{ value: Choice; text: string }> }> = [
  {
    key: 'emissions',
    options: [
      { value: 'a', text: 'It measures Groq’s exact emissions.' },
      { value: 'b', text: 'It shows a modelled carbon range.' },
      { value: 'c', text: 'It has no environmental information.' },
    ],
  },
  {
    key: 'usage',
    options: [
      { value: 'a', text: 'Tokens after a response are provider-reported usage.' },
      { value: 'b', text: 'Tokens are exact electricity measurements.' },
      { value: 'c', text: 'Tokens reveal carbon intensity.' },
    ],
  },
  {
    key: 'rightSizing',
    options: [
      { value: 'a', text: 'The smallest model is always best.' },
      { value: 'b', text: 'Recommendations block larger models.' },
      { value: 'c', text: 'A larger model can be appropriate for complex work.' },
    ],
  },
]

function setAnswer(target: 'pre' | 'post', key: StudyField, value: Choice) {
  const source = target === 'pre' ? props.preAnswers : props.postAnswers
  const next = { ...source, [key]: value }
  if (target === 'pre') emit('update:preAnswers', next)
  else emit('update:postAnswers', next)
}
</script>

<template>
  <section class="rail-block study">
    <h2>Optional study</h2>
    <p class="rail-note">
      This pseudonymous course study records two quiz scores and your model decision. It
      never exports your email or prompt text.
    </p>
    <template v-if="!studySessionId">
      <label class="consent">
        <input :checked="studyConsent" type="checkbox" @change="emit('update:studyConsent', ($event.target as HTMLInputElement).checked)" />
        I consent to this course study.
      </label>
      <fieldset>
        <legend>Before using EcoPrompt</legend>
        <template v-for="question in questions" :key="question.key">
          <label v-for="option in question.options" :key="option.value">
            <input
              :checked="preAnswers[question.key] === option.value"
              :name="`pre-${question.key}`"
              type="radio"
              :value="option.value"
              @change="setAnswer('pre', question.key, option.value)"
            />
            {{ option.text }}
          </label>
        </template>
      </fieldset>
      <button type="button" class="btn ghost solid" :disabled="studyBusy" @click="emit('start-study')">
        Start study task
      </button>
    </template>
    <template v-else>
      <p class="study-active">Study task active: complete one prompt flow, then answer the same questions again.</p>
      <fieldset>
        <legend>After using EcoPrompt</legend>
        <template v-for="question in questions" :key="question.key">
          <label v-for="option in question.options" :key="option.value">
            <input
              :checked="postAnswers[question.key] === option.value"
              :name="`post-${question.key}`"
              type="radio"
              :value="option.value"
              @change="setAnswer('post', question.key, option.value)"
            />
            {{ option.text }}
          </label>
        </template>
      </fieldset>
      <label class="field compact">
        <span class="label">Privacy behavior clarity (1–5)</span>
        <input :value="privacyClarityRating" type="number" min="1" max="5" @input="emit('update:privacyClarityRating', Number(($event.target as HTMLInputElement).value))" />
      </label>
      <label class="checkline">
        <input :checked="quotaUnderstanding" type="checkbox" @change="emit('update:quotaUnderstanding', ($event.target as HTMLInputElement).checked)" />
        I understand the daily quota and 429 message.
      </label>
      <button type="button" class="btn ghost solid" :disabled="studyBusy" @click="emit('complete-study')">
        Complete study
      </button>
    </template>
  </section>
</template>