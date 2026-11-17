import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Check, ChevronRight, GitBranch, Database, Key, Users, Plus, Sparkles, Shield } from 'lucide-react'
import { useState } from 'react'

// Icon component mapping
const StepIcons: Record<string, React.ComponentType<{ size?: number }>> = {
  welcome: Sparkles,
  supabase: Database,
  subscriptions: Key,
  groups: Users,
  plugins: GitBranch,
}

const steps = [
  { id: 'welcome', title: 'Welcome!', icon: Sparkles },
  { id: 'supabase', title: 'Connect Supabase', icon: Database },
  { id: 'subscriptions', title: 'Add Subscriptions', icon: Key },
  { id: 'groups', title: 'Create a Group', icon: Users },
  { id: 'plugins', title: 'Install Plugins', icon: GitBranch },
]

export function Onboarding() {
  const navigate = useNavigate()
  const [currentStep, setCurrentStep] = useState(0)
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set())
  const [supabaseConnected, setSupabaseConnected] = useState(false)
  const [subscriptionsAdded, setSubscriptionsAdded] = useState(false)

  const currentStepId = steps[currentStep].id

  const handleNext = () => {
    setCompletedSteps(prev => new Set(prev).add(currentStepId))
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      navigate('/')
    }
  }

  const handleSkip = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    } else {
      navigate('/')
    }
  }

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, overflowX: 'auto' }}>
          {steps.map((step, index) => (
            <div
              key={step.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 16px',
                borderRadius: 'var(--radius-sm)',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: index === currentStep ? 'var(--bg)' : completedSteps.has(step.id) ? 'var(--accent)' : 'var(--fg-muted)',
                background: index === currentStep ? 'var(--accent)' : completedSteps.has(step.id) ? 'var(--accent-bg)' : 'transparent',
                border: `1px solid ${index === currentStep ? 'var(--accent)' : completedSteps.has(step.id) ? 'var(--accent)' : 'var(--border)'}`,
                whiteSpace: 'nowrap',
                transition: 'all var(--transition)',
              }}
            >
              {completedSteps.has(step.id) && (
                <Check size={16} style={{ color: index === currentStep ? 'var(--bg)' : 'var(--accent)' }} />
              )}
              <span>{step.title}</span>
              {index < steps.length - 1 && (
                <ChevronRight size={16} style={{ color: 'var(--fg-subtle)' }} />
              )}
            </div>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{
              width: 48, height: 48,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--accent-bg)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius)',
            }}>
              {(() => {
                const Icon = StepIcons[currentStepId]
                return Icon ? <Icon size={24} /> : null
              })()}
            </div>
            <div>
              <CardTitle>{steps[currentStep].title}</CardTitle>
              <CardDescription>{getStepDescription(currentStepId)}</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {renderStepContent(currentStepId, {
            supabaseConnected,
            setSupabaseConnected,
            subscriptionsAdded,
            setSubscriptionsAdded,
            handleNext,
          })}
        </CardContent>
        <CardFooter>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <Button variant="ghost" onClick={handleSkip} disabled={currentStep === steps.length - 1}>
              {currentStep === steps.length - 1 ? 'Finish' : 'Skip'}
            </Button>
            <Button onClick={handleNext} disabled={currentStepId === 'supabase' && !supabaseConnected || currentStepId === 'subscriptions' && !subscriptionsAdded}>
              {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
              <ChevronRight size={18} />
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}

function getStepDescription(stepId: string): string {
  switch (stepId) {
    case 'welcome':
      return 'Let\'s get you set up in a few quick steps'
    case 'supabase':
      return 'Connect your Supabase project for real-time sync and private groups'
    case 'subscriptions':
      return 'Add your AI subscriptions so we can calculate real costs'
    case 'groups':
      return 'Create a private group to compare usage with friends'
    case 'plugins':
      return 'Install plugins for your AI tools to auto-track usage'
    default:
      return ''
  }
}

function renderStepContent(
  stepId: string,
  ctx: {
    supabaseConnected: boolean
    setSupabaseConnected: (v: boolean) => void
    subscriptionsAdded: boolean
    setSubscriptionsAdded: (v: boolean) => void
    handleNext: () => void
  }
) {
  switch (stepId) {
    case 'welcome':
      return (
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <h3 style={{ fontSize: '1.5rem', marginBottom: 16 }}>Hey {ctx.supabaseConnected ? 'there' : 'friend'}! 👋</h3>
          <p style={{ color: 'var(--fg-muted)', lineHeight: 1.7, marginBottom: 24 }}>
            Welcome to <strong>Burn Your Money With Slop</strong> — the only dashboard that shows
            exactly how much you\'re spending on AI coding tools, with real subscription costs
            and private friend comparisons.
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <FeaturePill icon={Shield} label="Private by default" />
            <FeaturePill icon={Database} label="Supabase powered" />
            <FeaturePill icon={Key} label="Real subscription costs" />
            <FeaturePill icon={Users} label="Friend groups" />
          </div>
        </div>
      )

    case 'supabase':
      return (
        <div>
          <p style={{ color: 'var(--fg-muted)', marginBottom: 20 }}>
            To enable real-time sync, private groups, and persistent data, connect a Supabase project.
            <a href="/settings" style={{ color: 'var(--accent)', fontWeight: 600 }}>Configure in Settings →</a>
          </p>
          <div style={{
            padding: '24px',
            background: ctx.supabaseConnected ? 'var(--success-bg)' : 'var(--bg)',
            border: `1px solid ${ctx.supabaseConnected ? 'var(--success)' : 'var(--border)'}`,
            borderRadius: 'var(--radius)',
            textAlign: 'center',
          }}>
            {ctx.supabaseConnected ? (
              <>
                <Check size={32} style={{ color: 'var(--success)', marginBottom: 12 }} />
                <h4 style={{ fontWeight: 600, color: 'var(--success)', marginBottom: 8 }}>Supabase Connected!</h4>
                <p style={{ color: 'var(--fg-muted)' }}>Your project is linked and ready to sync.</p>
              </>
            ) : (
              <>
                <Database size={32} style={{ color: 'var(--fg-subtle)', marginBottom: 12 }} />
                <h4 style={{ fontWeight: 600, marginBottom: 8 }}>Not Connected</h4>
                <p style={{ color: 'var(--fg-muted)', marginBottom: 16 }}>
                  Add your Supabase URL and anon key in Settings to enable real features.
                </p>
                <Button variant="outline" onClick={() => ctx.setSupabaseConnected(true)}>
                  <Check size={18} /> Simulate Connection (Demo)
                </Button>
              </>
            )}
          </div>
        </div>
      )

    case 'subscriptions':
      return (
        <div>
          <p style={{ color: 'var(--fg-muted)', marginBottom: 20 }}>
            Add your AI subscriptions so we calculate your actual monthly spending.
            One subscription shared across tools counts only once per month.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { name: 'Claude Pro', tier: 'Pro', price: 20, tools: ['Claude Code'] },
              { name: 'Cursor Premium', tier: 'Premium', price: 30, tools: ['Cursor'] },
              { name: 'ChatGPT Plus', tier: 'Plus', price: 20, tools: ['Codex'] },
              { name: 'OpenCode (Free)', tier: 'Free', price: 0, tools: ['OpenCode'] },
            ].map((sub, i) => (
              <div
                key={sub.name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '16px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 36, height: 36,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--accent-bg)',
                    border: '1px solid var(--accent)',
                    borderRadius: '50%',
                    fontWeight: 700,
                    color: 'var(--accent)',
                  }}>{i + 1}</div>
                  <div>
                    <div style={{ fontWeight: 600 }}>{sub.name}</div>
                    <div style={{ fontSize: '0.8125rem', color: 'var(--fg-subtle)' }}>
                      {sub.tools.join(', ')} • {sub.tier}
                    </div>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 700, fontSize: '1.125rem', color: 'var(--accent)' }}>
                    ${sub.price}/mo
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, textAlign: 'center' }}>
            <Button variant="outline" onClick={() => ctx.setSubscriptionsAdded(true)}>
              <Check size={18} /> I've Added Mine (Demo)
            </Button>
          </div>
        </div>
      )

    case 'groups':
      return (
        <div>
          <p style={{ color: 'var(--fg-muted)', marginBottom: 20 }}>
            Create a private group to compare usage and spending with friends.
            Only group members can see each other's data.
          </p>
          <div style={{
            padding: '24px',
            background: 'var(--bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            textAlign: 'center',
          }}>
            <Users size={32} style={{ color: 'var(--accent)', marginBottom: 12 }} />
            <h4 style={{ fontWeight: 600, marginBottom: 8 }}>No Groups Yet</h4>
            <p style={{ color: 'var(--fg-muted)', marginBottom: 16 }}>
              After onboarding, visit the Groups page to create your first group
              and invite friends via GitHub username or email.
            </p>
            <Button variant="outline">
              <Plus size={18} /> Create Group Later
            </Button>
          </div>
        </div>
      )

    case 'plugins':
      return (
        <div>
          <p style={{ color: 'var(--fg-muted)', marginBottom: 20 }}>
            Install plugins for your AI tools to automatically track usage.
            Each plugin sends only token totals — never prompts, code, or transcripts.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {[
              { name: 'OpenCode', icon: '⌨️', desc: 'Server plugin using session.usage.updated events', status: 'Ready' },
              { name: 'Claude Code', icon: '🤖', desc: 'Hook + OpenTelemetry export via Stop event', status: 'Ready' },
              { name: 'Cursor', icon: '📝', desc: 'Hook plugin using sessionEnd event', status: 'Ready' },
              { name: 'Codex', icon: '💬', desc: 'Hook using PostModelRequest for token_usage', status: 'Ready' },
            ].map((plugin) => (
              <div
                key={plugin.name}
                style={{
                  padding: '16px',
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: '1.5rem' }}>{plugin.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600 }}>{plugin.name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--fg-subtle)' }}>{plugin.desc}</div>
                  </div>
                </div>
                <Badge variant="success" size="sm">{plugin.status}</Badge>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: '16px', background: 'var(--accent-bg)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)' }}>
            <p style={{ color: 'var(--accent)', fontSize: '0.875rem', margin: 0 }}>
              <strong>Plugin code is in <code>plugins/</code></strong> — copy to your tool's plugin directory.
              See <a href="/settings" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Settings → Plugins</a> for install commands.
            </p>
          </div>
        </div>
      )

    default:
      return null
  }
}

function FeaturePill({ icon: Icon, label }: { icon: React.ComponentType<{ size?: number; color?: string }>; label: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 14px',
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      fontSize: '0.8125rem',
      fontWeight: 500,
    }}>
    <Icon size={16} color="var(--accent)" />
    <span>{label}</span>
  </div>
  )
}