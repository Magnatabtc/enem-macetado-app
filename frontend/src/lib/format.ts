export const LETTERS = ['A', 'B', 'C', 'D', 'E'] as const

export function hexToRgba(hex: string, alpha: number): string {
  const clean = hex.replace('#', '')
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean
  const value = Number.parseInt(full, 16)
  if (!Number.isFinite(value)) return `rgba(200, 255, 77, ${alpha})`
  const r = (value >> 16) & 255
  const g = (value >> 8) & 255
  const b = value & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Datas da API vêm como YYYY-MM-DD; usa meio-dia local para evitar virada de fuso. */
export function parseISODate(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number)
  if (!year || !month || !day) return new Date(iso)
  return new Date(year, month - 1, day, 12, 0, 0)
}

export function formatShortDate(iso: string): string {
  const date = parseISODate(iso)
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' }).format(date)
}

export function formatWeekday(iso: string): string {
  const date = parseISODate(iso)
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(date).replace('.', '')
}

export function todayLabel(): string {
  return new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
  }).format(new Date())
}

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%'
  const rounded = Math.round(value * 10) / 10
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1).replace('.', ',')}%`
}

export function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm
}

export function firstName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return 'estudante'
  return trimmed.split(/\s+/)[0] ?? trimmed
}

export function secondsToClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message
  return fallback
}
