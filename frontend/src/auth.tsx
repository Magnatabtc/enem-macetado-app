import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  api,
  ApiError,
  tokenStore,
  UNAUTHORIZED_EVENT,
  type AuthResponse,
  type DailyInfo,
  type MeResponse,
  type StreakInfo,
  type User,
  type Weights,
} from './api'
import { readErrorMessage } from './lib/format'

type AuthStatus = 'loading' | 'anon' | 'ready'

interface AuthContextValue {
  status: AuthStatus
  me: MeResponse | null
  bootError: string | null
  sessionMessage: string | null
  login: (email: string, password: string) => Promise<MeResponse>
  register: (name: string, email: string, password: string) => Promise<MeResponse>
  loginGuest: () => Promise<MeResponse>
  logout: () => void
  refresh: () => Promise<void>
  patchMe: (patch: Partial<Pick<MeResponse, 'onboarded' | 'weights' | 'streak' | 'daily' | 'user'>>) => void
  syncStats: (streak: StreakInfo, daily: DailyInfo) => void
  dismissSessionMessage: () => void
  dismissBootError: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [me, setMe] = useState<MeResponse | null>(null)
  const [bootError, setBootError] = useState<string | null>(null)
  const [sessionMessage, setSessionMessage] = useState<string | null>(null)

  const applySession = useCallback((next: MeResponse) => {
    setMe(next)
    setStatus('ready')
    setBootError(null)
    setSessionMessage(null)
  }, [])

  useEffect(() => {
    let active = true
    const token = tokenStore.get()

    if (!token) {
      setStatus('anon')
      return
    }

    api
      .me()
      .then((next) => {
        if (!active) return
        applySession(next)
      })
      .catch((error: unknown) => {
        if (!active) return
        if (error instanceof ApiError && error.status === 401) {
          setStatus('anon')
          return
        }
        setBootError(
          readErrorMessage(
            error,
            'Não conseguimos validar sua sessão agora. Verifique se a API está no ar e tente de novo.',
          ),
        )
        setStatus('anon')
      })

    return () => {
      active = false
    }
  }, [applySession])

  useEffect(() => {
    const handleUnauthorized = () => {
      setMe(null)
      setStatus('anon')
      setSessionMessage('Sua sessão expirou. Entre novamente para continuar de onde parou.')
    }
    window.addEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, handleUnauthorized)
  }, [])

  const establishSession = useCallback(
    async (authRequest: Promise<AuthResponse>): Promise<MeResponse> => {
      const auth = await authRequest
      tokenStore.set(auth.token)
      try {
        const next = await api.me()
        applySession(next)
        return next
      } catch (error) {
        tokenStore.clear()
        setMe(null)
        setStatus('anon')
        throw error
      }
    },
    [applySession],
  )

  const login = useCallback(
    (email: string, password: string) => establishSession(api.login(email, password)),
    [establishSession],
  )

  const register = useCallback(
    (name: string, email: string, password: string) =>
      establishSession(api.register(name, email, password)),
    [establishSession],
  )

  const loginGuest = useCallback(() => establishSession(api.guest()), [establishSession])

  const logout = useCallback(() => {
    tokenStore.clear()
    setMe(null)
    setStatus('anon')
    setSessionMessage(null)
    setBootError(null)
  }, [])

  const refresh = useCallback(async () => {
    if (!tokenStore.get()) {
      setStatus('anon')
      return
    }
    try {
      const next = await api.me()
      applySession(next)
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setStatus('anon')
        return
      }
      setBootError(
        readErrorMessage(error, 'Não conseguimos falar com o servidor. Tente novamente em instantes.'),
      )
    }
  }, [applySession])

  const patchMe = useCallback(
    (patch: Partial<Pick<MeResponse, 'onboarded' | 'weights' | 'streak' | 'daily' | 'user'>>) => {
      setMe((previous) => (previous ? { ...previous, ...patch } : previous))
    },
    [],
  )

  const syncStats = useCallback((streak: StreakInfo, daily: DailyInfo) => {
    setMe((previous) =>
      previous
        ? {
            ...previous,
            streak: { ...previous.streak, current: streak.current, best: streak.best },
            daily: { ...daily, goal: daily.goal || previous.daily.goal },
          }
        : previous,
    )
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      me,
      bootError,
      sessionMessage,
      login,
      register,
      loginGuest,
      logout,
      refresh,
      patchMe,
      syncStats,
      dismissSessionMessage: () => setSessionMessage(null),
      dismissBootError: () => setBootError(null),
    }),
    [
      status,
      me,
      bootError,
      sessionMessage,
      login,
      register,
      loginGuest,
      logout,
      refresh,
      patchMe,
      syncStats,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return context
}

/** Atualiza os pesos locais depois do onboarding ou de uma edição no perfil. */
export function useApplyWeights(): (weights: Weights, user?: User) => void {
  const { patchMe } = useAuth()
  return useCallback(
    (weights: Weights, user?: User) => {
      patchMe({
        weights,
        onboarded: true,
        ...(user ? { user } : {}),
      })
    },
    [patchMe],
  )
}
