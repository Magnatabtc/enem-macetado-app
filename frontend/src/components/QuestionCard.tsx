import { memo } from 'react'
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Flame,
  Loader2,
  RefreshCw,
  Sparkles,
  X,
} from 'lucide-react'
import type { FeedQuestion } from '../api'
import { hexToRgba, LETTERS, plural } from '../lib/format'
import { subjectMeta } from '../lib/subjects'
import { QUESTION_TIME_LIMIT_SECONDS, type CardState } from '../lib/feed'
import { useInert } from '../lib/useInert'

interface QuestionCardProps {
  question: FeedQuestion
  index: number
  total: number
  active: boolean
  card: CardState
  elapsedMs: number
  showScrollHint: boolean
  nextLabel: string
  nextDisabled: boolean
  onSelect: (question: FeedQuestion, optionIndex: number) => void
  onRetry: (question: FeedQuestion) => void
  onSkip: () => void
  onOpenSheet: (question: FeedQuestion) => void
  onNext: () => void
}

function TimerRing({ elapsedMs, answered }: { elapsedMs: number; answered: boolean }) {
  const secondsLeft = Math.max(0, QUESTION_TIME_LIMIT_SECONDS - Math.floor(elapsedMs / 1000))
  const urgent = !answered && secondsLeft <= 10 && secondsLeft > 0
  const expired = !answered && secondsLeft === 0
  const circumference = 2 * Math.PI * 18.5
  const progress = answered ? 0 : secondsLeft / QUESTION_TIME_LIMIT_SECONDS
  const stroke = urgent || expired ? '#FB7185' : '#C8FF4D'

  return (
    <div
      className={`flex items-center gap-2.5 ${urgent ? 'animate-timer-alert' : ''}`}
      role="img"
      aria-label={
        answered
          ? 'Questão respondida, cronômetro encerrado'
          : expired
            ? 'Tempo esgotado. Você ainda pode responder.'
            : `Tempo restante: ${secondsLeft} segundos`
      }
    >
      <div className="relative h-11 w-11 shrink-0">
        <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90" aria-hidden="true">
          <circle cx="22" cy="22" r="18.5" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="2.5" />
          <circle
            cx="22"
            cy="22"
            r="18.5"
            fill="none"
            stroke={stroke}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-300 ease-linear"
          />
        </svg>
        <span
          className={`absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular-nums ${
            urgent || expired ? 'text-danger' : 'text-white/70'
          }`}
          aria-hidden="true"
        >
          {secondsLeft}
        </span>
      </div>
      <div className="hidden leading-tight sm:block" aria-hidden="true">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/35">
          {answered ? 'Respondida' : expired ? 'Tempo esgotado' : 'Tempo'}
        </p>
        <p className="text-[11px] text-white/50">
          {answered ? 'Boa, segue o jogo' : expired ? 'Pode responder' : 'Sem pressa'}
        </p>
      </div>
    </div>
  )
}

function QuestionCardBase({
  question,
  index,
  total,
  active,
  card,
  elapsedMs,
  showScrollHint,
  nextLabel,
  nextDisabled,
  onSelect,
  onRetry,
  onSkip,
  onOpenSheet,
  onNext,
}: QuestionCardProps) {
  const meta = subjectMeta(question.subject)
  const answered = Boolean(card.result)
  const correct = card.result?.correct === true
  const correctIndex = card.result?.correct_index ?? -1
  const letters = LETTERS.slice(0, question.alternatives.length)
  const sectionRef = useInert<HTMLElement>(!active)

  return (
    <section
      ref={sectionRef}
      className="relative flex h-[100dvh] w-full shrink-0 snap-start snap-always flex-col overflow-hidden"
      aria-label={`Questão ${index + 1} de ${total}: ${question.subject_label}`}
      data-active={active ? 'true' : 'false'}
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background: `radial-gradient(760px 420px at 50% -6%, ${hexToRgba(meta.accent, 0.1)}, transparent 62%),
                       radial-gradient(520px 420px at 100% 108%, rgba(139,92,246,.08), transparent 70%)`,
        }}
      />

      <div className="relative mx-auto flex h-full w-full max-w-[560px] flex-col px-4 pb-[104px] pt-[100px] sm:px-6">
        <div className="flex items-center gap-2">
          <span
            className="pill shrink-0"
            style={{
              color: meta.accent,
              borderColor: hexToRgba(meta.accent, 0.28),
              backgroundColor: hexToRgba(meta.accent, 0.1),
            }}
          >
            {question.subject_label}
          </span>

          <span className="flex items-center gap-[3px]" aria-hidden="true">
            {Array.from({ length: 5 }, (_, dot) => (
              <span
                key={dot}
                className="h-1 w-1 rounded-full"
                style={{
                  backgroundColor:
                    dot < question.difficulty ? hexToRgba(meta.accent, 0.8) : 'rgba(255,255,255,.14)',
                }}
              />
            ))}
          </span>
          <span className="sr-only">Dificuldade {question.difficulty} de 5</span>

          <span className="ml-auto min-w-0 truncate text-right text-[11px] font-medium text-white/40">
            {question.topic}
          </span>
        </div>

        <div data-scrollable className="no-scrollbar mt-4 min-h-0 flex-1 overflow-y-auto pb-2 pr-0.5">
          <h2 className="text-balance font-display text-[clamp(1.14rem,4.7vw,1.6rem)] font-semibold leading-[1.4] text-white">
            {question.statement}
          </h2>

          <div className="mt-4 space-y-1.5">
            {question.alternatives.map((alternative, optionIndex) => {
              const isCorrectOption = answered && optionIndex === correctIndex
              const isWrongSelected = answered && card.selected === optionIndex && !isCorrectOption
              const isDimmed = answered && !isCorrectOption && card.selected !== optionIndex
              const isPending = card.pending && card.selected === optionIndex

              const tone = isCorrectOption
                ? 'border-success/60 bg-success/[0.12] text-white'
                : isWrongSelected
                  ? 'border-danger/60 bg-danger/[0.1] text-white'
                  : isDimmed
                    ? 'border-white/[0.06] bg-white/[0.015] text-white/45'
                    : 'border-white/10 bg-white/[0.03] text-white/85 hover:border-white/25 hover:bg-white/[0.06]'

              const badgeTone = isCorrectOption
                ? 'bg-success text-ink'
                : isWrongSelected
                  ? 'bg-danger text-ink'
                  : isDimmed
                    ? 'border-white/10 text-white/30'
                    : 'border-white/15 text-white/60'

              return (
                <button
                  key={`${question.id}-${optionIndex}`}
                  type="button"
                  disabled={answered || card.pending}
                  onClick={() => onSelect(question, optionIndex)}
                  aria-label={`Alternativa ${letters[optionIndex]}: ${alternative}`}
                  className={`flex w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left transition duration-200 active:scale-[0.995] disabled:cursor-default ${tone}`}
                >
                  <span
                    className={`mt-[1px] flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[11px] font-bold ${badgeTone}`}
                    aria-hidden="true"
                  >
                    {letters[optionIndex]}
                  </span>
                  <span className="min-w-0 flex-1 text-[13.5px] leading-snug sm:text-[14.5px]">
                    {alternative}
                  </span>
                  <span className="mt-0.5 shrink-0" aria-hidden="true">
                    {isCorrectOption && <Check className="h-4 w-4 text-success" />}
                    {isWrongSelected && <X className="h-4 w-4 text-danger" />}
                    {isPending && <Loader2 className="h-4 w-4 animate-spin text-lime" />}
                  </span>
                </button>
              )
            })}
          </div>

          {card.error && (
            <div
              role="alert"
              className="mt-4 flex flex-col gap-2 rounded-2xl border border-danger/30 bg-danger/[0.08] px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <p className="flex items-start gap-2 text-xs leading-snug text-danger">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                {card.error}
              </p>
              <button
                type="button"
                onClick={() => onRetry(question)}
                className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-lg text-xs font-semibold text-white underline-offset-4 hover:underline sm:self-auto"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Tentar de novo
              </button>
            </div>
          )}

          {card.result && (
            <div
              role="status"
              className={`mt-4 rounded-2xl border px-3.5 py-3 ${
                correct ? 'border-success/35 bg-success/[0.08]' : 'border-danger/35 bg-danger/[0.08]'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    correct ? 'bg-success text-ink' : 'bg-danger text-ink'
                  }`}
                  aria-hidden="true"
                >
                  {correct ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">
                    {correct
                      ? 'Acertou na mosca.'
                      : `Quase. A correta é ${LETTERS[correctIndex]}.`}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/50">
                    {card.result.daily.answered}/{card.result.daily.goal} hoje ·{' '}
                    {plural(card.result.streak.current, 'dia seguido', 'dias seguidos')}
                  </p>
                </div>
                {card.result.topic.is_priority && (
                  <span className="pill shrink-0 border-lime/30 bg-lime/10 text-lime">
                    <Flame className="h-3 w-3" aria-hidden="true" />
                    Prioridade
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 flex shrink-0 items-center justify-between gap-3 border-t border-white/[0.07] pt-3">
          <TimerRing elapsedMs={elapsedMs} answered={answered} />

          <div className="flex items-center gap-2">
            {answered && (
              <button
                type="button"
                onClick={() => onOpenSheet(question)}
                className="btn-ghost min-h-[44px] gap-1.5 px-3 text-xs"
              >
                <Sparkles className="h-4 w-4" aria-hidden="true" />
                Explicação
              </button>
            )}
            {!answered && (
              <button
                type="button"
                onClick={onSkip}
                className="btn-ghost min-h-[44px] px-3 text-xs"
                aria-label="Pular esta questão"
              >
                Pular
              </button>
            )}
            {answered ? (
              <button
                type="button"
                onClick={onNext}
                disabled={nextDisabled}
                className="btn-primary min-h-[44px] px-4 text-xs sm:text-sm"
              >
                {nextDisabled ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                )}
                {nextLabel}
              </button>
            ) : (
              <span className="hidden items-center gap-1.5 text-[11px] text-white/30 md:flex">
                Use
                <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-sans text-[10px] text-white/55">
                  1–5
                </kbd>
                para responder
              </span>
            )}
          </div>
        </div>
      </div>

      {showScrollHint && (
        <div className="pointer-events-none absolute inset-x-0 bottom-[70px] z-40 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-ink/80 px-3.5 py-1.5 text-[11px] font-medium text-white/65 shadow-lg backdrop-blur-md">
            <ChevronUp className="h-3.5 w-3.5 animate-bounce-soft text-lime" aria-hidden="true" />
            Arraste para cima
          </span>
        </div>
      )}
    </section>
  )
}

export const QuestionCard = memo(QuestionCardBase)
