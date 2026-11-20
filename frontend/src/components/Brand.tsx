import { Link } from 'react-router-dom'
import { Loader2 } from 'lucide-react'

interface BrandMarkProps {
  size?: number
  className?: string
}

export function BrandMark({ size = 32, className = '' }: BrandMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <rect width="64" height="64" rx="18" fill="#C8FF4D" />
      <path d="M36 11 19.5 36.5H30l-1.6 16.5 17.1-26H34.2L36 11Z" fill="#08080B" />
    </svg>
  )
}

interface BrandProps {
  size?: number
  className?: string
  markOnly?: boolean
}

export function Brand({ size = 30, className = '', markOnly = false }: BrandProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark size={size} className="shrink-0 rounded-[28%] shadow-[0_0_24px_rgba(200,255,77,.22)]" />
      {!markOnly && (
        <span className="font-display text-[17px] font-extrabold leading-none tracking-tight">
          <span className="text-white">enem</span>{' '}
          <span className="text-lime">macetado</span>
        </span>
      )}
    </span>
  )
}

export function BrandLink({ className = '', size = 30 }: { className?: string; size?: number }) {
  return (
    <Link to="/feed" className={`inline-flex rounded-xl ${className}`} aria-label="Enem Macetado — ir para o feed">
      <Brand size={size} />
    </Link>
  )
}

export function SplashScreen({ message = 'Preparando seu feed…' }: { message?: string }) {
  return (
    <div className="stage-bg flex min-h-[100dvh] flex-col items-center justify-center gap-5 px-6">
      <div className="relative">
        <span className="absolute inset-0 rounded-[28%] bg-lime/30 blur-2xl" aria-hidden="true" />
        <BrandMark size={64} className="relative animate-float rounded-[28%]" />
      </div>
      <div className="text-center">
        <p className="font-display text-lg font-bold text-white">
          enem <span className="text-lime">macetado</span>
        </p>
        <p className="mt-2 flex items-center justify-center gap-2 text-sm text-white/50">
          <Loader2 className="h-4 w-4 animate-spin text-lime" aria-hidden="true" />
          {message}
        </p>
      </div>
    </div>
  )
}
