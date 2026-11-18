import { counter, opaqueId, usageEvent, type UsageEvent } from '../../shared/events'

interface StepEvent {
  type: 'session.step.started' | 'session.step.ended' | 'session.step.failed'
  id: string
  created: number
  data: {
    sessionID: string
    assistantMessageID: string
    model?: { providerID: string; id: string }
    cost?: number
    tokens?: { input: number; output: number; reasoning: number; cache: { read: number; write: number } }
  }
}

export class OpenCodeSteps {
  private readonly models = new Map<string, string>()

  accept(event: StepEvent): UsageEvent | null {
    const key = opaqueId(event.data.sessionID, event.data.assistantMessageID)
    if (event.type === 'session.step.started') {
      const model = event.data.model
      if (model) this.models.set(key, `${model.providerID}/${model.id}`)
      if (this.models.size > 10_000) this.models.delete(this.models.keys().next().value!)
      return null
    }
    const model = this.models.get(key) ?? null
    this.models.delete(key)
    const tokens = event.data.tokens
    if (!tokens && !event.data.cost) return null
    // OpenCode already reports disjoint request counters. Never also collect
    // session.usage.updated (cumulative), or guess the model from session.model.
    return usageEvent('opencode', event.id, event.data.sessionID, model, {
      input_tokens: counter(tokens?.input), output_tokens: counter(tokens?.output),
      reasoning_tokens: counter(tokens?.reasoning), cache_read_tokens: counter(tokens?.cache.read),
      cache_write_tokens: counter(tokens?.cache.write),
    }, new Date(event.created).toISOString(), event.data.cost ?? 0, event.data.cost == null ? 'unavailable' : 'reported')
  }

  clear(): void { this.models.clear() }
}
