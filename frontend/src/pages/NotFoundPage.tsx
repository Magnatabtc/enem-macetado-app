import { Link } from 'react-router-dom'
import { ArrowRight, Compass } from 'lucide-react'
import { BrandMark } from '../components/Brand'

export default function NotFoundPage() {
  return (
    <div className="stage-bg relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-5 py-12 text-center">
      <div className="pointer-events-none absolute inset-0 grid-overlay opacity-60" aria-hidden="true" />
      <div className="relative">
        <BrandMark size={52} className="mx-auto rounded-[28%]" />
        <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.24em] text-white/25">
          Erro 404
        </p>
        <h1 className="mt-2 text-balance font-display text-3xl font-bold text-white sm:text-4xl">
          Essa página saiu do feed.
        </h1>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-white/45">
          O endereço que você tentou não existe ou foi movido. Volte para o feed e continue de onde
          parou.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-2 sm:flex-row">
          <Link to="/feed" className="btn-primary w-full sm:w-auto">
            <Compass className="h-4 w-4" aria-hidden="true" />
            Voltar ao feed
          </Link>
          <Link to="/" className="btn-ghost w-full sm:w-auto">
            Ir para o login
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </div>
  )
}
