import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { AppLayout } from './components/AppLayout'
import { RequireAuth } from './components/RequireAuth'
import AuthPage from './pages/AuthPage'
import FeedPage from './pages/FeedPage'
import NotFoundPage from './pages/NotFoundPage'
import OnboardingPage from './pages/OnboardingPage'
import ProfilePage from './pages/ProfilePage'
import ProgressPage from './pages/ProgressPage'

const PAGE_TITLES: Record<string, string> = {
  '/': 'Entrar ou criar conta',
  '/onboarding': 'Personalizar meu feed',
  '/feed': 'Feed de questões',
  '/progresso': 'Meu progresso',
  '/perfil': 'Meu perfil',
}

function RouteEffects() {
  const { pathname } = useLocation()

  useEffect(() => {
    document.title = `${PAGE_TITLES[pathname] ?? 'Página não encontrada'} · Enem Macetado`
    if (pathname !== '/feed') window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])

  return null
}

export default function App() {
  return (
    <>
      <RouteEffects />
      <Routes>
        <Route path="/" element={<AuthPage />} />
        <Route
          path="/onboarding"
          element={
            <RequireAuth>
              <OnboardingPage />
            </RequireAuth>
          }
        />
        <Route
          path="/feed"
          element={
            <RequireAuth>
              <FeedPage />
            </RequireAuth>
          }
        />
        <Route
          path="/progresso"
          element={
            <RequireAuth>
              <AppLayout>
                <ProgressPage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route
          path="/perfil"
          element={
            <RequireAuth>
              <AppLayout>
                <ProfilePage />
              </AppLayout>
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  )
}
