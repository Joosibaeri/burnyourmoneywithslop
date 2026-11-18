import { runHook } from '../../shared/hook'
import { collectClaudeUsage } from './transcript'

// SessionEnd has a shared 1.5s default budget. Queue locally, never wait on HTTP.
await runHook(input => collectClaudeUsage(input, undefined, 150), { queueOnly: true })
