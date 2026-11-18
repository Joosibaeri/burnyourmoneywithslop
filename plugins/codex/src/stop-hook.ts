import { runHook } from '../../shared/hook'

// A separate background Stop hook flushes the durable request queue.
await runHook(async () => [])
