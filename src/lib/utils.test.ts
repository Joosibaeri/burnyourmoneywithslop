import { describe, it, expect } from 'vitest'
import { formatNumber, formatCurrency, formatCurrencyPrecise, getSubscriptionCatalog, calculateMonthlySubscriptionCost } from '@/lib/utils'

describe('utils', () => {
  describe('formatNumber', () => {
    it('formats small numbers', () => {
      expect(formatNumber(42)).toBe('42')
      expect(formatNumber(999)).toBe('999')
    })

    it('formats thousands', () => {
      expect(formatNumber(1_500)).toBe('1.5K')
      expect(formatNumber(10_000)).toBe('10K')
    })

    it('formats millions', () => {
      expect(formatNumber(1_500_000)).toBe('1.5M')
      expect(formatNumber(47_800_000)).toBe('47.8M')
    })

    it('formats billions', () => {
      expect(formatNumber(1_500_000_000)).toBe('1.5B')
    })

    it('formats trillions', () => {
      expect(formatNumber(1_500_000_000_000)).toBe('1.5T')
    })
  })

  describe('formatCurrency', () => {
    it('formats whole dollars', () => {
      expect(formatCurrency(0)).toBe('$0')
      expect(formatCurrency(20)).toBe('$20')
      expect(formatCurrency(100)).toBe('$100')
    })

    it('formats large amounts', () => {
      expect(formatCurrency(1_247)).toBe('$1,247')
      expect(formatCurrency(10_000)).toBe('$10,000')
    })
  })

  describe('formatCurrencyPrecise', () => {
    it('formats with cents', () => {
      expect(formatCurrencyPrecise(20.5)).toBe('$20.50')
      expect(formatCurrencyPrecise(0.01)).toBe('$0.01')
      expect(formatCurrencyPrecise(99.99)).toBe('$99.99')
    })
  })

  describe('getSubscriptionCatalog', () => {
    it('returns all four providers', () => {
      const catalog = getSubscriptionCatalog()
      expect(catalog).toHaveLength(4)
      expect(catalog.map(c => c.id)).toEqual(['claude-pro', 'cursor', 'chatgpt', 'opencode'])
    })

    it('has tiers for each provider', () => {
      const catalog = getSubscriptionCatalog()
      catalog.forEach(provider => {
        expect(provider.tiers.length).toBeGreaterThan(0)
        provider.tiers.forEach(tier => {
          expect(tier.id).toBeTruthy()
          expect(tier.name).toBeTruthy()
          expect(typeof tier.price).toBe('number')
          expect(tier.price).toBeGreaterThanOrEqual(0)
        })
      })
    })
  })

  describe('calculateMonthlySubscriptionCost', () => {
    it('calculates cost for single subscriptions', () => {
      const subs = [
        { catalogId: 'claude-pro', tierId: 'pro' },
        { catalogId: 'cursor', tierId: 'premium' },
      ]
      expect(calculateMonthlySubscriptionCost(subs)).toBe(50) // 20 + 30
    })

    it('deduplicates same catalog across tools', () => {
      const subs = [
        { catalogId: 'chatgpt', tierId: 'plus' }, // Codex
        { catalogId: 'chatgpt', tierId: 'plus' }, // OpenCode (same catalog)
      ]
      expect(calculateMonthlySubscriptionCost(subs)).toBe(20) // Only counted once
    })

    it('uses custom price when provided', () => {
      const subs = [
        { catalogId: 'claude-pro', tierId: 'pro', customPrice: 25 },
      ]
      expect(calculateMonthlySubscriptionCost(subs)).toBe(25)
    })

    it('handles empty array', () => {
      expect(calculateMonthlySubscriptionCost([])).toBe(0)
    })

    it('handles free tier', () => {
      const subs = [
        { catalogId: 'opencode', tierId: 'free' },
      ]
      expect(calculateMonthlySubscriptionCost(subs)).toBe(0)
    })
  })
})