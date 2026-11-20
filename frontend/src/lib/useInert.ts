import { useEffect, useRef } from 'react'

/**
 * Mantém cards fora da tela inertes: sem foco por Tab e sem exposição
 * para leitores de tela. O card ativo continua 100% interativo.
 */
export function useInert<T extends HTMLElement>(inert: boolean) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    if (inert) {
      element.setAttribute('inert', '')
    } else {
      element.removeAttribute('inert')
    }
  }, [inert])

  return ref
}
