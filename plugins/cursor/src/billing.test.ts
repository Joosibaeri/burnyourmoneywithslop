// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { parseCursorBilling } from './billing'

const ownId = 'user_PDSPmvukpYgZEDXsoNirw3CFhy'
const item = { billingItemId: '3f6c1b9e-5d2a-5c41-9b7e-2a4d8c0e1f35', eventTime: '2026-10-07T14:03:27.512Z', product: 'cursor', chargeCategory: 'usage', usageType: 'on_demand',
  principal: { type: 'user', id: ownId }, usage: { 'prompt-text-tokens': '1200', 'cached-prompt-text-tokens': '7', 'cache-write-text-tokens': '9', 'completion-text-tokens': '30' },
  pricing: { currency: 'USD', contracted: '0.0421500000' }, displayExtras: { model: 'auto-balance:claude-opus-5', userEmail: 'PRIVATE@example.com', displayLabel: 'PRIVATE' } }

describe('documented Cursor v2 billing imports', () => {
  it('imports only own Cursor token usage and drops display/identity metadata', () => {
    const result = parseCursorBilling({ data: [item,
      { ...item, principal: { type: 'user', id: 'user_someoneElse' } }, { ...item, principal: { type: 'team', id: ownId } },
      { ...item, product: 'grok-bot' }, { ...item, chargeCategory: 'credit' }, { ...item, chargeCategory: 'adjustment' },
    ] }, ownId)
    expect(result.events).toHaveLength(1)
    expect(result.skipped).toBe(5)
    expect(result.events[0].estimated_cost_usd).toBe(0.04215)
    expect(result.events[0].cache_write_tokens).toBe(9)
    expect(JSON.stringify(result.events)).not.toContain('PRIVATE')
    expect(JSON.stringify(result.events)).not.toContain(ownId)
  })
  it('deduplicates stable billing-item IDs, not identical legitimate rows', () => {
    const result = parseCursorBilling({ data: [item, item, { ...item, billingItemId: '7b9d2c4e-8a1f-4e6b-9c3d-5f0a1b2c3d4e' }] }, ownId)
    expect(result.events).toHaveLength(2)
  })
  it('marks zero included/credit costs as unavailable, not free', () => {
    const result = parseCursorBilling({ data: [{ ...item, usageType: 'included', pricing: { currency: 'USD', contracted: '0.0000000000' } }] }, ownId)
    expect(result.unavailableCosts).toBe(1)
    expect(result.events[0].cost_source).toBe('unavailable')
  })
  it('rejects guessed CSV/transcript schemas, other currencies and unsafe meters', () => {
    expect(() => parseCursorBilling({ usageEvents: [item] }, ownId)).toThrow()
    expect(() => parseCursorBilling({ data: [item] }, 'email@example.com')).toThrow()
    expect(() => parseCursorBilling({ data: [{ ...item, pricing: { currency: 'EUR', contracted: '1.00' } }] }, ownId)).toThrow()
    expect(() => parseCursorBilling({ data: [{ ...item, usage: { 'prompt-text-tokens': '-1' } }] }, ownId)).toThrow()
    expect(() => parseCursorBilling({ data: [{ ...item, billingItemId: 'guessed-request-id' }] }, ownId)).toThrow()
  })
  it('excludes older product-ambiguous data and non-token meters', () => {
    const result = parseCursorBilling({ data: [{ ...item, eventTime: '2026-07-01T00:00:00Z' }, { ...item, usage: { requests: '1' } }] }, ownId)
    expect(result.events).toHaveLength(0)
    expect(result.skipped).toBe(2)
  })
})
