import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Check,
  Flame,
  Loader2,
  MessageCircle,
  Mic,
  RefreshCw,
  Sparkles,
  Target,
  Trophy,
} from 'lucide-react'
import { api, ApiError, type FeedQuestion } from '../api'
import { useAuth } from '../auth'
import { Brand, SplashScreen } from '../components/Brand'
import { DailySegments } from '../components/DailySegments'
import { ExplanationSheet } from '../components/ExplanationSheet'
import { QuestionCard } from '../components/QuestionCard'
import { TutorPanel } from '../components/TutorPanel'
import { EMPTY_CARD, MAX_ELAPSED_MS, type CardState } from '../lib/feed'
import { readErrorMessage, todayLabel } from '../lib/format'
import { useInert } from '../lib/useInert'

function FeedSkeleton() {
  return (
    <div className="stage-bg flex h-[100dvh] flex-col overflow-hidden">
      <div className="mx-auto w-full max-w-[560px] px-4 pt-4 sm:px-6">
        <div className="flex items-center justify-between">
          <Brand size={28} />
          <div className="skeleton h-8 w-24 rounded-full" />
        </div>
        <div className="skeleton mt-4 h-1.5 w-full" />
      </div>
      <div className="mx-auto mt-12 w-full max-w-[560px] flex-1 px-4 sm:px-6" aria-busy="true">
        <div className="skeleton h-6 w-32" />
        <div className="skeleton mt-6 h-6 w-full" />
        <div className="skeleton mt-2.5 h-6 w-11/12" />
        <div className="mt-8 space-y-2.5">
          {[0, 1, 2, 3, 4].map((item) => (
            <div key={item} className="skeleton h-[58px] w-full" />
          ))}
        </div>
        <p className="sr-only">Carregando questões do seu feed…</p>
      </div>
    </div>
  )
}

function FeedErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="stage-bg flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand size={34} />
        </div>
        <div className="surface-card p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-danger/10 text-danger">
            <AlertTriangle className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold text-white">
            O feed não carregou
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">{message}</p>
          <button type="button" onClick={onRetry} className="btn-primary mt-5 w-full">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Tentar de novo
          </button>
          <Link
            to="/progresso"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white/45 transition hover:text-white"
          >
            <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" />
            Enquanto isso, veja seu progresso
          </Link>
        </div>
      </div>
    </div>
  )
}

function FeedEmptyState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="stage-bg flex min-h-[100dvh] flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <Brand size={34} />
        </div>
        <div className="surface-card p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-lime/10 text-lime">
            <Sparkles className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 font-display text-xl font-semibold text-white">
            Nenhuma questão por aqui ainda
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-white/50">
            O banco pode estar sendo atualizado. Tente recarregar em instantes — suas estatísticas
            continuam salvas.
          </p>
          <button type="button" onClick={onRetry} className="btn-primary mt-5 w-full">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Recarregar feed
          </button>
          <Link
            to="/perfil"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-white/45 transition hover:text-white"
          >
            Ajustar meus pesos
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}

interface RecapProps {
  answered: number
  correct: number
  streak: number
  dailyAnswered: number
  dailyGoal: number
  active: boolean
  refreshing: boolean
  onRefresh: () => void
}

function FeedRecap({
  answered,
  correct,
  streak,
  dailyAnswered,
  dailyGoal,
  active,
  refreshing,
  onRefresh,
}: RecapProps) {
  const accuracy = answered > 0 ? Math.round((correct / answered) * 100) : 0
  const sectionRef = useInert<HTMLElement>(!active)

  return (
    <section
      ref={sectionRef}
      className="relative flex h-[100dvh] w-full shrink-0 snap-start snap-always items-center justify-center px-4 py-10"
      aria-label="Resumo da sessão"
    >
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(640px 420px at 50% 20%, rgba(200,255,77,.1), transparent 65%), radial-gradient(500px 360px at 50% 100%, rgba(139,92,246,.1), transparent 70%)',
        }}
      />
      <div className="surface-card relative w-full max-w-[440px] p-6 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-lime/10 text-lime">
          <Trophy className="h-7 w-7" aria-hidden="true" />
        </span>
        <p className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-white/35">
          Fim do baralho por agora
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-white">Sessão concluída</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/50">
          Você passou por todas as questões disponíveis neste momento. Volte mais tarde para novas
          rodadas — ou revise seus pontos fracos.
        </p>

        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-2 py-3">
            <p className="font-display text-xl font-bold tabular-nums text-white">{answered}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/35">Respondidas</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-2 py-3">
            <p className="font-display text-xl font-bold tabular-nums text-success">{correct}</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/35">Acertos</p>
          </div>
          <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] px-2 py-3">
            <p className="font-display text-xl font-bold tabular-nums text-lime">{accuracy}%</p>
            <p className="mt-0.5 text-[10px] uppercase tracking-wide text-white/35">Acurácia</p>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-2xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
          <span className="flex items-center gap-2 text-xs text-white/55">
            <Flame className="h-4 w-4 text-lime" aria-hidden="true" />
            {streak} {streak === 1 ? 'dia seguido' : 'dias seguidos'}
          </span>
          <span className="text-xs font-semibold tabular-nums text-white/55">
            {dailyAnswered}/{dailyGoal} hoje
          </span>
        </div>

        <Link to="/progresso" className="btn-primary mt-5 w-full">
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Ver meu progresso
        </Link>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="btn-ghost mt-2 w-full text-xs"
        >
          {refreshing ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          )}
          Atualizar feed
        </button>
      </div>
    </section>
  )
}

export default function FeedPage() {
  const { me, syncStats } = useAuth()

  const [questions, setQuestions] = useState<FeedQuestion[]>([])
  const [cards, setCards] = useState<Record<string, CardState>>({})
  const [activeIndex, setActiveIndex] = useState(0)
  const [activeElapsed, setActiveElapsed] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [initialError, setInitialError] = useState<string | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState<string | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [sheetFor, setSheetFor] = useState<string | null>(null)
  const [tutorOpen, setTutorOpen] = useState(false)
  const [tutorForId, setTutorForId] = useState<string | null>(null)
  const [hintDismissed, setHintDismissed] = useState(false)
  const [scrollerEl, setScrollerEl] = useState<HTMLDivElement | null>(null)

  const loadingRef = useRef(false)
  const seenRef = useRef<Set<string>>(new Set())
  const pendingAttemptsRef = useRef<Set<string>>(new Set())
  const cardsRef = useRef<Record<string, CardState>>({})
  const elapsedRef = useRef(0)
  const activeIdRef = useRef<string | undefined>(undefined)
  const pendingAdvanceRef = useRef(false)
  const autoSheetTimersRef = useRef<number[]>([])

  const activeQuestion = questions[activeIndex]
  const activeQuestionId = activeQuestion?.id
  const activeCard = activeQuestionId ? (cards[activeQuestionId] ?? EMPTY_CARD) : EMPTY_CARD
  const activeAnswered = Boolean(activeCard.result)

  useEffect(() => {
    cardsRef.current = cards
  }, [cards])

  useEffect(() => {
    elapsedRef.current = activeElapsed
  }, [activeElapsed])

  useEffect(() => {
    activeIdRef.current = activeQuestionId
  }, [activeQuestionId])

  useEffect(() => {
    return () => {
      autoSheetTimersRef.current.forEach((timer) => window.clearTimeout(timer))
    }
  }, [])

  const fetchPage = useCallback(async (initial: boolean) => {
    if (loadingRef.current) return
    loadingRef.current = true

    if (initial) {
      setInitialLoading(true)
      setInitialError(null)
    } else {
      setLoadingMore(true)
    }
    setMoreError(null)

    try {
      const data = await api.feed(initial ? 10 : 8)
      const fresh = data.questions.filter((question) => !seenRef.current.has(question.id))
      fresh.forEach((question) => seenRef.current.add(question.id))

      if (fresh.length > 0) {
        setQuestions((previous) => (initial ? fresh : [...previous, ...fresh]))
        setExhausted(false)
      } else {
        if (initial) setQuestions([])
        setExhausted(true)
      }
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : readErrorMessage(error, 'Não foi possível carregar as questões do feed.')
      if (initial) {
        setInitialError(message)
      } else {
        setMoreError(message)
      }
    } finally {
      loadingRef.current = false
      setInitialLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    seenRef.current = new Set()
    pendingAttemptsRef.current = new Set()
    setQuestions([])
    setCards({})
    setActiveIndex(0)
    setActiveElapsed(0)
    setExhausted(false)
    setInitialError(null)
    setMoreError(null)
    setSheetFor(null)
    setTutorOpen(false)
    setTutorForId(null)
    setHintDismissed(false)
    elapsedRef.current = 0
    void fetchPage(true)
  }, [fetchPage, reloadKey])

  useEffect(() => {
    if (!scrollerEl) return
    let frame = 0
    const handleScroll = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const height = scrollerEl.clientHeight || 1
        const index = Math.round(scrollerEl.scrollTop / height)
        setActiveIndex((previous) => (previous === index ? previous : index))
      })
    }
    scrollerEl.addEventListener('scroll', handleScroll, { passive: true })
    return () => {
      scrollerEl.removeEventListener('scroll', handleScroll)
      cancelAnimationFrame(frame)
    }
  }, [scrollerEl])

  useEffect(() => {
    if (!scrollerEl) return
    const handleResize = () => {
      scrollerEl.scrollTop = activeIndex * scrollerEl.clientHeight
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [scrollerEl, activeIndex])

  useEffect(() => {
    setActiveElapsed(0)
    elapsedRef.current = 0
  }, [activeQuestionId])

  const timerPaused = tutorOpen || Boolean(sheetFor)

  useEffect(() => {
    if (!activeQuestionId || activeAnswered || timerPaused) return
    const timer = window.setInterval(() => {
      if (document.hidden) return
      setActiveElapsed((previous) => Math.min(previous + 250, MAX_ELAPSED_MS))
    }, 250)
    return () => window.clearInterval(timer)
  }, [activeQuestionId, activeAnswered, timerPaused])

  const scrollToIndex = useCallback(
    (index: number) => {
      if (!scrollerEl) return
      const maxIndex = questions.length - 1 + (exhausted ? 1 : 0)
      const clamped = Math.max(0, Math.min(index, Math.max(0, maxIndex)))
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      scrollerEl.scrollTo({
        top: clamped * scrollerEl.clientHeight,
        behavior: reduceMotion ? 'auto' : 'smooth',
      })
    },
    [scrollerEl, questions.length, exhausted],
  )

  const goNext = useCallback(() => {
    setSheetFor(null)
    setHintDismissed(true)
    const maxIndex = questions.length - 1 + (exhausted ? 1 : 0)
    if (activeIndex < maxIndex) {
      scrollToIndex(activeIndex + 1)
      return
    }
    if (!exhausted) {
      pendingAdvanceRef.current = true
      void fetchPage(false)
    }
  }, [activeIndex, exhausted, fetchPage, questions.length, scrollToIndex])

  const goPrev = useCallback(() => {
    setHintDismissed(true)
    scrollToIndex(activeIndex - 1)
  }, [activeIndex, scrollToIndex])

  useEffect(() => {
    if (!pendingAdvanceRef.current) return
    const maxIndex = questions.length - 1 + (exhausted ? 1 : 0)
    if (activeIndex < maxIndex) {
      pendingAdvanceRef.current = false
      scrollToIndex(activeIndex + 1)
    } else if (exhausted) {
      pendingAdvanceRef.current = false
    }
  }, [questions.length, exhausted, activeIndex, scrollToIndex])

  const submitAnswer = useCallback(
    async (question: FeedQuestion, selectedIndex: number) => {
      if (pendingAttemptsRef.current.has(question.id)) return
      if (cardsRef.current[question.id]?.result) return
      pendingAttemptsRef.current.add(question.id)

      setCards((previous) => {
        const current = previous[question.id] ?? EMPTY_CARD
        if (current.pending || current.result) return previous
        return {
          ...previous,
          [question.id]: { ...current, selected: selectedIndex, pending: true, error: null },
        }
      })

      const elapsed = Math.min(MAX_ELAPSED_MS, Math.max(0, Math.round(elapsedRef.current)))

      try {
        const result = await api.attempt({
          question_id: question.id,
          selected_index: selectedIndex,
          elapsed_ms: elapsed,
          mode: 'feed',
        })
        setCards((previous) => {
          const current = previous[question.id] ?? EMPTY_CARD
          return {
            ...previous,
            [question.id]: {
              ...current,
              selected: selectedIndex,
              pending: false,
              result,
              error: null,
            },
          }
        })
        syncStats(result.streak, result.daily)
        setHintDismissed(true)

        const timer = window.setTimeout(() => {
          if (activeIdRef.current === question.id) setSheetFor(question.id)
        }, 620)
        autoSheetTimersRef.current.push(timer)
      } catch (error) {
        const message =
          error instanceof ApiError
            ? error.message
            : readErrorMessage(error, 'Não conseguimos registrar sua resposta. Tente novamente.')
        pendingAttemptsRef.current.delete(question.id)
        setCards((previous) => {
          const current = previous[question.id] ?? EMPTY_CARD
          return {
            ...previous,
            [question.id]: {
              ...current,
              selected: selectedIndex,
              pending: false,
              error: message,
            },
          }
        })
      }
    },
    [syncStats],
  )

  const handleSelect = useCallback(
    (question: FeedQuestion, optionIndex: number) => {
      void submitAnswer(question, optionIndex)
    },
    [submitAnswer],
  )

  const handleRetry = useCallback(
    (question: FeedQuestion) => {
      const card = cardsRef.current[question.id]
      if (!card || card.selected === null) return
      pendingAttemptsRef.current.delete(question.id)
      setCards((previous) => {
        const current = previous[question.id] ?? EMPTY_CARD
        return { ...previous, [question.id]: { ...current, error: null } }
      })
      void submitAnswer(question, card.selected)
    },
    [submitAnswer],
  )

  const handleOpenSheet = useCallback((question: FeedQuestion) => {
    setSheetFor(question.id)
  }, [])

  const openTutorFor = useCallback((question: FeedQuestion) => {
    setSheetFor(null)
    setTutorForId(question.id)
    setTutorOpen(true)
  }, [])

  useEffect(() => {
    if (hintDismissed) return
    const timer = window.setTimeout(() => setHintDismissed(true), 9000)
    return () => window.clearTimeout(timer)
  }, [hintDismissed])

  useEffect(() => {
    if (initialLoading || initialError || loadingMore || exhausted) return
    if (questions.length === 0) return
    const remaining = questions.length - 1 - activeIndex
    if (remaining <= 2) void fetchPage(false)
  }, [activeIndex, questions.length, initialLoading, initialError, loadingMore, exhausted, fetchPage])

  useEffect(() => {
    if (!scrollerEl) return
    let lockUntil = 0
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || sheetFor || tutorOpen) return
      if (Math.abs(event.deltaY) < 12) return

      if (event.target instanceof Element) {
        const scrollable = event.target.closest<HTMLElement>('[data-scrollable]')
        if (scrollable) {
          const canScrollDown =
            scrollable.scrollHeight - scrollable.scrollTop - scrollable.clientHeight > 4
          const canScrollUp = scrollable.scrollTop > 4
          if ((event.deltaY > 0 && canScrollDown) || (event.deltaY < 0 && canScrollUp)) return
        }
      }

      event.preventDefault()
      const now = Date.now()
      if (now < lockUntil) return
      lockUntil = now + 650
      if (event.deltaY > 0) goNext()
      else goPrev()
    }
    scrollerEl.addEventListener('wheel', handleWheel, { passive: false })
    return () => scrollerEl.removeEventListener('wheel', handleWheel)
  }, [scrollerEl, sheetFor, tutorOpen, goNext, goPrev])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (sheetFor || tutorOpen) return
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (event.target instanceof HTMLElement) {
        const target = event.target
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
      }

      if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === 'j' || event.key === 'J') {
        event.preventDefault()
        goNext()
        return
      }
      if (event.key === 'ArrowUp' || event.key === 'PageUp' || event.key === 'k' || event.key === 'K') {
        event.preventDefault()
        goPrev()
        return
      }
      if (event.key === 'Enter' && activeAnswered) {
        const focused = document.activeElement
        const onInteractive =
          focused instanceof HTMLElement && focused !== document.body
            ? Boolean(focused.closest('button, a, input, textarea, [role="dialog"]'))
            : false
        if (!onInteractive) {
          event.preventDefault()
          goNext()
        }
        return
      }
      if (/^[1-5]$/.test(event.key) && activeQuestion && !activeAnswered && !activeCard.pending) {
        const optionIndex = Number(event.key) - 1
        if (optionIndex < activeQuestion.alternatives.length) {
          event.preventDefault()
          void submitAnswer(activeQuestion, optionIndex)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    activeAnswered,
    activeCard.pending,
    activeQuestion,
    goNext,
    goPrev,
    sheetFor,
    submitAnswer,
    tutorOpen,
  ])

  if (!me) return <SplashScreen />

  if (initialLoading && questions.length === 0) return <FeedSkeleton />

  if (initialError && questions.length === 0) {
    return <FeedErrorState message={initialError} onRetry={() => setReloadKey((key) => key + 1)} />
  }

  if (!initialLoading && questions.length === 0) {
    return <FeedEmptyState onRetry={() => setReloadKey((key) => key + 1)} />
  }

  const endCardVisible = exhausted && questions.length > 0
  const maxIndex = questions.length - 1 + (endCardVisible ? 1 : 0)
  const hasNext = activeIndex < maxIndex
  const nextLabel = hasNext ? (activeIndex === questions.length - 1 && endCardVisible ? 'Ver resumo' : 'Próxima') : 'Próxima'
  const nextDisabled = !hasNext && loadingMore

  const sheetQuestion = sheetFor ? (questions.find((question) => question.id === sheetFor) ?? null) : null
  const sheetCard = sheetFor ? cards[sheetFor] : undefined
  const sheetResult = sheetCard?.result ?? null
  const tutorQuestion = tutorOpen
    ? (questions.find((question) => question.id === tutorForId) ?? activeQuestion ?? null)
    : null

  const answeredCards = Object.values(cards).filter((card) => card.result)
  const sessionAnswered = answeredCards.length
  const sessionCorrect = answeredCards.filter((card) => card.result?.correct).length

  return (
    <div className="relative h-[100dvh] w-full overflow-hidden bg-ink">
      <div
        className="pointer-events-none absolute inset-0"
        aria-hidden="true"
        style={{
          background:
            'radial-gradient(1100px 600px at 8% -10%, rgba(200,255,77,.07), transparent 60%), radial-gradient(900px 600px at 108% 20%, rgba(139,92,246,.14), transparent 62%)',
        }}
      />

      <header className="absolute inset-x-0 top-0 z-30">
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink via-ink/85 to-transparent"
          aria-hidden="true"
        />
        <div className="safe-top relative mx-auto w-full max-w-[560px] px-4 pt-3 sm:px-6">
          <div className="flex items-center justify-between gap-2">
            <Brand size={27} />

            <div className="flex items-center gap-1.5">
              <span
                className="flex items-center gap-1.5 rounded-full border border-lime/25 bg-lime/[0.08] px-2.5 py-1.5"
                title={`Sequência de ${me.streak.current} ${me.streak.current === 1 ? 'dia' : 'dias'}`}
              >
                <Flame className="h-3.5 w-3.5 text-lime" fill="currentColor" aria-hidden="true" />
                <span className="text-xs font-bold tabular-nums text-lime" aria-hidden="true">
                  {me.streak.current}
                </span>
                <span className="sr-only">
                  Sequência de {me.streak.current} {me.streak.current === 1 ? 'dia' : 'dias'} seguidos
                </span>
              </span>

              <Link to="/progresso" className="icon-button h-9 w-9" aria-label="Abrir progresso">
                <BarChart3 className="h-4 w-4" aria-hidden="true" />
              </Link>

              <Link
                to="/perfil"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-violet/25 text-[11px] font-bold uppercase text-white transition hover:bg-violet/40"
                aria-label="Abrir seu perfil"
              >
                {me.user.name.trim().charAt(0) || 'E'}
              </Link>
            </div>
          </div>

          <DailySegments
            className="mt-2.5"
            answered={me.daily.answered}
            goal={me.daily.goal}
            showLabel
          />
        </div>
      </header>

      <div
        ref={setScrollerEl}
        className="feed-scroller h-[100dvh] w-full snap-y snap-mandatory overflow-y-scroll"
        tabIndex={0}
        aria-label={`Feed de questões · ${todayLabel()}`}
      >
        {questions.map((question, index) => (
          <QuestionCard
            key={question.id}
            question={question}
            index={index}
            total={questions.length}
            active={index === activeIndex}
            card={cards[question.id] ?? EMPTY_CARD}
            elapsedMs={index === activeIndex ? activeElapsed : 0}
            showScrollHint={index === 0 && activeIndex === 0 && !hintDismissed}
            nextLabel={nextLabel}
            nextDisabled={nextDisabled}
            onSelect={handleSelect}
            onRetry={handleRetry}
            onSkip={goNext}
            onOpenSheet={handleOpenSheet}
            onNext={goNext}
          />
        ))}

        {endCardVisible && (
          <FeedRecap
            answered={sessionAnswered}
            correct={sessionCorrect}
            streak={me.streak.current}
            dailyAnswered={me.daily.answered}
            dailyGoal={me.daily.goal}
            active={activeIndex === questions.length}
            refreshing={initialLoading || loadingMore}
            onRefresh={() => setReloadKey((key) => key + 1)}
          />
        )}
      </div>

      {moreError && (
        <div
          role="alert"
          className="absolute inset-x-0 bottom-[92px] z-30 mx-auto flex w-fit max-w-[92%] items-center gap-2 rounded-full border border-danger/30 bg-ink/90 px-3.5 py-2 text-[11px] text-danger shadow-lg backdrop-blur-md"
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="truncate">{moreError}</span>
          <button
            type="button"
            onClick={() => void fetchPage(false)}
            className="shrink-0 font-semibold text-white underline-offset-2 hover:underline"
          >
            Tentar
          </button>
        </div>
      )}

      {activeQuestion && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex justify-center bg-gradient-to-t from-ink via-ink/90 to-transparent pb-[max(12px,env(safe-area-inset-bottom))] pt-12">
          <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-white/10 bg-surface/90 p-1.5 shadow-lift backdrop-blur-xl">
            <button
              type="button"
              onClick={() => activeQuestion && openTutorFor(activeQuestion)}
              className="btn h-11 gap-2 rounded-full bg-lime px-4 text-ink transition hover:bg-lime-soft active:scale-[0.98]"
              aria-label="Abrir tutor por voz"
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
              <span className="text-xs font-bold">Tutor</span>
            </button>
            <button
              type="button"
              onClick={() => activeQuestion && openTutorFor(activeQuestion)}
              className="flex h-11 w-11 items-center justify-center rounded-full text-white/55 transition hover:bg-white/[0.07] hover:text-white"
              aria-label="Abrir tutor por texto"
              title="Prefiro escrever"
            >
              <MessageCircle className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <ExplanationSheet
        open={Boolean(sheetFor && sheetQuestion && sheetResult)}
        question={sheetQuestion}
        result={sheetResult}
        selectedIndex={sheetCard?.selected ?? null}
        nextLabel={nextLabel}
        onClose={() => setSheetFor(null)}
        onNext={goNext}
        onOpenTutor={() => {
          if (sheetQuestion) openTutorFor(sheetQuestion)
        }}
      />

      <TutorPanel
        open={tutorOpen}
        question={tutorQuestion}
        onClose={() => {
          setTutorOpen(false)
          setTutorForId(null)
        }}
      />

      <div className="pointer-events-none absolute bottom-[calc(88px+env(safe-area-inset-bottom))] left-1/2 z-20 hidden -translate-x-1/2 items-center gap-1.5 text-[10px] text-white/20 lg:flex">
        <Target className="h-3 w-3" aria-hidden="true" />
        <span>↑ ↓ navegam</span>
        <span className="h-2.5 w-px bg-white/10" aria-hidden="true" />
        <span>1–5 respondem</span>
        {activeAnswered && (
          <>
            <span className="h-2.5 w-px bg-white/10" aria-hidden="true" />
            <span className="flex items-center gap-1">
              <Check className="h-3 w-3" aria-hidden="true" />
              Enter avança
            </span>
          </>
        )}
      </div>
    </div>
  )
}
