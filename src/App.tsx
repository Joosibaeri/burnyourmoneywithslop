import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { Layout } from '@/components/Layout'
import { Dashboard } from '@/pages/Dashboard'
import { GroupDetail } from '@/pages/GroupDetail'
import { Settings } from '@/pages/Settings'
import { Profile } from '@/pages/Profile'
import { Onboarding } from '@/pages/Onboarding'
import { Login } from '@/pages/Login'
import { DemoBanner } from '@/components/DemoBanner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { SupabaseProvider } from '@/contexts/SupabaseContext'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
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
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/login" replace />
  return (
    <Layout>
      <DemoBanner />
      <Outlet />
    </Layout>
  )
}

function PublicLayout() {
  return <Layout />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
      <Route path="/@:username" element={<Profile />} />
      {/* Protected routes with Dashboard and Settings */}
      <Route element={<ProtectedLayout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      {/* Public routes - no auth required */}
      <Route element={<PublicLayout />}>
        <Route path="/groups" element={<GroupDetail />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
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