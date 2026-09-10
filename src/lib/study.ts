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

export function isCompleteStudyScore(score: number): boolean {
  return Number.isInteger(score) && score >= 0 && score <= 3
}

export async function beginStudy(preKnowledgeScore: number) {
  if (!supabase) throw new Error('Live study collection is not configured.')
  if (!isCompleteStudyScore(preKnowledgeScore)) throw new Error('Study score is invalid.')
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) throw new Error('You must be signed in to participate in the study.')

  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ user_id: user.id, pre_score: preKnowledgeScore })
    .select('id')
    .single()
    
  if (error) throw new Error(error.message)
  return data.id as string
}

export async function finishStudy(
  sessionId: string, 
  postKnowledgeScore: number, 
  privacyClarityRating?: number, 
  quotaUnderstanding?: boolean
) {
  if (!supabase) throw new Error('Live study collection is not configured.')
  if (!isCompleteStudyScore(postKnowledgeScore)) throw new Error('Study score is invalid.')
  const rating = privacyClarityRating ?? 5
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw new Error('Privacy rating is invalid.')
  if (typeof quotaUnderstanding !== 'boolean') throw new Error('Quota answer is required.')

  const { error } = await supabase.rpc('complete_study_session', {
    p_session_id: sessionId,
    p_post_score: postKnowledgeScore,
    p_privacy_clarity: rating,
    p_quota_understanding: quotaUnderstanding,
  })
  if (error) throw new Error(error.message)
}
