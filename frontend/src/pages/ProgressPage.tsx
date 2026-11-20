import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Flame,
  Loader2,
  RefreshCw,
  Target,
  TrendingUp,
  Trophy,
} from 'lucide-react'
import { api, type DayPoint, type ProgressResponse } from '../api'
import { hexToRgba, formatPercent, formatShortDate, readErrorMessage } from '../lib/format'
import { subjectMeta } from '../lib/subjects'

const RING_RADIUS = 40
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function DailyRing({ answered, goal }: { answered: number; goal: number }) {
  const safeGoal = Math.max(1, goal)
  const ratio = Math.min(1, Math.max(0, answered / safeGoal))
  const complete = answered >= safeGoal

  return (
    <div className="relative h-[112px] w-[112px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="50" cy="50" r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="7" />
        <circle
          cx="50"
          cy="50"
          r={RING_RADIUS}
          fill="none"
          stroke={complete ? '#34D399' : '#C8FF4D'}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE * (1 - ratio)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-2xl font-bold tabular-nums text-white">{answered}</span>
        <span className="text-[10px] font-medium text-white/35">de {safeGoal}</span>
      </div>
    </div>
  )
}

function ActivityChart({ days }: { days: DayPoint[] }) {
  const chartWidth = 360
  const chartHeight = 156
  const top = 8
  const baseline = 112
  const barWidth = 14
  const gap = 10
  const slot = barWidth + gap
  const startX = (chartWidth - (days.length * slot - gap)) / 2
  const maxAnswered = Math.max(1, ...days.map((day) => day.answered))
  const totalAnswered = days.reduce((total, day) => total + day.answered, 0)
  const totalCorrect = days.reduce((total, day) => total + day.correct, 0)

  return (
    <div>
      <svg
        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        className="mt-3 h-auto w-full"
        role="img"
        aria-label={`Gráfico dos últimos 14 dias: ${totalAnswered} respostas e ${totalCorrect} acertos no total.`}
      >
        <rect
          x={startX - 6}
          y={top - 4}
          width={chartWidth - 2 * startX + 12}
          height={baseline - top + 8}
          rx="12"
          fill="rgba(255,255,255,.015)"
        />
        {days.map((day, index) => {
          const x = startX + index * slot
          const totalHeight = (day.answered / maxAnswered) * (baseline - top)
          const correctHeight = (day.correct / maxAnswered) * (baseline - top)
          const isToday = index === days.length - 1
          const showLabel = index % 2 === 0 || isToday

          return (
            <g key={day.date}>
              <title>{`${formatShortDate(day.date)}: ${day.answered} respostas, ${day.correct} acertos`}</title>
              <rect
                x={x}
                y={top}
                width={barWidth}
                height={baseline - top}
                rx="4"
                fill="rgba(255,255,255,.035)"
              />
              {day.answered > 0 && (
                <rect
                  x={x}
                  y={baseline - Math.max(totalHeight, 3)}
                  width={barWidth}
                  height={Math.max(totalHeight, 3)}
                  rx="4"
                  fill="rgba(200,255,77,.22)"
                />
              )}
              {day.correct > 0 && (
                <rect
                  x={x}
                  y={baseline - Math.max(correctHeight, 3)}
                  width={barWidth}
                  height={Math.max(correctHeight, 3)}
                  rx="4"
                  fill="#C8FF4D"
                />
              )}
              {showLabel && (
                <text
                  x={x + barWidth / 2}
                  y={baseline + 19}
                  textAnchor="middle"
                  fontSize="9.5"
                  fill={isToday ? '#C8FF4D' : 'rgba(255,255,255,.4)'}
                  fontWeight={isToday ? 700 : 400}
                >
                  {isToday ? 'hoje' : formatShortDate(day.date)}
                </text>
              )}
            </g>
          )
        })}
        <line
          x1={startX}
          y1={baseline}
          x2={chartWidth - startX}
          y2={baseline}
          stroke="rgba(255,255,255,.08)"
          strokeWidth="1"
        />
      </svg>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-white/35">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-lime/25" aria-hidden="true" />
            Respostas
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-lime" aria-hidden="true" />
            Acertos
          </span>
        </div>
        <span>
          {totalAnswered} respostas · {totalCorrect} acertos
        </span>
      </div>
    </div>
  )
}

function ProgressSkeleton() {
  return (
    <div className="mt-8 space-y-3" aria-busy="true">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="skeleton h-40" />
        <div className="skeleton h-40" />
        <div className="skeleton h-40" />
      </div>
      <div className="skeleton mt-6 h-72" />
      <div className="skeleton h-56" />
      <p className="sr-only">Carregando seu progresso…</p>
    </div>
  )
}

export default function ProgressPage() {
  const [data, setData] = useState<ProgressResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await api.progress()
      setData(response)
    } catch (caught) {
      setError(readErrorMessage(caught, 'Não foi possível carregar seu progresso agora.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const weakTopics = data?.weak_topics ?? []
  const strongestWeak = weakTopics[0]
  const daily = data?.daily
  const dailyRemaining = daily ? Math.max(0, daily.goal - daily.answered) : 0
  const dailyComplete = Boolean(daily && daily.answered >= daily.goal)

  return (
    <div className="animate-fade-up">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lime">Seu progresso</p>
          <h1 className="mt-2 text-balance font-display text-[30px] font-bold leading-tight text-white sm:text-[38px]">
            O mapa do que falta macetar.
          </h1>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/45">
            Cada resposta recalcula a prioridade dos tópicos. Quanto mais você erra, mais cedo o
            assunto volta ao feed.
          </p>
        </div>
        <Link to="/feed" className="btn-secondary shrink-0 self-start sm:self-auto">
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Voltar ao feed
        </Link>
      </div>

      {loading && !data && <ProgressSkeleton />}

      {error && !data && (
        <div className="surface-card mt-8 p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <h2 className="mt-4 font-display text-lg font-semibold text-white">
            Seu progresso não carregou
          </h2>
          <p className="mt-2 text-sm text-white/45">{error}</p>
          <button type="button" onClick={() => void load()} className="btn-primary mt-4">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar de novo
          </button>
        </div>
      )}

      {data && daily && (
        <>
          {error && (
            <div
              role="alert"
              className="mt-5 flex items-center justify-between gap-3 rounded-2xl border border-danger/25 bg-danger/[0.07] px-4 py-2.5 text-xs text-danger"
            >
              <span>{error}</span>
              <button
                type="button"
                onClick={() => void load()}
                className="shrink-0 font-semibold text-white underline-offset-2 hover:underline"
              >
                Atualizar
              </button>
            </div>
          )}

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="relative overflow-hidden rounded-4xl border border-lime/20 bg-gradient-to-br from-lime/[0.14] via-surface to-surface p-5 shadow-lift">
              <div
                className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-lime/20 blur-3xl"
                aria-hidden="true"
              />
              <div className="relative flex items-start justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-lime/80">
                  Sequência
                </span>
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-lime/15 text-lime">
                  <Flame className="h-5 w-5" fill="currentColor" aria-hidden="true" />
                </span>
              </div>
              <p className="relative mt-4 font-display text-[46px] font-bold leading-none tabular-nums text-white">
                {data.streak.current}
              </p>
              <p className="relative mt-1 text-xs font-medium text-white/45">
                {data.streak.current === 1 ? 'dia seguido' : 'dias seguidos'}
              </p>
              <div className="relative mt-4 flex items-center gap-2 text-[11px] text-white/40">
                <Trophy className="h-3.5 w-3.5 text-white/30" aria-hidden="true" />
                Recorde: {data.streak.best} {data.streak.best === 1 ? 'dia' : 'dias'}
              </div>
              <p className="relative mt-1.5 text-[10px] text-white/25">
                {data.streak.last_active_date
                  ? `Último treino em ${formatShortDate(data.streak.last_active_date)}`
                  : 'Nenhum treino registrado ainda'}
              </p>
            </div>

            <div className="surface-card p-5">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                  Meta de hoje
                </span>
                <Target className="h-4 w-4 text-white/25" aria-hidden="true" />
              </div>
              <div className="mt-3 flex items-center gap-4">
                <DailyRing answered={daily.answered} goal={daily.goal} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {dailyComplete ? 'Meta batida!' : `${dailyRemaining} para fechar`}
                  </p>
                  <p className="mt-1 text-[11px] leading-relaxed text-white/40">
                    {dailyComplete
                      ? 'Você já garantiu o treino de hoje. Extras contam para o streak.'
                      : `${daily.answered} de ${daily.goal} questões. Cada card conta.`}
                  </p>
                </div>
              </div>
            </div>

            <div className="surface-card p-5">
              <div className="flex items-start justify-between">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
                  Acurácia total
                </span>
                <TrendingUp className="h-4 w-4 text-white/25" aria-hidden="true" />
              </div>
              <p className="mt-4 font-display text-[42px] font-bold leading-none tabular-nums text-white">
                {formatPercent(data.totals.accuracy)}
              </p>
              <p className="mt-1 text-xs text-white/45">
                {data.totals.correct} de {data.totals.answered} respostas
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-lime/70 to-lime"
                  style={{ width: `${Math.min(100, Math.max(0, data.totals.accuracy))}%` }}
                />
              </div>
              <p className="mt-2 text-[10px] text-white/25">
                {data.totals.answered === 0
                  ? 'Responda a primeira questão para começar.'
                  : 'Acurácia não define prioridade — ela mostra evolução.'}
              </p>
            </div>
          </div>

          <section className="mt-8" aria-labelledby="subjects-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="subjects-title" className="font-display text-lg font-semibold text-white">
                  Por matéria
                </h2>
                <p className="mt-0.5 text-[11px] text-white/35">
                  O peso define o ponto de partida no feed.
                </p>
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/25">
                peso · acurácia
              </span>
            </div>

            <div className="surface-card mt-3 divide-y divide-white/[0.05] p-1.5 sm:p-2">
              {data.subjects.map((subject) => {
                const meta = subjectMeta(subject.subject)
                return (
                  <div key={subject.subject} className="px-3 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: meta.accent }}
                          aria-hidden="true"
                        />
                        <span className="truncate text-[13px] font-medium text-white/80">
                          {subject.label}
                        </span>
                        <span className="shrink-0 rounded-md border border-white/[0.08] bg-white/[0.03] px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-white/40">
                          peso {subject.weight}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs font-bold tabular-nums text-white/70">
                        {subject.answered > 0 ? formatPercent(subject.accuracy) : '—'}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full transition-[width] duration-700"
                        style={{
                          width: `${subject.answered > 0 ? Math.min(100, Math.max(0, subject.accuracy)) : 0}%`,
                          backgroundColor: meta.accent,
                          boxShadow: `0 0 12px ${hexToRgba(meta.accent, 0.35)}`,
                        }}
                      />
                    </div>
                    <p className="mt-1.5 text-[10px] text-white/25">
                      {subject.answered === 0
                        ? 'Ainda sem respostas'
                        : `${subject.answered} respostas · ${subject.correct} acertos`}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

          <section className="mt-8" aria-labelledby="weak-title">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="weak-title" className="font-display text-lg font-semibold text-white">
                  Pontos fracos
                </h2>
                <p className="mt-0.5 text-[11px] text-white/35">
                  Tópicos que o feed puxa primeiro.
                </p>
              </div>
              <span className="pill border-white/[0.08] bg-white/[0.03] text-white/35">
                até 8 tópicos
              </span>
            </div>

            {weakTopics.length === 0 ? (
              <div className="surface-card mt-3 flex flex-col items-start gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-lime/10 text-lime">
                    <Target className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Nenhum ponto fraco registrado</p>
                    <p className="mt-1 max-w-md text-[11px] leading-relaxed text-white/40">
                      Responda algumas questões no feed. A cada erro, o tópico entra nesta lista e
                      ganha prioridade.
                    </p>
                  </div>
                </div>
                <Link to="/feed" className="btn-secondary shrink-0">
                  Responder agora
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            ) : (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {weakTopics.map((topic) => {
                  const meta = subjectMeta(topic.subject)
                  const maxPriority = topic.priority >= 80
                  return (
                    <article
                      key={`${topic.subject}-${topic.topic}`}
                      className={`rounded-2xl border p-4 transition ${
                        maxPriority
                          ? 'border-lime/30 bg-lime/[0.06]'
                          : 'border-white/[0.08] bg-surface/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="truncate text-[10px] font-semibold uppercase tracking-[0.12em]"
                          style={{ color: meta.accent }}
                        >
                          {meta.label}
                        </span>
                        {maxPriority ? (
                          <span className="pill shrink-0 border-lime/30 bg-lime/10 text-lime">
                            <Flame className="h-3 w-3" aria-hidden="true" />
                            Prioridade máxima
                          </span>
                        ) : (
                          <span className="shrink-0 text-[10px] font-medium text-white/30">
                            em treino
                          </span>
                        )}
                      </div>
                      <h3 className="mt-1.5 line-clamp-2 font-display text-[15px] font-semibold leading-snug text-white">
                        {topic.topic}
                      </h3>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                          <div
                            className={`h-full rounded-full ${maxPriority ? 'bg-lime' : 'bg-violet'}`}
                            style={{ width: `${Math.min(100, Math.max(0, topic.priority))}%` }}
                          />
                        </div>
                        <span className="w-9 shrink-0 text-right text-[10px] font-bold tabular-nums text-white/50">
                          {Math.round(topic.priority)}
                        </span>
                      </div>
                      <p className="mt-2 text-[10px] text-white/30">
                        {topic.wrong} {topic.wrong === 1 ? 'erro' : 'erros'} · {topic.correct}{' '}
                        {topic.correct === 1 ? 'acerto' : 'acertos'}
                        {topic.consecutive_wrong >= 2
                          ? ` · ${topic.consecutive_wrong} seguidos`
                          : ''}
                      </p>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <section className="surface-card mt-8 p-5 sm:p-6" aria-labelledby="chart-title">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 id="chart-title" className="font-display text-lg font-semibold text-white">
                  Últimos 14 dias
                </h2>
                <p className="mt-0.5 text-[11px] text-white/35">
                  Consistência vale mais que maratona.
                </p>
              </div>
              <span className="text-[10px] font-medium text-white/30">hoje + 13 dias</span>
            </div>

            <div className="relative">
              <ActivityChart days={data.last14} />
              {data.last14.every((day) => day.answered === 0) && (
                <p className="pointer-events-none absolute inset-x-0 top-[42%] text-center text-xs text-white/30">
                  Sem respostas nos últimos 14 dias
                </p>
              )}
            </div>
          </section>

          <section className="relative mt-8 overflow-hidden rounded-4xl border border-lime/25 bg-gradient-to-br from-lime/[0.14] via-surface to-surface p-6 shadow-lift sm:flex sm:items-center sm:justify-between sm:gap-6">
            <div
              className="pointer-events-none absolute -right-10 -top-16 h-44 w-44 rounded-full bg-lime/15 blur-3xl"
              aria-hidden="true"
            />
            <div className="relative">
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-lime/80">
                Plano de ataque
              </p>
              <h2 className="mt-1.5 font-display text-2xl font-bold text-white">
                Treinar meus pontos fracos
              </h2>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-white/45">
                {strongestWeak
                  ? `O feed começa por ${strongestWeak.topic} (${subjectMeta(strongestWeak.subject).label}) e mistura o resto da sua fila.`
                  : 'Responda mais questões para o feed montar sua fila personalizada.'}
              </p>
            </div>
            <Link to="/feed" className="btn-primary relative mt-5 w-full shrink-0 sm:mt-0 sm:w-auto">
              <Flame className="h-4 w-4" aria-hidden="true" />
              Voltar ao feed
            </Link>
          </section>

          <p className="mt-4 flex items-center justify-center gap-1.5 text-[10px] text-white/20">
            <Loader2 className={`h-3 w-3 ${loading ? 'animate-spin' : 'hidden'}`} aria-hidden="true" />
            {loading ? 'Atualizando estatísticas…' : 'Estatísticas atualizadas a cada resposta.'}
          </p>
        </>
      )}
    </div>
  )
}
