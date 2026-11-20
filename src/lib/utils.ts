import { demoTokenTotals } from './tokens'

export function formatNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T'
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'
  return num.toLocaleString()
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatCurrencyPrecise(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

// Recorded invoices have two decimal places. Sum cents so equivalent billing
// totals (e.g. $0.10 + $0.20 and $0.30) also share a comparison rank.
export function addRecordedUsd(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(b * 100)) / 100
}

export function getMockStats() {
  return {
    totalSpent: 247,
    spentChange: { value: 12.5, positive: true },
    totalTokens: 47_800_000,
    tokenTotals: demoTokenTotals(47_800_000),
    tokensChange: { value: 8.2, positive: true },
    activeTools: 3,
    groupCount: 2,
    toolBreakdown: [
      { name: 'Claude Code', tokens: 22_400_000, cost: 89, color: '#60a5fa' },
      { name: 'Cursor', tokens: 15_200_000, cost: 67, color: '#c084fc' },
      { name: 'OpenCode', tokens: 8_500_000, cost: 34, color: '#f97316' },
      { name: 'Codex', tokens: 1_700_000, cost: 12, color: '#22c55e' },
    ].map(tool => ({ ...tool, tokenTotals: demoTokenTotals(tool.tokens), unknownCostEvents: 0 })),
    subscriptions: [
      { name: 'Claude Pro', tier: 'Pro', cost: 20, tools: ['Claude Code'], active: true },
      { name: 'Cursor Premium', tier: 'Premium', cost: 30, tools: ['Cursor'], active: true },
      { name: 'ChatGPT Plus', tier: 'Plus', cost: 20, tools: ['Codex'], active: false },
      { name: 'OpenCode (Free)', tier: 'Free', cost: 0, tools: ['OpenCode'], active: true },
    ],
  }
}

export function getMockMonthlyData() {
  return [
    { month: 'Jan', spent: 180, tokens: 32_000_000, estimated: 45 },
    { month: 'Feb', spent: 195, tokens: 35_500_000, estimated: 52 },
    { month: 'Mar', spent: 210, tokens: 38_200_000, estimated: 48 },
    { month: 'Apr', spent: 225, tokens: 41_000_000, estimated: 55 },
    { month: 'May', spent: 235, tokens: 44_300_000, estimated: 50 },
    { month: 'Jun', spent: 247, tokens: 47_800_000, estimated: 47 },
  ].map((month, index) => {
    const now = new Date()
    return { ...month, month: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1)).toISOString().slice(0, 7), tokenTotals: demoTokenTotals(month.tokens), unknownCostEvents: 0 }
  })
}

export function getMockGroups() {
  return [
    {
      id: '1',
      name: 'The Token Burners',
      description: 'We spend way too much on AI',
      memberCount: 4,
      totalSpent: 1_247,
      totalTokens: 245_000_000,
      yourRank: 2,
      members: [
        { id: '1', name: 'alex', login: 'alexchen', avatar: '', spent: 420, tokens: 85_000_000, tools: ['Claude Code', 'Cursor'] },
        { id: '2', name: 'you', login: 'joosibaeri', avatar: '', spent: 247, tokens: 47_800_000, tools: ['Claude Code', 'Cursor', 'OpenCode'] },
        { id: '3', name: 'sam', login: 'samdev', avatar: '', spent: 180, tokens: 38_000_000, tools: ['Cursor', 'Codex'] },
        { id: '4', name: 'taylor', login: 'taylorcodes', avatar: '', spent: 120, tokens: 25_000_000, tools: ['OpenCode'] },
      ],
    },
    {
      id: '2',
      name: 'Weekend Warriors',
      description: 'Coding on weekends only',
      memberCount: 3,
      totalSpent: 580,
      totalTokens: 112_000_000,
      yourRank: 1,
      members: [
        { id: '2', name: 'you', login: 'joosibaeri', avatar: '', spent: 247, tokens: 47_800_000, tools: ['Claude Code', 'Cursor', 'OpenCode'] },
        { id: '5', name: 'jordan', login: 'jordanwk', avatar: '', spent: 195, tokens: 35_000_000, tools: ['Cursor'] },
        { id: '6', name: 'casey', login: 'caseydev', avatar: '', spent: 138, tokens: 29_200_000, tools: ['Claude Code'] },
      ],
    },
  ].map(group => {
    const members = group.members.map(member => ({ ...member, tokenTotals: demoTokenTotals(member.tokens), estimated: member.spent * 0.6, unknownCostEvents: 0 }))
    return { ...group, totalSpent: members.reduce((sum, member) => sum + member.spent + member.estimated, 0), members }
  })
}

export function getSubscriptionCatalog() {
  return [
    {
      id: 'claude-pro',
      name: 'Claude',
      provider: 'Anthropic',
      tiers: [
        { id: 'pro', name: 'Pro', price: 20, features: ['Claude Code access', 'Provider usage limits apply'] },
        { id: 'max', name: 'Max (5x)', price: 100, features: ['5x Pro usage', 'API usage billed separately'] },
        { id: 'ultra', name: 'Max (20x)', price: 200, features: ['20x Pro usage', 'Provider usage limits apply'] },
      ],
    },
    {
      id: 'cursor',
      name: 'Cursor',
      provider: 'Anysphere',
      tiers: [
        { id: 'free', name: 'Free', price: 0, features: ['Limited Cursor-model usage'] },
        { id: 'plus', name: 'Plus', price: 8, features: ['The X Subscription', 'Weekly Cursor/Grok pool', 'No third-party models'] },
        { id: 'premium', name: 'Premium', price: 30, features: ['4x Plus weekly pool', 'Third-party models paid from prepaid credit'] },
        { id: 'super', name: 'Super', price: 100, features: ['15x Plus weekly pool', 'Third-party models paid separately'] },
        { id: 'ultra', name: 'Ultra', price: 200, features: ['50x Plus weekly pool', 'Third-party models paid separately'] },
        { id: 'pro', name: 'Legacy Pro', price: 20, features: ['Existing legacy subscribers', 'Monthly usage pools'] },
        { id: 'pro-plus', name: 'Legacy Pro+', price: 60, features: ['Existing legacy subscribers', 'Monthly usage pools'] },
        { id: 'teams-standard', name: 'Legacy Teams Standard', price: 40, features: ['Per paid seat', 'Monthly usage pools'] },
        { id: 'teams-premium', name: 'Legacy Teams Premium', price: 120, features: ['Per paid seat', 'Monthly usage pools'] },
      ],
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      provider: 'OpenAI',
      tiers: [
        { id: 'plus', name: 'Plus', price: 20, features: ['Priority access', 'Higher limits', 'Advanced reasoning'] },
        { id: 'pro-100', name: 'Pro 100', price: 100, features: ['Work/Codex allowance tier', 'API usage billed separately'] },
        { id: 'pro-200', name: 'Pro 200', price: 200, features: ['Work/Codex allowance tier', 'Provider limits apply'] },
        { id: 'pro-500', name: 'Pro 500', price: 500, features: ['Work/Codex allowance tier', 'Provider limits apply'] },
      ],
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      provider: 'OpenCode',
      tiers: [
        { id: 'free', name: 'Free client', price: 0, features: ['Open-source client', 'Paid APIs billed separately'] },
        { id: 'go', name: 'Go', price: 10, features: ['Optional model subscription', '5-hour, weekly and monthly limits'] },
        { id: 'go-plus', name: 'Go Plus', price: 40, features: ['Higher model usage limits', 'Extra usage billed separately'] },
        { id: 'go-teams', name: 'Go Teams (per seat)', price: 20, features: ['2-member / $40 workspace minimum', 'Enter your own invoice share'] },
      ],
    },
  ]
}

export const SUBSCRIPTION_CATALOG = getSubscriptionCatalog()

export function calculateMonthlySubscriptionCost(subscriptions: Array<{ catalogId: string; tierId: string; customPrice?: number }>): number {
  let total = 0
  const seenTools = new Set<string>()

  for (const sub of subscriptions) {
    const catalog = SUBSCRIPTION_CATALOG.find(c => c.id === sub.catalogId)
    if (!catalog) continue

    const tier = catalog.tiers.find(t => t.id === sub.tierId)
    if (!tier) continue

    const toolKey = catalog.id
    if (seenTools.has(toolKey)) continue

    seenTools.add(toolKey)
    total += sub.customPrice ?? tier.price
  }

  return total
}
