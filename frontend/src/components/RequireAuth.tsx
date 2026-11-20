import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth'
import { SplashScreen } from './Brand'

export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return <SplashScreen />
  }

  if (status === 'anon') {
    return <Navigate to="/" replace state={{ from: location.pathname }} />
  }

  return <>{children}</>
}
