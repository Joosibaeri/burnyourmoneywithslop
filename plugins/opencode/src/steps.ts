import { opaqueId, usageEvent, type UsageEvent } from '../../shared/events'
import { openCodeCounters, openCodeMessageUsage, openCodeModelId, openCodeRequest, type OpenCodeMessage, type OpenCodeModel, type OpenCodeTokens } from './requests'

interface StepEvent {
  type: 'session.step.started' | 'session.step.ended' | 'session.step.failed' |
    'session.compaction.started' | 'session.compaction.ended' | 'session.compaction.failed'
  id: string
  created: number
  data: {
    sessionID: string
    assistantMessageID?: string
    model?: OpenCodeModel
    cost?: number
    tokens?: OpenCodeTokens
  }
}

export class OpenCodeSteps {
  private readonly models = new Map<string, string>()
  private readonly compactions = new Map<string, string>()

  accept(event: StepEvent, messages: readonly OpenCodeMessage[] = []): UsageEvent | null {
    if (event.type === 'session.compaction.started') {
      const running = messages.filter(message => message.type === 'compaction' && message.status === 'running')
        .sort((a, b) => b.time.created - a.time.created)[0]
      if (running) this.compactions.set(event.data.sessionID, running.id)
      if (this.compactions.size > 10_000) this.compactions.delete(this.compactions.keys().next().value!)
      return null
    }
    if (event.type === 'session.compaction.ended' || event.type === 'session.compaction.failed') {
      const messageID = this.compactions.get(event.data.sessionID)
      this.compactions.delete(event.data.sessionID)
      if (!event.data.tokens && !event.data.cost) return null
      const counters = openCodeCounters(event.data.tokens)
      const message = messages.filter(message => message.type === 'compaction' && message.time.created <= event.created &&
        (messageID === undefined || message.id === messageID)).sort((a, b) => b.time.created - a.time.created)[0]
      const usage = message && openCodeMessageUsage(event.data.sessionID, message)
      const status = event.type === 'session.compaction.failed' ? 'failed' : 'completed'
      if (!usage || message.status !== status || Object.keys(counters).some(key =>
        usage[key as keyof typeof counters] !== counters[key as keyof typeof counters])) {
        throw new Error('Completed compaction usage is unavailable. Recover saved requests with opencode:import.')
      }
      return usage
    }
    if (!event.data.assistantMessageID) throw new Error('OpenCode step requires an assistant message identity')
    const key = opaqueId(event.data.sessionID, event.data.assistantMessageID)
    if (event.type === 'session.step.started') {
      const model = event.data.model
      if (model) this.models.set(key, openCodeModelId(model)!)
      if (this.models.size > 10_000) this.models.delete(this.models.keys().next().value!)
      return null
    }
    const model = this.models.get(key) ?? null
    this.models.delete(key)
    const tokens = event.data.tokens
    if (!tokens && !event.data.cost) return null
    // These are model-request counters for the assembled context, including
    // system instructions and tool-feedback continuations—not prompt-text sizes.
    // Respect OpenCode's uncached/cache classification without reading content.
    // Never collect session.usage.updated (cumulative), or guess the model from
    // session.model. Canonical request IDs also deduplicate explicit backfills.
    // Paid failed attempts can reuse an assistant ID on retry, and their old
    // counters can disappear from the final projection. Preserve each physical
    // failed attempt using its immutable boundary ID, not the successful retry ID.
    if (event.type === 'session.step.failed') return usageEvent('opencode', event.id, event.data.sessionID, model,
      openCodeCounters(tokens), new Date(event.created).toISOString(), event.data.cost ?? 0,
      event.data.cost == null ? 'unavailable' : 'reported')
    return openCodeRequest(event.data.sessionID, event.data.assistantMessageID, model, tokens, event.created, event.data.cost)
  }

  clear(): void { this.models.clear(); this.compactions.clear() }
}
