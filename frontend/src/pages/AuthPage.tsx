import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Flame,
  Info,
  Loader2,
  Lock,
  Mail,
  Mic,
  Sparkles,
  Target,
  UserRound,
  X,
} from 'lucide-react'
import { ApiError } from '../api'
import { useAuth } from '../auth'
import { Brand, SplashScreen } from '../components/Brand'
import { readErrorMessage } from '../lib/format'

type Mode = 'login' | 'register'

const DEMO_EMAIL = 'demo@enem.app'
const DEMO_PASSWORD = 'demo1234'

export default function AuthPage() {
  const {
    status,
    me,
    bootError,
    sessionMessage,
    login,
    register,
    loginGuest,
    refresh,
    dismissSessionMessage,
    dismissBootError,
  } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [mode, setMode] = useState<Mode>(() => {
    const state = location.state as { mode?: string } | null
    return state?.mode === 'register' ? 'register' : 'login'
  })
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [guestLoading, setGuestLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [demoFilled, setDemoFilled] = useState(false)
  const nameRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (status === 'ready' && me) {
      navigate(me.onboarded ? '/feed' : '/onboarding', { replace: true })
    }
  }, [status, me, navigate])

  const switchMode = (next: Mode) => {
    setMode(next)
    setError(null)
    setDemoFilled(false)
    if (next === 'register') {
      window.setTimeout(() => nameRef.current?.focus(), 60)
    }
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || guestLoading) return

    const trimmedEmail = email.trim().toLowerCase()
    const trimmedName = name.trim()

    if (mode === 'register' && trimmedName.length < 2) {
      setError('Digite seu nome para criar a conta.')
      nameRef.current?.focus()
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setError('Digite um e-mail válido, como nome@exemplo.com.')
      return
    }
    if (password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.')
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const next =
        mode === 'login'
          ? await login(trimmedEmail, password)
          : await register(trimmedName, trimmedEmail, password)
      navigate(next.onboarded ? '/feed' : '/onboarding', { replace: true })
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 401) {
          setError('E-mail ou senha incorretos. Confira e tente de novo.')
        } else if (caught.status === 409) {
          setError('Este e-mail já está cadastrado. Use a aba Entrar.')
        } else {
          setError(caught.message)
        }
      } else {
        setError(readErrorMessage(caught, 'Não foi possível entrar agora. Tente novamente.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleGuest = async () => {
    if (guestLoading || submitting) return
    setGuestLoading(true)
    setError(null)
    try {
      const next = await loginGuest()
      navigate(next.onboarded ? '/feed' : '/onboarding', { replace: true })
    } catch (caught) {
      setError(readErrorMessage(caught, 'Não foi possível criar a conta de convidado agora.'))
    } finally {
      setGuestLoading(false)
    }
  }

  const fillDemo = () => {
    setMode('login')
    setEmail(DEMO_EMAIL)
    setPassword(DEMO_PASSWORD)
    setError(null)
    setDemoFilled(true)
  }

  if (status === 'loading') return <SplashScreen message="Verificando sua sessão…" />
  if (status === 'ready' && me) return <SplashScreen message="Entrando…" />

  const busy = submitting || guestLoading

  return (
    <div className="stage-bg relative min-h-[100dvh] overflow-hidden">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-80" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -left-32 -top-40 h-[420px] w-[420px] rounded-full bg-lime/[0.09] blur-[120px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-48 -right-24 h-[460px] w-[460px] rounded-full bg-violet/[0.16] blur-[120px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto grid min-h-[100dvh] w-full max-w-6xl items-center gap-10 px-4 py-8 sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:gap-16 lg:py-12">
        <section className="hidden lg:block">
          <div>
            <Brand size={34} />
          </div>

          <div className="mt-8">
            <span className="pill border-lime/25 bg-lime/[0.07] text-lime">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Treino diário para o ENEM
            </span>
          </div>

          <h1 className="mt-5 max-w-xl text-balance font-display text-[44px] font-bold leading-[1.06] tracking-tight text-white">
            Menos scroll à toa.
            <br />
            Mais <span className="text-lime">acerto</span> na prova.
          </h1>

          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-white/50">
            Uma questão por tela, correção na hora e um tutor que explica por voz. O feed aprende
            com cada erro e insiste no que você mais precisa revisar.
          </p>

          <ul className="mt-7 space-y-3.5">
            {[
              {
                icon: Flame,
                title: 'Streak que vira hábito',
                text: 'Meta diária e sequência de dias para não largar o ritmo.',
              },
              {
                icon: Mic,
                title: 'Tutor por voz de verdade',
                text: 'Fale sua dúvida e receba a explicação em streaming, na hora.',
              },
              {
                icon: Target,
                title: 'Erro vira prioridade',
                text: 'Dois erros seguidos no mesmo tópico e ele volta para o topo do feed.',
              },
            ].map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-lime">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div>
                  <p className="text-sm font-semibold text-white">{title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-white/40">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <div
            className="relative mt-9 max-w-sm rounded-4xl border border-white/10 bg-surface/70 p-5 shadow-lift backdrop-blur-md"
            aria-hidden="true"
          >
            <div className="flex items-center justify-between">
              <span className="pill border-sky-300/25 bg-sky-300/10 text-sky-200">Matemática</span>
              <span className="text-[10px] font-medium text-white/25">questão 1 de 10</span>
            </div>
            <p className="mt-4 font-display text-[15px] font-semibold leading-snug text-white/85">
              Uma loja oferece 20% de desconto em um produto de R$ 250. Qual é o valor final?
            </p>
            <div className="mt-3.5 space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-lime/40 bg-lime/[0.09] px-3 py-2 text-xs text-white/75">
                R$ 200,00
                <Check className="h-3.5 w-3.5 text-lime" />
              </div>
              <div className="rounded-xl border border-white/[0.08] px-3 py-2 text-xs text-white/35">
                R$ 230,00
              </div>
            </div>
            <div className="absolute -right-4 -top-4 flex items-center gap-1.5 rounded-2xl border border-lime/25 bg-ink px-3 py-2 shadow-glow">
              <Flame className="h-4 w-4 text-lime" fill="currentColor" />
              <span className="text-sm font-bold text-lime">7</span>
              <span className="text-[10px] text-white/45">dias</span>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-[430px]">
          <div className="mb-6 lg:hidden">
            <Brand size={30} />
            <h1 className="mt-5 text-balance font-display text-[32px] font-bold leading-[1.08] tracking-tight text-white">
              Arraste. Responda. <span className="text-lime">Evolua.</span>
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-white/45">
              Seu treino de ENEM em formato de feed, com tutor por voz e prioridade nos seus erros.
            </p>
          </div>

          <div className="surface-card p-5 sm:p-6">
            <div
              role="tablist"
              aria-label="Acesso à conta"
              className="grid grid-cols-2 gap-1 rounded-2xl border border-white/[0.06] bg-ink/50 p-1"
            >
              {(
                [
                  ['login', 'Entrar'],
                  ['register', 'Criar conta'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  role="tab"
                  aria-selected={mode === value}
                  onClick={() => switchMode(value)}
                  className={`min-h-[40px] rounded-xl text-sm font-semibold transition ${
                    mode === value
                      ? 'bg-white/[0.08] text-white shadow-sm'
                      : 'text-white/40 hover:text-white/70'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2.5">
              {sessionMessage && (
                <div
                  role="status"
                  className="flex items-start gap-2 rounded-2xl border border-violet/25 bg-violet/[0.08] px-3.5 py-2.5 text-[11px] leading-relaxed text-white/65"
                >
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-soft" aria-hidden="true" />
                  <span className="flex-1">{sessionMessage}</span>
                  <button
                    type="button"
                    onClick={dismissSessionMessage}
                    aria-label="Dispensar aviso de sessão"
                    className="text-white/35 hover:text-white"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}

              {bootError && (
                <div
                  role="alert"
                  className="rounded-2xl border border-danger/30 bg-danger/[0.08] px-3.5 py-2.5 text-[11px] leading-relaxed text-danger"
                >
                  <div className="flex items-start gap-2">
                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <p className="flex-1">{bootError}</p>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        dismissBootError()
                        void refresh()
                      }}
                      className="rounded-lg border border-danger/30 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-danger/10"
                    >
                      Tentar de novo
                    </button>
                    <button
                      type="button"
                      onClick={dismissBootError}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-white/50 hover:text-white"
                    >
                      Ignorar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} noValidate className="mt-4" aria-busy={busy}>
              <div className="space-y-3.5">
                {mode === 'register' && (
                  <div>
                    <label htmlFor="auth-name" className="field-label">
                      Seu nome
                    </label>
                    <input
                      id="auth-name"
                      ref={nameRef}
                      type="text"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value)
                        setError(null)
                      }}
                      autoComplete="name"
                      placeholder="Como quer ser chamado?"
                      className="field"
                      disabled={busy}
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="auth-email" className="field-label">
                    E-mail
                  </label>
                  <div className="relative">
                    <Mail
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-email"
                      type="email"
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value)
                        setError(null)
                        setDemoFilled(false)
                      }}
                      autoComplete="email"
                      inputMode="email"
                      placeholder="voce@exemplo.com"
                      className="field pl-10"
                      disabled={busy}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="auth-password" className="field-label">
                    Senha
                  </label>
                  <div className="relative">
                    <Lock
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-white/25"
                      aria-hidden="true"
                    />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value)
                        setError(null)
                        setDemoFilled(false)
                      }}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      placeholder={mode === 'login' ? 'Sua senha' : 'Mínimo de 8 caracteres'}
                      className="field px-10"
                      disabled={busy}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                      className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-white/35 transition hover:bg-white/[0.06] hover:text-white/70"
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {mode === 'register' && (
                    <p className="mt-1.5 text-[10px] text-white/30">
                      Use pelo menos 8 caracteres. Sua conta é só sua.
                    </p>
                  )}
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-3.5 rounded-xl border border-danger/30 bg-danger/[0.08] px-3.5 py-2.5 text-xs leading-snug text-danger"
                >
                  {error}
                </div>
              )}

              <button type="submit" disabled={busy} className="btn-primary mt-4 w-full">
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    {mode === 'login' ? 'Entrando…' : 'Criando conta…'}
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Entrar no feed' : 'Criar minha conta'}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <div className="my-4 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-white/[0.07]" />
              <span className="text-[10px] font-medium uppercase tracking-[0.16em] text-white/25">
                ou
              </span>
              <span className="h-px flex-1 bg-white/[0.07]" />
            </div>

            <button
              type="button"
              onClick={() => void handleGuest()}
              disabled={busy}
              className="btn-secondary w-full"
            >
              {guestLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <UserRound className="h-4 w-4" aria-hidden="true" />
              )}
              Testar sem cadastro
            </button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-white/25">
              Cria uma conta de convidado e leva direto ao onboarding.
            </p>

            <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-dashed border-white/10 bg-ink/40 px-3.5 py-3">
              <div className="min-w-0">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/25">
                  Conta demo
                </p>
                <p className="mt-1 truncate font-mono text-[11px] text-white/55">
                  {DEMO_EMAIL} · {DEMO_PASSWORD}
                </p>
              </div>
              <button
                type="button"
                onClick={fillDemo}
                disabled={busy}
                className="shrink-0 rounded-xl border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-semibold text-white/70 transition hover:border-lime/30 hover:text-lime"
              >
                {demoFilled ? 'Preenchido' : 'Preencher'}
              </button>
            </div>
          </div>

          <p className="mt-4 text-center text-[10px] leading-relaxed text-white/25">
            Seus dados ficam salvos para personalizar o feed e calcular seu progresso.
          </p>

          <p className="mt-5 text-center text-[10px] font-medium uppercase tracking-[0.14em] text-white/20">
            enem macetado · treino diário sem enrolação
          </p>
        </section>
      </div>
    </div>
  )
}
