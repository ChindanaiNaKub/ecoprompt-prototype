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

export async function beginStudy(preKnowledgeScore: number) {
  if (!supabase) throw new Error('Live study collection is not configured.')
  
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) throw new Error('You must be signed in to participate in the study.')

  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ 
      user_id: user.id,
      pre_knowledge_score: preKnowledgeScore,
      task_completed: false 
    })
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
  
  const { error } = await supabase
    .from('study_sessions')
    .update({ 
      post_knowledge_score: postKnowledgeScore,
      privacy_clarity_rating: privacyClarityRating ?? 5,
      quota_understanding: quotaUnderstanding ?? true,
      task_completed: true 
    })
    .eq('id', sessionId)
    
  if (error) throw new Error(error.message)
}