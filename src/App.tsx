import { Routes, Route, Navigate, Outlet, useLocation, useParams } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { GroupDetail } from '@/pages/GroupDetail'
import { Groups } from '@/pages/Groups'
import { Settings } from '@/pages/Settings'
import { Profile } from '@/pages/Profile'
import { Onboarding } from '@/pages/Onboarding'
import { Login } from '@/pages/Login'
import { AuthCallback } from '@/pages/AuthCallback'
import { Invite } from '@/pages/Invite'
import { Ranking } from '@/pages/Ranking'
import { DemoBanner } from '@/components/DemoBanner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SupabaseProvider } from '@/contexts/SupabaseContext'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />
  return <>{children}</>
}

function LoadingScreen() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 40, height: 40,
        border: '3px solid var(--border)',
        borderTopColor: 'var(--accent)',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
      }} />
      
    </div>
  )
}

function ProtectedLayout() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace state={{ returnTo: location.pathname + location.search }} />
  return (
    <Layout>
      <DemoBanner />
      <Outlet />
    </Layout>
  )
}

function PublicLayout() {
  return <Layout><Outlet /></Layout>
}

function PublicProfileRoute() {
  const { handle } = useParams<{ handle: string }>()
  return handle?.startsWith('@') && handle.length > 1 ? <Profile username={handle.slice(1)} /> : <Navigate to="/" replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      {/* Protected routes with Dashboard and Settings */}
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
        <Route path="groups" element={<Groups />} />
        <Route path="groups/:id" element={<GroupDetail />} />
      </Route>
      {/* Public routes - no auth required */}
      <Route element={<PublicLayout />}>
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/:handle" element={<PublicProfileRoute />} />
        <Route path="/invite/:code" element={<Invite />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <SupabaseProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </SupabaseProvider>
  )
}
