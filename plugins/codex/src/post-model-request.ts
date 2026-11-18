import { runHook } from '../../shared/hook'
import { completeCodexAttempt } from './attempts'

// Paired Pre/Post hooks must be synchronous, but never wait on network I/O.
await runHook(completeCodexAttempt, { queueOnly: true })
