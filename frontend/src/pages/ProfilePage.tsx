import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Brain,
  Check,
  Flame,
  Info,
  Loader2,
  Lock,
  LogOut,
  Mail,
  ShieldCheck,
  Sparkles,
  Target,
  UserRound,
} from 'lucide-react'
import { api, type Weights } from '../api'
import { useAuth } from '../auth'
import { WeightEditor } from '../components/WeightEditor'
import { readErrorMessage } from '../lib/format'
import { normalizeWeights, SUBJECTS, WEIGHT_LABELS } from '../lib/subjects'

const BASE_GOALS = [8, 12, 20]

export default function ProfilePage() {
  const { me, patchMe, logout } = useAuth()
  const navigate = useNavigate()

  const [name, setName] = useState(me?.user.name ?? '')
  const [goal, setGoal] = useState(me?.daily.goal ?? 12)
  const [weights, setWeights] = useState<Weights>(() => normalizeWeights(me?.weights))
  const [savingAccount, setSavingAccount] = useState(false)
  const [savingWeights, setSavingWeights] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [weightsError, setWeightsError] = useState<string | null>(null)
  const [accountSaved, setAccountSaved] = useState(false)
  const [weightsSaved, setWeightsSaved] = useState(false)

  const meName = me?.user.name
  const meGoal = me?.daily.goal
  const meWeights = me?.weights

  useEffect(() => {
    if (!meName || !meGoal || !meWeights) return
    setName(meName)
    setGoal(meGoal)
    setWeights(normalizeWeights(meWeights))
  }, [meName, meGoal, meWeights])

  if (!me) return null

  const isGuest = me.user.email.endsWith('@enem.local')
  const goalOptions = Array.from(new Set([...BASE_GOALS, goal, me.daily.goal])).sort((a, b) => a - b)
  const accountDirty = name.trim() !== me.user.name || goal !== me.daily.goal
  const weightsDirty = SUBJECTS.some((subject) => weights[subject.key] !== me.weights[subject.key])
  const prioritized = [...SUBJECTS].sort(
    (a, b) => weights[b.key] - weights[a.key] || a.label.localeCompare(b.label, 'pt-BR'),
  )

  const saveAccount = async () => {
    if (savingAccount) return
    const trimmed = name.trim()
    if (trimmed.length < 2) {
      setAccountError('O nome precisa ter pelo menos 2 caracteres.')
      return
    }
    if (trimmed.length > 60) {
      setAccountError('Use no máximo 60 caracteres no nome.')
      return
    }
    if (!accountDirty) return

    setSavingAccount(true)
    setAccountError(null)
    setAccountSaved(false)

    const payload: { name?: string; daily_goal?: number } = {}
    if (trimmed !== me.user.name) payload.name = trimmed
    if (goal !== me.daily.goal) payload.daily_goal = goal

    try {
      await api.updateMe(payload)
      patchMe({
        user: { ...me.user, name: trimmed },
        daily: { ...me.daily, goal },
      })
      setAccountSaved(true)
    } catch (caught) {
      setAccountError(readErrorMessage(caught, 'Não foi possível salvar seu perfil agora.'))
    } finally {
      setSavingAccount(false)
    }
  }

  const saveWeights = async () => {
    if (savingWeights || !weightsDirty) return
    setSavingWeights(true)
    setWeightsError(null)
    setWeightsSaved(false)
    try {
      const response = await api.saveOnboarding(weights)
      patchMe({ weights: normalizeWeights(response.weights), onboarded: response.onboarded })
      setWeightsSaved(true)
    } catch (caught) {
      setWeightsError(readErrorMessage(caught, 'Não foi possível salvar os pesos agora.'))
    } finally {
      setSavingWeights(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/', { replace: true })
  }

  const handleGuestUpgrade = () => {
    logout()
    navigate('/', { replace: true, state: { mode: 'register' } })
  }

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lime">Configurações</p>
          <h1 className="mt-2 font-display text-[30px] font-bold leading-tight text-white sm:text-[38px]">
            Seu perfil
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/45">
            Ajuste seu nome, sua meta diária e o peso de cada matéria. O feed usa tudo isso na
            próxima questão.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-start sm:self-auto">
          <span className="pill border-lime/25 bg-lime/[0.07] text-lime">
            <Flame className="h-3 w-3" aria-hidden="true" />
            {me.streak.current} {me.streak.current === 1 ? 'dia' : 'dias'}
          </span>
          <span className="pill border-white/10 bg-white/[0.03] text-white/45">
            <Target className="h-3 w-3" aria-hidden="true" />
            {me.daily.answered}/{me.daily.goal} hoje
          </span>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
        <div className="min-w-0 space-y-4">
          <section className="surface-card p-5 sm:p-6" aria-labelledby="account-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="account-title" className="font-display text-lg font-semibold text-white">
                  Conta
                </h2>
                <p className="mt-0.5 text-[11px] text-white/35">Como você aparece no app.</p>
              </div>
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet/15 text-violet-soft">
                <UserRound className="h-4 w-4" aria-hidden="true" />
              </span>
            </div>

            {isGuest && (
              <div className="mt-4 rounded-2xl border border-violet/25 bg-violet/[0.07] p-3.5">
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-white/60">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-soft" aria-hidden="true" />
                  Você está em uma conta de convidado. O progresso fica neste navegador enquanto a
                  sessão existir.
                </p>
                <button
                  type="button"
                  onClick={handleGuestUpgrade}
                  className="mt-2.5 inline-flex items-center gap-1.5 text-[11px] font-semibold text-lime transition hover:text-lime-soft"
                >
                  Sair e criar uma conta
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            )}

            <form
              className="mt-4 space-y-3.5"
              onSubmit={(event) => {
                event.preventDefault()
                void saveAccount()
              }}
            >
              <div>
                <label htmlFor="profile-name" className="field-label">
                  Nome
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={name}
                  maxLength={60}
                  onChange={(event) => {
                    setName(event.target.value)
                    setAccountSaved(false)
                    setAccountError(null)
                  }}
                  autoComplete="name"
                  className="field"
                  disabled={savingAccount}
                />
              </div>

              <div>
                <span className="field-label">E-mail</span>
                <div className="flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-4 py-3">
                  <Mail className="h-4 w-4 shrink-0 text-white/25" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-sm text-white/45">
                    {me.user.email}
                  </span>
                  <Lock className="h-3.5 w-3.5 shrink-0 text-white/20" aria-hidden="true" />
                </div>
                <p className="mt-1.5 flex items-center gap-1.5 text-[10px] text-white/25">
                  <ShieldCheck className="h-3 w-3" aria-hidden="true" />
                  O e-mail identifica sua conta e não pode ser alterado.
                </p>
              </div>

              <div>
                <span className="field-label">Meta diária</span>
                <div
                  className="grid gap-2"
                  style={{ gridTemplateColumns: `repeat(${goalOptions.length}, minmax(0, 1fr))` }}
                  role="group"
                  aria-label="Meta diária de questões"
                >
                  {goalOptions.map((option) => {
                    const selected = goal === option
                    return (
                      <button
                        key={option}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => {
                          setGoal(option)
                          setAccountSaved(false)
                          setAccountError(null)
                        }}
                        disabled={savingAccount}
                        className={`rounded-2xl border px-2 py-2.5 transition active:scale-[0.99] disabled:opacity-50 ${
                          selected
                            ? 'border-lime/45 bg-lime/[0.1] text-white'
                            : 'border-white/[0.08] bg-white/[0.02] text-white/45 hover:border-white/20'
                        }`}
                      >
                        <span
                          className={`block font-display text-lg font-bold tabular-nums ${
                            selected ? 'text-lime' : ''
                          }`}
                        >
                          {option}
                        </span>
                        <span className="mt-0.5 block text-[10px] text-white/35">questões</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {accountError && (
                <p role="alert" className="text-xs text-danger">
                  {accountError}
                </p>
              )}

              <div className="flex items-center gap-3 pt-1">
                <button
                  type="submit"
                  disabled={!accountDirty || savingAccount}
                  className="btn-primary flex-1 sm:flex-none sm:px-5"
                >
                  {savingAccount ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  )}
                  Salvar alterações
                </button>
                {accountSaved && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Salvo
                  </span>
                )}
              </div>
            </form>
          </section>

          <section className="surface-card p-5 sm:p-6" aria-labelledby="weights-title">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="weights-title" className="font-display text-lg font-semibold text-white">
                  Pesos do feed
                </h2>
                <p className="mt-0.5 text-[11px] text-white/35">
                  1 = tranquilo · 5 = preciso muito. Vale na próxima questão.
                </p>
              </div>
              <span className="pill shrink-0 border-white/[0.08] bg-white/[0.03] text-white/35">
                {weightsDirty ? 'não salvo' : 'atual'}
              </span>
            </div>

            <div className="mt-4">
              <WeightEditor
                weights={weights}
                onChange={(next) => {
                  setWeights(next)
                  setWeightsSaved(false)
                  setWeightsError(null)
                }}
                disabled={savingWeights}
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <p className="text-[10px] leading-relaxed text-white/30">
                Seu foco atual:{' '}
                <span className="text-white/55">
                  {prioritized
                    .slice(0, 3)
                    .map((subject) => `${subject.label} (${WEIGHT_LABELS[weights[subject.key]]})`)
                    .join(' · ')}
                </span>
              </p>
              <div className="flex items-center gap-3">
                {weightsSaved && (
                  <span className="flex items-center gap-1 text-[11px] font-semibold text-success">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    Pesos salvos
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void saveWeights()}
                  disabled={!weightsDirty || savingWeights}
                  className="btn-secondary min-h-[40px] px-4 text-xs"
                >
                  {savingWeights ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  )}
                  Salvar pesos
                </button>
              </div>
            </div>
            {weightsError && (
              <p role="alert" className="mt-2 text-xs text-danger">
                {weightsError}
              </p>
            )}
          </section>
        </div>

        <div className="min-w-0 space-y-4">
          <section
            className="rounded-4xl border border-violet/20 bg-violet/[0.05] p-5 sm:p-6"
            aria-labelledby="algorithm-title"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet/15 text-violet-soft">
                <Brain className="h-4 w-4" aria-hidden="true" />
              </span>
              <h2 id="algorithm-title" className="font-display text-lg font-semibold text-white">
                Como o feed escolhe
              </h2>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-white/50">
              Cada questão recebe uma pontuação. As maiores aparecem primeiro — e o cálculo é
              recalculado a cada resposta sua.
            </p>

            <ul className="mt-4 space-y-3">
              {[
                {
                  value: 'peso × 10',
                  label: 'Matérias que você marcou como difíceis começam na frente (10 a 50 pontos).',
                },
                {
                  value: '+ prioridade',
                  label:
                    'Tópicos com erros acumulam prioridade de 0 a 100. Dois erros seguidos levam a 100.',
                },
                {
                  value: '+ 12',
                  label: 'Questões que você nunca viu ganham um bônus.',
                },
                {
                  value: '− 40 / − 8',
                  label:
                    'Questões vistas nas últimas 6h perdem espaço; já respondidas antes também pesam menos.',
                },
                {
                  value: '0–4',
                  label: 'Uma variação leve embaralha a ordem e evita que o feed fique repetitivo.',
                },
              ].map((rule) => (
                <li key={rule.value} className="flex items-start gap-2.5">
                  <span className="mt-0.5 shrink-0 rounded-lg border border-white/10 bg-ink/50 px-2 py-1 font-mono text-[10px] font-semibold text-lime">
                    {rule.value}
                  </span>
                  <p className="text-[11px] leading-relaxed text-white/45">{rule.label}</p>
                </li>
              ))}
            </ul>

            <p className="mt-4 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[10px] leading-relaxed text-white/30">
              Acertos reduzem a prioridade aos poucos. A meta diária e o streak medem consistência,
              não dificuldade.
            </p>
          </section>

          <section className="surface-card p-5 sm:p-6" aria-labelledby="session-title">
            <h2 id="session-title" className="font-display text-lg font-semibold text-white">
              Sessão
            </h2>
            <p className="mt-1.5 text-[11px] leading-relaxed text-white/40">
              Você continua conectado neste navegador até sair. Nada de senha fica salva no
              localStorage — apenas o token da sessão.
            </p>

            <div className="mt-4 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-4 py-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">
                Resumo
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/50">
                <span>
                  Streak atual <strong className="text-white/80">{me.streak.current}</strong>
                </span>
                <span>
                  Recorde <strong className="text-white/80">{me.streak.best}</strong>
                </span>
                <span>
                  Hoje <strong className="text-white/80">{me.daily.answered}</strong>
                </span>
                <span>
                  Meta <strong className="text-white/80">{me.daily.goal}</strong>
                </span>
              </div>
            </div>

            <button type="button" onClick={handleLogout} className="btn-danger mt-4 w-full">
              <LogOut className="h-4 w-4" aria-hidden="true" />
              Sair da conta
            </button>
          </section>
        </div>
      </div>
    </div>
  )
}
