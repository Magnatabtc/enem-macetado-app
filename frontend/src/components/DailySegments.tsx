interface DailySegmentsProps {
  answered: number
  goal: number
  showLabel?: boolean
  className?: string
}

/**
 * Barra segmentada de meta diária. Nunca renderiza mais de 18 segmentos,
 * para continuar legível em metas altas (até 50).
 */
export function DailySegments({ answered, goal, showLabel = false, className = '' }: DailySegmentsProps) {
  const safeGoal = Math.max(1, goal)
  const segments = Math.min(safeGoal, 18)
  const ratio = Math.min(1, Math.max(0, answered / safeGoal))
  const filled = Math.round(ratio * segments)
  const complete = answered >= safeGoal

  return (
    <div className={className}>
      {showLabel && (
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">
            Meta de hoje
          </span>
          <span className={`text-[11px] font-semibold tabular-nums ${complete ? 'text-lime' : 'text-white/60'}`}>
            {Math.min(answered, 999)}/{safeGoal}
          </span>
        </div>
      )}
      <div
        className="flex items-center gap-[3px]"
        role="img"
        aria-label={`Meta diária: ${answered} de ${safeGoal} questões respondidas`}
      >
        {Array.from({ length: segments }, (_, index) => {
          const isFilled = index < filled
          return (
            <span
              key={index}
              className={`h-1 flex-1 rounded-full transition-colors duration-500 ${
                isFilled ? 'bg-lime shadow-[0_0_8px_rgba(200,255,77,.45)]' : 'bg-white/10'
              }`}
            />
          )
        })}
      </div>
    </div>
  )
}
