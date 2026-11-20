import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  Check,
  Info,
  Landmark,
  Loader2,
  Scale,
  Sigma,
  Sparkles,
  Target,
} from 'lucide-react'
import { api, type Weights } from '../api'
import { useAuth } from '../auth'
import { Brand, SplashScreen } from '../components/Brand'
import { WeightEditor } from '../components/WeightEditor'
import { readErrorMessage } from '../lib/format'
import { normalizeWeights, ONBOARDING_PRESETS, SUBJECTS } from '../lib/subjects'

const PRESET_ICONS = {
  exatas: Sigma,
  humanas: Landmark,
  equilibrio: Scale,
} as const

export default function OnboardingPage() {
  const { me, patchMe, logout } = useAuth()
  const navigate = useNavigate()

  const [weights, setWeights] = useState<Weights>(() => normalizeWeights(me?.weights))
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const ranking = useMemo(
    () =>
      SUBJECTS.map((subject) => ({ ...subject, weight: weights[subject.key] })).sort(
        (a, b) => b.weight - a.weight || a.label.localeCompare(b.label, 'pt-BR'),
      ),
    [weights],
  )

  const prioritySubjects = ranking.filter((subject) => subject.weight >= 4)
  const focus = (prioritySubjects.length > 0 ? prioritySubjects : ranking).slice(0, 3)
  const averageWeight = (
    Object.values(weights).reduce((total, value) => total + value, 0) / SUBJECTS.length
  )
    .toFixed(1)
    .replace('.', ',')
  const maxedCount = ranking.filter((subject) => subject.weight === 5).length

  const applyPreset = (presetId: string, presetWeights: Weights) => {
    setWeights(presetWeights)
    setActivePreset(presetId)
    setError(null)
  }

  const handleChange = (next: Weights) => {
    setWeights(next)
    setActivePreset(null)
    setError(null)
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    setError(null)
    try {
      const response = await api.saveOnboarding(weights)
      patchMe({ onboarded: response.onboarded, weights: normalizeWeights(response.weights) })
      navigate('/feed', { replace: true })
    } catch (caught) {
      setError(readErrorMessage(caught, 'Não foi possível salvar seus pesos. Tente novamente.'))
    } finally {
      setSaving(false)
    }
  }

  if (!me) return <SplashScreen />

  return (
    <div className="stage-bg relative min-h-[100dvh] overflow-x-hidden">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-70" aria-hidden="true" />
      <div
        className="pointer-events-none absolute -right-36 -top-40 h-[420px] w-[420px] rounded-full bg-violet/[0.13] blur-[110px]"
        aria-hidden="true"
      />

      <header className="relative mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
        <Brand size={30} />
        {me.onboarded ? (
          <Link
            to="/feed"
            className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white/45 transition hover:bg-white/[0.05] hover:text-white"
          >
            Voltar ao feed
          </Link>
        ) : (
          <button
            type="button"
            onClick={logout}
            className="rounded-xl px-2.5 py-1.5 text-xs font-semibold text-white/40 transition hover:bg-white/[0.05] hover:text-white"
          >
            Sair
          </button>
        )}
      </header>

      <main className="relative mx-auto w-full max-w-3xl px-4 pb-32 pt-3 sm:px-6 sm:pt-6">
        <span className="pill border-lime/25 bg-lime/[0.07] text-lime">
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          {me.onboarded ? 'Ajuste do feed' : 'Personalização em 1 minuto'}
        </span>

        <h1 className="mt-4 max-w-2xl text-balance font-display text-[34px] font-bold leading-[1.08] tracking-tight text-white sm:text-[44px]">
          Quanto cada matéria pesa no seu estudo?
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/50 sm:text-[15px]">
          Marque de 1 (tranquilo) a 5 (preciso muito) o quanto você quer reforçar cada matéria. O
          feed usa esses pesos sempre — e sobe ainda mais o que você erra.
        </p>

        {me.onboarded && (
          <div className="mt-5 flex items-start gap-2.5 rounded-2xl border border-lime/20 bg-lime/[0.06] px-4 py-3 text-xs leading-relaxed text-white/60">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-lime" aria-hidden="true" />
            <p>
              Seu feed já está rodando. Alterar os pesos reorganiza as próximas questões na hora em
              que você salvar.
            </p>
          </div>
        )}

        <section className="mt-7" aria-labelledby="presets-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="presets-title" className="font-display text-lg font-semibold text-white">
              Comece com um preset
            </h2>
            <span className="text-[11px] text-white/30">ajuste depois</span>
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {ONBOARDING_PRESETS.map((preset) => {
              const Icon = PRESET_ICONS[preset.id as keyof typeof PRESET_ICONS] ?? Target
              const selected = activePreset === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset.id, preset.weights)}
                  aria-pressed={selected}
                  className={`group rounded-2xl border p-3.5 text-left transition active:scale-[0.99] ${
                    selected
                      ? 'border-lime/45 bg-lime/[0.08] shadow-[0_0_30px_-16px_rgba(200,255,77,.5)]'
                      : 'border-white/10 bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.05]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                        selected ? 'bg-lime text-ink' : 'bg-white/[0.06] text-white/55'
                      }`}
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {selected && <Check className="h-4 w-4 text-lime" aria-hidden="true" />}
                  </div>
                  <p className="mt-2.5 text-[13px] font-semibold text-white">{preset.name}</p>
                  <p className="mt-1 text-[11px] leading-snug text-white/40">{preset.description}</p>
                </button>
              )
            })}
          </div>
        </section>

        <section className="mt-7" aria-labelledby="weights-title">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="weights-title" className="font-display text-lg font-semibold text-white">
              Ajuste fino
            </h2>
            <div className="flex items-center gap-2 text-[10px] text-white/35">
              <span>1 tranquilo</span>
              <span className="h-2.5 w-px bg-white/10" aria-hidden="true" />
              <span>5 preciso muito</span>
            </div>
          </div>

          <div className="surface-card mt-3 p-3 sm:p-4">
            <WeightEditor weights={weights} onChange={handleChange} disabled={saving} />
          </div>
        </section>

        <section className="mt-6" aria-labelledby="summary-title">
          <div className="rounded-4xl border border-violet/20 bg-violet/[0.06] p-5">
            <h2
              id="summary-title"
              className="flex items-center gap-2 font-display text-base font-semibold text-white"
            >
              <Target className="h-4 w-4 text-violet-soft" aria-hidden="true" />
              Seu ponto de partida
            </h2>

            <div className="mt-3 flex flex-wrap gap-2">
              {focus.map((subject) => (
                <span
                  key={subject.key}
                  className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium"
                  style={{
                    color: subject.accent,
                    borderColor: `${subject.accent}44`,
                    backgroundColor: `${subject.accent}14`,
                  }}
                >
                  {subject.label}
                  <span className="font-bold tabular-nums">{subject.weight}</span>
                </span>
              ))}
            </div>

            <p className="mt-3 text-[12px] leading-relaxed text-white/50">
              O feed abre com foco em{' '}
              <strong className="font-semibold text-white/75">
                {focus.map((subject) => subject.label).join(', ')}
              </strong>
              . Média de peso {averageWeight}
              {maxedCount > 0
                ? ` · ${maxedCount} ${maxedCount === 1 ? 'matéria no nível máximo' : 'matérias no nível máximo'}`
                : ''}
              .
            </p>
            <p className="mt-2 text-[11px] leading-relaxed text-white/30">
              Cada erro aumenta a prioridade do tópico. Dois erros seguidos e ele vira prioridade
              máxima no feed.
            </p>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-2xl border border-danger/30 bg-danger/[0.08] px-4 py-3 text-xs text-danger"
          >
            {error}
          </div>
        )}
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.08] bg-ink/85 backdrop-blur-xl">
        <div className="safe-bottom mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <div className="hidden min-w-0 flex-1 sm:block">
            <p className="truncate text-xs font-medium text-white/60">
              Foco inicial: {focus.map((subject) => subject.label).join(', ')}
            </p>
            <p className="mt-0.5 text-[10px] text-white/30">Você pode mudar quando quiser em Perfil.</p>
          </div>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="btn-primary w-full sm:w-auto sm:min-w-[210px]"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Salvando…
              </>
            ) : (
              <>
                Salvar e começar
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
