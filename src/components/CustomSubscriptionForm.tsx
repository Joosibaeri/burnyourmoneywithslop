import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { customSubscriptionError, TOOLS, type CustomSubscriptionSelection } from '@/lib/data'

export function CustomSubscriptionForm({ subscription, saving, onSave, onCancel }: {
  subscription?: CustomSubscriptionSelection
  saving: boolean
  onSave: (sub: CustomSubscriptionSelection) => Promise<boolean>
  onCancel: () => void
}) {
  const [name, setName] = useState(subscription?.name ?? '')
  const [price, setPrice] = useState(subscription ? String(subscription.monthlyPrice) : '')
  const [tools, setTools] = useState(subscription?.tools ?? [])
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    const sub = { subscriptionId: subscription?.subscriptionId, name: name.trim(),
      monthlyPrice: price.trim() ? Number(price) : NaN, tools }
    const validationError = customSubscriptionError(sub)
    setError(validationError)
    if (validationError) return
    if (await onSave(sub)) onCancel()
  }

  return <form aria-label={subscription ? 'Edit custom subscription' : 'Add custom subscription'} onSubmit={submit} style={{ display: 'grid', gap: 16, padding: 20, marginBottom: 16, border: '1px solid var(--accent)', borderRadius: 'var(--radius)' }}>
    <Input id="custom-subscription-name" label="Subscription name" value={name} onChange={event => setName(event.target.value)} maxLength={100} required disabled={saving} placeholder="e.g., My AI plan" />
    <Input id="custom-subscription-price" label="Monthly price (USD)" type="number" min="0" max="99999999.99" step="0.01" value={price} onChange={event => setPrice(event.target.value)} required disabled={saving} helperText="Your monthly invoice amount or share; use a monthly equivalent for annual plans." />
    <fieldset style={{ border: 'none', padding: 0 }} disabled={saving}>
      <legend style={{ marginBottom: 8 }}>Covered tools</legend>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>{Object.entries(TOOLS).map(([toolId, tool]) => <label key={toolId} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type="checkbox" checked={tools.includes(toolId)} onChange={event => setTools(previous => event.target.checked ? [...previous, toolId] : previous.filter(id => id !== toolId))} /> {tool.name}
      </label>)}</div>
    </fieldset>
    <p style={{ color: 'var(--fg-muted)', fontSize: '0.8125rem' }}>Counted once per UTC month with recorded usage from a covered tool—not once per tool. Edits apply to this month and retain older prices.</p>
    {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
    <div style={{ display: 'flex', gap: 8 }}>
      <Button type="submit" disabled={saving} loading={saving}>Save custom subscription</Button>
      <Button type="button" variant="ghost" disabled={saving} onClick={onCancel}>Cancel</Button>
    </div>
  </form>
}
