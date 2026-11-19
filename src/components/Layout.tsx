import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { Menu, X, LogOut, Users, Settings, Home, GitBranch, LogIn } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { ReactNode } from 'react'
import { githubLogin } from '@/lib/data'

export function Layout({ children }: { children?: ReactNode }) {
  const { user, signOut, loading } = useAuth()
  const location = useLocation()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const login = githubLogin(user)
  const handleSignOut = async () => {
    try { await signOut() } catch { setError('Could not sign out. Please try again.') }
  }

  // Different nav items for authenticated vs public
  const authNavItems = [
    { path: '/', label: 'Dashboard', icon: Home },
    { path: '/groups', label: 'Groups', icon: Users },
    { path: '/settings', label: 'Settings', icon: Settings },
  ]

  const publicNavItems = [
    { path: '/groups', label: 'Groups', icon: Users },
  ]

  const navItems = user ? authNavItems : publicNavItems

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <header style={{
        position: 'sticky',
        top: 0,
        zIndex: 100,
        background: 'rgba(10, 10, 11, 0.9)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
        padding: '0 24px',
      }}>
        <div className="container header-inner" style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <NavLink to="/" className="desktop-only" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontWeight: 700,
            fontSize: '1.25rem',
            color: 'var(--fg)',
            textDecoration: 'none',
          }}>
            <span style={{
              width: 32, height: 32,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-bg)',
              borderRadius: 8,
              fontSize: '1.25rem',
            }}>💸</span>
            <span className="brand-title">
              How Much Money Did You Already Burned With Slop
            </span>
          </NavLink>

          <nav className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {navItems.map(({ path, label, icon: Icon }) => (
              <NavLink
                key={path}
                to={path}
                end={path === '/'}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 16px',
                  borderRadius: 'var(--radius-sm)',
                  color: isActive ? 'var(--accent)' : 'var(--fg-muted)',
                  background: isActive ? 'var(--accent-bg)' : 'transparent',
                  fontWeight: 500,
                  fontSize: '0.9rem',
                  textDecoration: 'none',
                  transition: 'all var(--transition)',
                })}
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="desktop-only" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {user ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 12px',
                  background: 'var(--bg-card)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                }}>
                  <img
                    src={user.user_metadata?.avatar_url || `https://github.com/${login || 'user'}.png`}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: '50%' }}
                  />
                  <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>
                    @{login || 'user'}
                  </span>
                  <button
                    onClick={handleSignOut}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32, height: 32,
                      borderRadius: 6,
                      color: 'var(--fg-muted)',
                      background: 'transparent',
                    }}
                    aria-label="Sign out"
                  >
                    <LogOut size={18} />
                  </button>
                </div>
              ) : (
                <Link to="/login" state={{ returnTo: location.pathname + location.search }}>
                  <Button disabled={loading}><LogIn size={18} /> Sign In</Button>
                </Link>
              )}
            </div>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                width: 40, height: 40,
                borderRadius: 'var(--radius-sm)',
                color: 'var(--fg)',
                background: 'transparent',
              }}
              aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileMenuOpen}
              className="mobile-menu-toggle"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="mobile-menu-panel" style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
          }}>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {navItems.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  end={path === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                  style={({ isActive }) => ({
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    borderRadius: 'var(--radius-sm)',
                    color: isActive ? 'var(--accent)' : 'var(--fg-muted)',
                    background: isActive ? 'var(--accent-bg)' : 'transparent',
                    fontWeight: 500,
                    fontSize: '1rem',
                    textDecoration: 'none',
                  })}
                >
                  <Icon size={20} />
                  <span>{label}</span>
                </NavLink>
              ))}
            </nav>

            <div style={{
              marginTop: 12,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}>
              {user ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '8px 16px',
                }}>
                  <img
                    src={user.user_metadata?.avatar_url || `https://github.com/${login || 'user'}.png`}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: '50%' }}
                  />
                  <span style={{ flex: 1, fontSize: '0.95rem', fontWeight: 500 }}>
                    @{login || 'user'}
                  </span>
                  <button
                    onClick={() => { setMobileMenuOpen(false); handleSignOut() }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '8px 12px',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--fg-muted)',
                      background: 'transparent',
                      fontSize: '0.9rem',
                    }}
                    aria-label="Sign out"
                  >
                    <LogOut size={18} />
                    <span>Sign out</span>
                  </button>
                </div>
              ) : (
                <Link
                  to="/login"
                  state={{ returnTo: location.pathname + location.search }}
                  onClick={() => setMobileMenuOpen(false)}
                  style={{ display: 'block', padding: '4px 16px' }}
                >
                  <Button disabled={loading} style={{ width: '100%' }}>
                    <LogIn size={18} /> Sign In
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </header>

      <main style={{ flex: 1, padding: '32px 0' }}>
        <div className="container">
          {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
          {children}
        </div>
      </main>

      <footer style={{
        padding: '24px 0',
        borderTop: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
      }}>
        <div className="container" style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}>
          <p style={{ color: 'var(--fg-subtle)', fontSize: '0.875rem' }}>
            How Much Money Did You Already Burned With Slop — Compare AI coding usage with friends
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <a
              href="https://github.com/Joosibaeri/burnyourmoneywithslop"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--fg-muted)', fontSize: '0.875rem' }}
            >
              <GitBranch size={18} />
              <span>Source</span>
            </a>
          </div>
        </div>
      </footer>

    </div>
  )
}
