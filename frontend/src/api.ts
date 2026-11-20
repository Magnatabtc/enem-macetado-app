export type SubjectKey =
  | 'matematica'
  | 'portugues'
  | 'biologia'
  | 'quimica'
  | 'fisica'
  | 'historia'
  | 'geografia'
  | 'filosofia'
  | 'sociologia'
  | 'ingles'

export type Weights = Record<SubjectKey, number>

export interface User {
  id: string
  email: string
  name: string
}

export interface AuthResponse {
  token: string
  user: User
  onboarded: boolean
}

export interface StreakInfo {
  current: number
  best: number
  last_active_date: string | null
}

export interface DailyInfo {
  date: string
  answered: number
  correct: number
  goal: number
}

export interface MeResponse {
  user: User
  onboarded: boolean
  weights: Weights
  streak: StreakInfo
  daily: DailyInfo
}

export interface FeedQuestion {
  id: string
  subject: string
  subject_label: string
  topic: string
  statement: string
  alternatives: string[]
  difficulty: number
}

export interface FeedResponse {
  questions: FeedQuestion[]
  generated_at: string
}

export interface TopicResult {
  subject: string
  topic: string
  priority: number
  consecutive_wrong: number
  is_priority: boolean
}

export interface AttemptPayload {
  question_id: string
  selected_index: number
  elapsed_ms: number
  mode: string
}

export interface AttemptResponse {
  correct: boolean
  correct_index: number
  explanation: string
  topic: TopicResult
  streak: StreakInfo
  daily: DailyInfo
}

export interface SubjectProgress {
  subject: string
  label: string
  weight: number
  answered: number
  correct: number
  accuracy: number
  avg_priority: number
}

export interface WeakTopic {
  subject: string
  topic: string
  priority: number
  consecutive_wrong: number
  correct: number
  wrong: number
}

export interface DayPoint {
  date: string
  answered: number
  correct: number
}

export interface ProgressResponse {
  streak: StreakInfo
  daily: DailyInfo
  totals: { answered: number; correct: number; accuracy: number }
  subjects: SubjectProgress[]
  weak_topics: WeakTopic[]
  last14: DayPoint[]
}

export interface OkResponse {
  ok: boolean
}

export interface OnboardingResponse extends OkResponse {
  onboarded: boolean
  weights: Weights
}

export interface HealthResponse {
  status: string
  db: string
  version: string
}

const TOKEN_KEY = 'em.token'
export const UNAUTHORIZED_EVENT = 'em:unauthorized'

export const tokenStore = {
  get(): string | null {
    try {
      return window.localStorage.getItem(TOKEN_KEY)
    } catch {
      return null
    }
  },
  set(token: string): void {
    try {
      window.localStorage.setItem(TOKEN_KEY, token)
    } catch {
      /* armazenamento indisponível (modo privado antigo) */
    }
  },
  clear(): void {
    try {
      window.localStorage.removeItem(TOKEN_KEY)
    } catch {
      /* noop */
    }
  },
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: unknown
  auth?: boolean
  signal?: AbortSignal
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function errorMessageFrom(data: unknown, status: number): string {
  if (isRecord(data) && typeof data.error === 'string' && data.error.trim()) {
    return data.error
  }
  return `Não foi possível concluir a operação (erro ${status}). Tente novamente.`
}

/**
 * Toda chamada à API passa por aqui: injeta o Bearer token, converte erros
 * para ApiError e expulsa o usuário quando o servidor responde 401.
 */
async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = tokenStore.get()
  const withAuth = options.auth !== false

  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (withAuth && token) headers.Authorization = `Bearer ${token}`

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'Sem conexão com o servidor. Confira sua internet e tente de novo.')
  }

  const text = await response.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text) as unknown
    } catch {
      data = null
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      if (token) {
        tokenStore.clear()
        window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
      }
      throw new ApiError(401, errorMessageFrom(data, 401))
    }
    throw new ApiError(response.status, errorMessageFrom(data, response.status))
  }

  return data as T
}

export const api = {
  health: () => request<HealthResponse>('/health', { auth: false }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', { method: 'POST', body: { email, password }, auth: false }),

  register: (name: string, email: string, password: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: { email, password, name },
      auth: false,
    }),

  guest: () => request<AuthResponse>('/auth/guest', { method: 'POST', auth: false }),

  me: () => request<MeResponse>('/me'),

  updateMe: (patch: { name?: string; daily_goal?: number }) =>
    request<OkResponse>('/me', { method: 'PATCH', body: patch }),

  saveOnboarding: (weights: Weights) =>
    request<OnboardingResponse>('/onboarding', { method: 'PUT', body: { weights } }),

  feed: (limit = 10) => request<FeedResponse>(`/feed?limit=${limit}`),

  attempt: (payload: AttemptPayload) =>
    request<AttemptResponse>('/attempts', { method: 'POST', body: payload }),

  progress: () => request<ProgressResponse>('/progress'),
}
