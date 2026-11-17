export function formatNumber(num: number): string {
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T'
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B'
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M'
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K'
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

export function getMockStats() {
  return {
    totalSpent: 247,
    spentChange: { value: 12.5, positive: true },
    totalTokens: 47_800_000,
    tokensChange: { value: 8.2, positive: true },
    activeTools: 3,
    groupCount: 2,
    toolBreakdown: [
      { name: 'Claude Code', tokens: 22_400_000, cost: 89, color: '#60a5fa' },
      { name: 'Cursor', tokens: 15_200_000, cost: 67, color: '#c084fc' },
      { name: 'OpenCode', tokens: 8_500_000, cost: 34, color: '#f97316' },
      { name: 'Codex', tokens: 1_700_000, cost: 12, color: '#22c55e' },
    ],
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
  ]
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
  ]
}

export function getSubscriptionCatalog() {
  return [
    {
      id: 'claude-pro',
      name: 'Claude Pro',
      provider: 'Anthropic',
      tiers: [
        { id: 'pro', name: 'Pro', price: 20, features: ['5x usage', 'Projects', 'Claude Code access'] },
        { id: 'max', name: 'Max', price: 100, features: ['5x Pro usage', '$100 API credits', 'Priority access'] },
        { id: 'ultra', name: 'Ultra', price: 200, features: ['10x Pro usage', '$200 API credits', 'No 5-hour limit'] },
      ],
    },
    {
      id: 'cursor',
      name: 'Cursor',
      provider: 'Anysphere',
      tiers: [
        { id: 'plus', name: 'Plus', price: 8, features: ['Shared AI pool', 'Grok models'] },
        { id: 'premium', name: 'Premium', price: 30, features: ['4x Plus usage', 'Third-party models', 'Cloud agents'] },
        { id: 'super', name: 'Super', price: 100, features: ['15x Plus usage', 'Priority model access'] },
        { id: 'ultra', name: 'Ultra', price: 200, features: ['50x Plus usage', 'Earliest access'] },
      ],
    },
    {
      id: 'chatgpt',
      name: 'ChatGPT',
      provider: 'OpenAI',
      tiers: [
        { id: 'plus', name: 'Plus', price: 20, features: ['Priority access', 'Higher limits', 'Advanced reasoning'] },
        { id: 'pro-100', name: 'Pro 100', price: 100, features: ['More Work/Codex', '2x allowance'] },
        { id: 'pro-200', name: 'Pro 200', price: 200, features: ['Even more usage', 'Updated allowance'] },
        { id: 'pro-500', name: 'Pro 500', price: 500, features: ['Ultrafast models', 'Highest usage'] },
      ],
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      provider: 'OpenCode',
      tiers: [
        { id: 'free', name: 'Free', price: 0, features: ['Unlimited local usage', 'All models via API keys'] },
      ],
    },
  ]
}

export const SUBSCRIPTION_CATALOG = getSubscriptionCatalog()

export function calculateMonthlySubscriptionCost(subscriptions: Array<{ catalogId: string; tierId: string }>): number {
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
    total += tier.price
  }

  return total
}