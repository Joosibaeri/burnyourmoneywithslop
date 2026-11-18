import { counter, usageEvent, type UsageEvent } from '../../shared/events'

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

export function parseCursorBilling(body: unknown, userId: string): { events: UsageEvent[]; skipped: number; unavailableCosts: number } {
  if (!/^user_[A-Za-z0-9]+$/.test(userId)) throw new Error('Supply your encoded Cursor user_ ID, not an email or numeric ID')
  const data = record(body)?.data
  if (!Array.isArray(data)) throw new Error('Expected the documented /v2/teams/billing-items JSON response with a data array')
  const events = new Map<string, UsageEvent>()
  let skipped = 0
  for (const value of data) {
    const item = record(value)
    const principal = record(item?.principal)
    if (!item || principal?.type !== 'user' || principal.id !== userId || item.product !== 'cursor' || item.chargeCategory !== 'usage') { skipped++; continue }
    if (typeof item.billingItemId !== 'string' || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(item.billingItemId) ||
      typeof item.eventTime !== 'string' || !Number.isFinite(Date.parse(item.eventTime)) ||
      !['included', 'on_demand', 'credits', 'free'].includes(String(item.usageType))) throw new Error('Unsupported Cursor billing item')
    // Earlier data cannot reliably distinguish Cursor from other products.
    if (Date.parse(item.eventTime) < Date.parse('2026-07-19T00:00:00Z')) { skipped++; continue }
    const usage = record(item.usage)
    const pricing = record(item.pricing)
    if (!usage || pricing?.currency !== 'USD' || typeof pricing.contracted !== 'string' || !/^\d+(?:\.\d+)?$/.test(pricing.contracted)) throw new Error('Unsupported billing meters or currency')
    const tokens = { input_tokens: counter(usage['prompt-text-tokens']), output_tokens: counter(usage['completion-text-tokens']),
      reasoning_tokens: 0, cache_read_tokens: counter(usage['cached-prompt-text-tokens']), cache_write_tokens: counter(usage['cache-write-text-tokens']) }
    if (Object.values(tokens).every(count => count === 0)) { skipped++; continue }
    const cost = Number(pricing.contracted)
    // Included/credit usage can hide costs as zero without a visibility marker.
    // Do not present those rows as known-free or as actual invoice charges.
    const hidden = cost === 0 && ['included', 'credits'].includes(String(item.usageType))
    const extras = record(item.displayExtras)
    const event = usageEvent('cursor', item.billingItemId.toLowerCase(), null, extras?.model, tokens,
      item.eventTime, cost, hidden ? 'unavailable' : 'reported')
    events.set(event.event_id, event)
  }
  return { events: [...events.values()], skipped, unavailableCosts: [...events.values()].filter(event => event.cost_source === 'unavailable').length }
}
