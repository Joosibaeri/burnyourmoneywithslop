import { Plugin } from '@opencode/plugin'
import { isAbsolute } from 'node:path'
import { configDirectory } from '../../shared/config'
import { enqueueEvents, flushEvents } from '../../shared/transport'
import { OpenCodeSteps } from './steps'

export default Plugin.define({
  id: 'burnyourmoneywithslop',
  setup(ctx) {
    const configured = ctx.options.configDirectory
    if (configured !== undefined && (typeof configured !== 'string' || !isAbsolute(configured))) throw new Error('Collector configDirectory must be an absolute path')
    const directory = typeof configured === 'string' ? configured : configDirectory()
    const steps = new OpenCodeSteps()
    const controller = new AbortController()
    let flushing = false
    let lastWarning = 0
    const warn = () => {
      if (Date.now() - lastWarning < 60_000) return
      lastWarning = Date.now()
      // Never log events, transcript content, local paths, or credential errors.
      console.warn('Burn Your Money: collector unavailable. Run collector login/status/flush; queued metrics stay local.')
    }
    const flush = async () => {
      if (flushing) return
      flushing = true
      try { await flushEvents(directory, 5) } catch { warn() }
      finally { flushing = false }
    }
    const timer = setInterval(() => { void flush() }, 30_000)
    timer.unref()

    // V2 subscriptions are live AsyncIterables, not promises. One ordered stream
    // preserves the dispatched model even if the session switches models later.
    const running = (async () => {
      for await (const event of ctx.event.subscribe({
        types: ['session.step.started', 'session.step.ended', 'session.step.failed',
          'session.compaction.started', 'session.compaction.ended', 'session.compaction.failed'],
        signal: controller.signal,
      })) {
        try {
          // The context contains the newest compaction's immutable message ID;
          // use it so live collection and historical importing share one identity.
          const messages = event.type === 'session.compaction.started' || event.type === 'session.compaction.ended' || event.type === 'session.compaction.failed'
            ? await ctx.session.context({ sessionID: event.data.sessionID }) : []
          const usage = steps.accept(event, messages)
          if (!usage) continue
          await enqueueEvents([usage], directory)
          void flush()
        } catch { warn() }
      }
    })().catch(() => { if (!controller.signal.aborted) warn() })

    return async () => {
      controller.abort()
      clearInterval(timer)
      await running
      // Events are durable before upload; unloading must not wait for the network.
      steps.clear()
    }
  },
})
