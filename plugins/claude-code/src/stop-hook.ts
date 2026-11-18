import { runHook } from '../../shared/hook'
import { collectClaudeUsage } from './transcript'

await runHook(collectClaudeUsage)
