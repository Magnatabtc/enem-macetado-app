import type { SubjectKey, Weights } from '../api'
import { SUBJECTS, WEIGHT_LABELS } from '../lib/subjects'

interface WeightEditorProps {
  weights: Weights
  onChange: (weights: Weights) => void
  disabled?: boolean
}

const LEVELS = [1, 2, 3, 4, 5] as const

export function WeightEditor({ weights, onChange, disabled = false }: WeightEditorProps) {
  const setWeight = (key: SubjectKey, value: number) => {
    onChange({ ...weights, [key]: value })
  }

  return (
    <div className="space-y-2.5">
      <div className="hidden items-center justify-between px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/30 sm:flex">
        <span>Matéria</span>
        <span className="pr-1">Nível de necessidade</span>
      </div>

      {SUBJECTS.map((subject) => {
        const value = weights[subject.key]
        return (
          <div
            key={subject.key}
            className="rounded-2xl border border-white/[0.08] bg-white/[0.025] px-3 py-3 transition hover:border-white/[0.14] sm:flex sm:items-center sm:justify-between sm:gap-4"
          >
            <div className="flex items-center justify-between gap-3 sm:justify-start">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: subject.accent }}
                  aria-hidden="true"
                />
                <span className="truncate text-sm font-medium text-white/85">{subject.label}</span>
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-white/40 sm:hidden">
                {WEIGHT_LABELS[value]}
              </span>
            </div>

            <div className="mt-2.5 flex items-center gap-1.5 sm:mt-0 sm:w-[292px]">
              <div
                className="grid flex-1 grid-cols-5 gap-1.5"
                role="group"
                aria-label={`Peso de ${subject.label}`}
              >
                {LEVELS.map((level) => {
                  const selected = value === level
                  return (
                    <button
                      key={level}
                      type="button"
                      disabled={disabled}
                      aria-pressed={selected}
                      aria-label={`${subject.label}: nível ${level} de 5 — ${WEIGHT_LABELS[level]}`}
                      onClick={() => setWeight(subject.key, level)}
                      className={`h-9 rounded-lg text-xs font-bold tabular-nums transition active:scale-95 disabled:opacity-50 ${
                        selected
                          ? 'bg-lime text-ink shadow-[0_0_16px_rgba(200,255,77,.25)]'
                          : 'bg-white/[0.05] text-white/45 hover:bg-white/[0.1] hover:text-white/80'
                      }`}
                    >
                      {level}
                    </button>
                  )
                })}
              </div>
              <span
                className="hidden w-[104px] shrink-0 text-right text-[11px] font-semibold text-white/40 sm:block"
                aria-hidden="true"
              >
                {WEIGHT_LABELS[value]}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
