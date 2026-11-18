import { runHook } from '../../shared/hook'
import { beginCodexAttempt } from './attempts'

await runHook(async input => { await beginCodexAttempt(input); return [] }, { queueOnly: true })
