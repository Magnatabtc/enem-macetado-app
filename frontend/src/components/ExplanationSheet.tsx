import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, Flame, Mic, Sparkles, X, XCircle } from 'lucide-react'
import type { AttemptResponse, FeedQuestion } from '../api'
import { LETTERS } from '../lib/format'

interface ExplanationSheetProps {
  open: boolean
  question: FeedQuestion | null
  result: AttemptResponse | null
  selectedIndex: number | null
  nextLabel: string
  onClose: () => void
  onNext: () => void
  onOpenTutor: () => void
}

export function ExplanationSheet({
  open,
  question,
  result,
  selectedIndex,
  nextLabel,
  onClose,
  onNext,
  onOpenTutor,
}: ExplanationSheetProps) {
  const closeButtonRef = useRef<HTMLButtonElement | null>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    const appRoot = document.getElementById('root')
    document.body.style.overflow = 'hidden'
    appRoot?.setAttribute('inert', '')

    const focusTimer = window.setTimeout(() => closeButtonRef.current?.focus(), 60)

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
      appRoot?.removeAttribute('inert')
      document.body.style.overflow = previousOverflow
      previousFocusRef.current?.focus?.({ preventScroll: true })
    }
  }, [open, onClose])

  if (!open || !question || !result) return null

  const isCorrect = result.correct
  const correctLetter = LETTERS[result.correct_index] ?? '?'
  const selectedLetter =
    selectedIndex !== null && selectedIndex >= 0 && selectedIndex < LETTERS.length
      ? LETTERS[selectedIndex]
      : null

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 animate-fade-in bg-ink/80 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="explanation-title"
        className="absolute inset-x-0 bottom-0 mx-auto flex max-h-[88dvh] w-full max-w-[560px] animate-slide-up flex-col overflow-hidden rounded-t-4xl border border-b-0 border-white/10 bg-surface shadow-sheet"
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-white/15" aria-hidden="true" />

        <div className="relative px-5 pb-1 pt-4">
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="icon-button absolute right-4 top-3 h-9 w-9"
            aria-label="Fechar explicação"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>

          <div className="flex items-start gap-3 pr-11">
            <span
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                isCorrect ? 'bg-success/15 text-success' : 'bg-danger/15 text-danger'
              }`}
              aria-hidden="true"
            >
              {isCorrect ? <CheckCircle2 className="h-6 w-6" /> : <XCircle className="h-6 w-6" />}
            </span>
            <div className="min-w-0">
              <h2 id="explanation-title" className="font-display text-lg font-semibold text-white">
                {isCorrect ? 'Mandou bem!' : 'Quase lá…'}
              </h2>
              <p className="mt-0.5 text-xs text-white/50">
                {isCorrect
                  ? 'Resposta correta. Guarde o raciocínio para a próxima.'
                  : `A alternativa correta é a ${correctLetter}.`}
              </p>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="pill border-white/10 bg-white/[0.04] text-white/55">
              {question.subject_label}
            </span>
            <span className="pill max-w-[65%] truncate border-white/10 bg-white/[0.04] text-white/45">
              {question.topic}
            </span>
            {result.topic.is_priority && (
              <span className="pill border-lime/30 bg-lime/10 text-lime">
                <Flame className="h-3 w-3" aria-hidden="true" />
                Prioridade máxima
              </span>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3">
          <p className="line-clamp-2 rounded-xl border-l-2 border-white/10 pl-3 text-[11px] leading-relaxed text-white/35">
            {question.statement}
          </p>

          <div className="mt-4 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-lime">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Explicação
            </p>
            <p className="mt-2 text-sm leading-relaxed text-white/75">{result.explanation}</p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/[0.06] px-4 py-3 text-[11px] text-white/45">
            {selectedLetter && (
              <>
                <span>
                  Você marcou <strong className="text-white/80">{selectedLetter}</strong>
                </span>
                <span className="h-3 w-px bg-white/10" aria-hidden="true" />
              </>
            )}
            <span>
              Gabarito <strong className="text-white/80">{correctLetter}</strong>
            </span>
            <span className="h-3 w-px bg-white/10" aria-hidden="true" />
            <span>
              {isCorrect
                ? 'Prioridade reduzida neste tópico'
                : 'Prioridade aumentada neste tópico'}
            </span>
            {result.topic.consecutive_wrong >= 2 && (
              <>
                <span className="h-3 w-px bg-white/10" aria-hidden="true" />
                <span className="text-lime">
                  {result.topic.consecutive_wrong} erros seguidos: volta logo
                </span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={onOpenTutor}
            className="mt-3 flex w-full items-center justify-between gap-3 rounded-2xl border border-violet/25 bg-violet/[0.08] px-4 py-3 text-left transition hover:border-violet/45 hover:bg-violet/[0.12]"
          >
            <span>
              <span className="block text-xs font-semibold text-white">Ainda ficou com dúvida?</span>
              <span className="mt-0.5 block text-[11px] text-white/45">
                Peça outra explicação para o tutor, por voz ou texto.
              </span>
            </span>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet/20 text-violet-soft">
              <Mic className="h-4 w-4" aria-hidden="true" />
            </span>
          </button>
        </div>

        <div className="shrink-0 border-t border-white/[0.07] bg-surface/95 px-5 py-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button type="button" onClick={onNext} className="btn-primary w-full">
            {nextLabel === 'Ver resumo' ? 'Ver resumo da sessão' : 'Próxima questão'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
