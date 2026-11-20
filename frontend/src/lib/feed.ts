import type { AttemptResponse } from '../api'

export const QUESTION_TIME_LIMIT_SECONDS = 60
export const MAX_ELAPSED_MS = 3_600_000

export interface CardState {
  selected: number | null
  pending: boolean
  result: AttemptResponse | null
  error: string | null
}

export const EMPTY_CARD: CardState = {
  selected: null,
  pending: false,
  result: null,
  error: null,
}
