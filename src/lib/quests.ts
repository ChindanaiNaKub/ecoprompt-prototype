export type QuestId =
  | 'right-size-streak'
  | 'prompt-trim'
  | 'batch-once'
  | 'compare-models'
  | 'context-clear'

export interface Quest {
  id: QuestId
  title: string
  description: string
  target: number
  progress: number
  skill: string
}

export interface Badge {
  id: string
  name: string
  earnedAt: string
}

export interface LeaderboardEntry {
  display_name: string
  completed_requests: number
  right_size_rate: number
  isYou?: boolean
}

export interface GamificationState {
  quests: Quest[]
  badges: Badge[]
  rightSizeStreak: number
  totalCarbonSavedG: number
  totalTokensSaved: number
  requestsSent: number
  switchesAccepted: number
}

export function initialGamification(): GamificationState {
  return {
    quests: [
      {
        id: 'right-size-streak',
        title: 'Right-size streak',
        description: 'Choose an appropriately-sized model 5 times in a row',
        target: 5,
        progress: 0,
        skill: 'Matching task complexity to model capability',
      },
      {
        id: 'prompt-trim',
        title: 'Prompt efficiency',
        description: 'Send a prompt under 200 characters that still gets a useful reply',
        target: 3,
        progress: 0,
        skill: 'Writing concise, well-scoped prompts',
      },
      {
        id: 'batch-once',
        title: 'Batch it',
        description: 'Combine 2+ questions into one prompt (look for “and” / numbered lists)',
        target: 1,
        progress: 0,
        skill: 'Reducing unnecessary API calls',
      },
      {
        id: 'compare-models',
        title: 'Compare & learn',
        description: 'Open the comparison pop-up and review both options once',
        target: 1,
        progress: 0,
        skill: 'Building intuition for quality vs. cost',
      },
      {
        id: 'context-clear',
        title: 'Context Management',
        description: 'Clear irrelevant conversation history before a new query',
        target: 1,
        progress: 0,
        skill: 'Understanding context length vs. compute cost',
      }
    ],
    badges: [],
    rightSizeStreak: 0,
    totalCarbonSavedG: 0,
    totalTokensSaved: 0,
    requestsSent: 0,
    switchesAccepted: 0,
  }
}

function bumpQuest(state: GamificationState, id: QuestId, by = 1) {
  const q = state.quests.find((x) => x.id === id)
  if (!q || q.progress >= q.target) return
  
  q.progress = Math.min(q.target, q.progress + by)
  
  if (q.progress >= q.target) {
    const badgeName =
      id === 'right-size-streak'
        ? 'Right-Sizer'
        : id === 'prompt-trim'
          ? 'Lean Prompter'
          : id === 'batch-once'
            ? 'Batcher'
            : id === 'compare-models'
              ? 'Comparer'
              : 'Context Master'
              
    if (!state.badges.some((b) => b.name === badgeName)) {
      state.badges.push({
        id: `${id}-${Date.now()}`,
        name: badgeName,
        earnedAt: new Date().toISOString(),
      })
    }
  }
}

function cloneGamification(state: GamificationState): GamificationState {
  return {
    ...state,
    quests: state.quests.map((quest) => ({ ...quest })),
    badges: state.badges.map((badge) => ({ ...badge })),
  }
}

export function onComparisonSeen(state: GamificationState): GamificationState {
  const next = cloneGamification(state)
  bumpQuest(next, 'compare-models')
  return next
}

export function onRequestComplete(
  state: GamificationState,
  opts: {
    switched: boolean
    rightSized: boolean
    promptLength: number
    carbonSavedG: number
    tokensSaved: number
    looksBatched: boolean
    contextCleared: boolean
  },
): GamificationState {
  const next = cloneGamification(state)
  next.requestsSent += 1

  if (opts.switched) {
    next.switchesAccepted += 1
    next.totalCarbonSavedG += Math.max(0, opts.carbonSavedG)
    next.totalTokensSaved += Math.max(0, opts.tokensSaved)
  }

  if (opts.rightSized) {
    next.rightSizeStreak += 1
    bumpQuest(next, 'right-size-streak')
  } else {
    next.rightSizeStreak = 0
    const q = next.quests.find((x) => x.id === 'right-size-streak')
    if (q && q.progress < q.target) q.progress = 0
  }

  if (opts.promptLength > 0 && opts.promptLength < 200) {
    bumpQuest(next, 'prompt-trim')
  }

  if (opts.looksBatched) {
    bumpQuest(next, 'batch-once')
  }

  if (opts.contextCleared) {
    bumpQuest(next, 'context-clear')
  }

  return next
}
