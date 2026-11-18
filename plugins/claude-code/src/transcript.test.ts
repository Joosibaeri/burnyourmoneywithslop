// @vitest-environment node
import { appendFile, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectClaudeUsage, parseClaudeTranscript, readClaudeTranscript } from './transcript'
import { collectorFixture, queued } from '../../test/helpers'

const directories: string[] = []
async function fixture() { const result = await collectorFixture(); directories.push(result.directory); return result }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
function entry(id: string, output = 20) {
  return { type: 'assistant', uuid: `chunk-${id}`, timestamp: '2026-11-18T12:00:00Z', sessionId: 'local-session',
    message: { id, model: 'claude-sonnet-5-5', content: [{ text: 'PRIVATE PROMPT/CODE' }], usage: {
      input_tokens: 100, output_tokens: output, cache_read_input_tokens: 30, cache_creation_input_tokens: 10,
      cache_creation: { ephemeral_5m_input_tokens: 6, ephemeral_1h_input_tokens: 4 }, thinking_tokens: 999,
    } } }
}
const jsonl = (...entries: unknown[]) => entries.map(value => JSON.stringify(value)).join('\n') + '\n'

describe('Claude local transcript collection', () => {
  it('collects every available assistant request, deduplicating streamed API message IDs', () => {
    const events = parseClaudeTranscript(jsonl(entry('msg_a', 10), entry('msg_b'), { ...entry('msg_a'), uuid: 'different-content-block' }), 'session')
    expect(events).toHaveLength(2)
    expect(events[0].output_tokens).toBe(20)
    expect(events[0].reasoning_tokens).toBe(0)
    expect(events[0].cache_read_tokens).toBe(30)
    expect(events[0].cache_write_tokens).toBe(10)
    expect(JSON.stringify(events)).not.toContain('PRIVATE')
    expect(JSON.stringify(events)).not.toContain('msg_a')
    expect(events[0].cost_source).toBe('list_price')
  })
  it('does not mistake the final subagent tool response for the whole run', () => {
    const events = parseClaudeTranscript(jsonl({ type: 'user', tool_response: { usage: { input_tokens: 10000 } } }, entry('msg_one'), entry('msg_two')), 'session')
    expect(events).toHaveLength(2)
    expect(events.reduce((sum, event) => sum + event.input_tokens, 0)).toBe(200)
  })
  it('ignores incomplete/unsupported records and never guesses missing IDs or timestamps', () => {
    const events = parseClaudeTranscript(jsonl({ ...entry('msg_missing_time'), timestamp: undefined }, { ...entry('msg_missing_id'), message: { usage: { input_tokens: 1, output_tokens: 1 } } }, entry('msg_valid')) + '{"partial":', 'session')
    expect(events).toHaveLength(1)
  })
  it('durably queues metrics before checkpointing and recovers late transcript entries', async () => {
    const { directory, credentials } = await fixture()
    const path = join(directory, 'transcript.jsonl')
    await writeFile(path, jsonl(entry('msg_one'), entry('msg_two')))
    const input = { hook_event_name: 'Stop', session_id: 'session', transcript_path: path }
    expect(await collectClaudeUsage(input, directory, 0)).toHaveLength(2)
    expect(await collectClaudeUsage(input, directory, 0)).toHaveLength(0)
    await appendFile(path, jsonl(entry('msg_late')))
    expect(await collectClaudeUsage(input, directory, 0)).toHaveLength(1)
    const pending = await queued(directory, credentials)
    expect(pending).toHaveLength(3)
    expect(JSON.stringify(pending)).not.toContain('PRIVATE')
    expect(await readFile(path, 'utf8')).toContain('PRIVATE') // Original file is never copied or edited.
  })
  it('reads the provided subagent transcript rather than reusing the parent’s last usage', async () => {
    const { directory } = await fixture()
    const path = join(directory, 'subagent.jsonl')
    await writeFile(path, jsonl(entry('msg_child_a'), entry('msg_child_b')))
    const events = await collectClaudeUsage({ hook_event_name: 'SubagentStop', session_id: 'parent-session', transcript_path: '/PRIVATE/not-read', agent_transcript_path: path }, directory, 0)
    expect(events).toHaveLength(2)
  })
  it('handles missing files without hanging or inventing usage', async () => {
    const { directory } = await fixture()
    await expect(readClaudeTranscript(join(directory, 'missing.jsonl'), 'session')).rejects.toThrow()
  })
})
