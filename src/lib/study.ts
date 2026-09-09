import { supabase } from './supabase'

export type StudyAnswers = Record<'emissions' | 'usage' | 'rightSizing', 'a' | 'b' | 'c'>

const correctAnswers: StudyAnswers = {
  emissions: 'b',
  usage: 'a',
  rightSizing: 'c',
}

export function scoreStudy(answers: Partial<StudyAnswers>) {
  return Object.entries(correctAnswers).reduce(
    (score, [question, answer]) => score + (answers[question as keyof StudyAnswers] === answer ? 1 : 0),
    0,
  )
}

export async function beginStudy(preScore: number) {
  if (!supabase) throw new Error('Live study collection is not configured.')
  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ pre_score: preScore })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function finishStudy(sessionId: string, postScore: number) {
  if (!supabase) throw new Error('Live study collection is not configured.')
  const { error } = await supabase
    .from('study_sessions')
    .update({ post_score: postScore, completed_at: new Date().toISOString() })
    .eq('id', sessionId)
  if (error) throw new Error(error.message)
}
