// @vitest-environment node
import { rm } from 'node:fs/promises'
import { afterEach, describe, expect, it } from 'vitest'
import { beginCodexAttempt, completeCodexAttempt, codexCounters } from './attempts'
import { collectorFixture, queued } from '../../test/helpers'
import { saveCredentials } from '../../shared/storage'

const directories: string[] = []
async function fixture() { const result = await collectorFixture(); directories.push(result.directory); return result }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))) })
const pre = { hook_event_name: 'PreModelRequest', session_id: 'session', turn_id: 'turn', model: 'gpt-6.1-sol', cwd: '/PRIVATE', transcript_path: '/PRIVATE/transcript' }
const usage = { input_tokens: 100, output_tokens: 50, cached_input_tokens: 30, cache_write_input_tokens: 10, reasoning_output_tokens: 20, total_tokens: 150 }
const post = { ...pre, hook_event_name: 'PostModelRequest', status: 'completed', token_usage: usage, error: null }

describe('Codex paired synchronous request attempts', () => {
  it('splits overlapping cached/reasoning counters exactly once', () => {
    const tokens = codexCounters(usage)
    expect(tokens).toEqual({ input_tokens: 60, output_tokens: 30, cache_read_tokens: 30, cache_write_tokens: 10, reasoning_tokens: 20 })
    expect(Object.values(tokens).reduce((sum, value) => sum + value, 0)).toBe(150)
    expect(() => codexCounters({ ...usage, reasoning_output_tokens: 51 })).toThrow()
    expect(() => codexCounters({})).toThrow()
  })
  it('deduplicates concurrent duplicate hook registrations and Post retries', async () => {
    const { directory, credentials } = await fixture()
    await Promise.all([beginCodexAttempt(pre, directory), beginCodexAttempt(pre, directory)])
    const [first, second] = await Promise.all([completeCodexAttempt(post, directory), completeCodexAttempt(post, directory)])
    expect(first).toEqual(second)
    expect(await queued(directory, credentials)).toHaveLength(1)
    expect(JSON.stringify(first)).not.toContain('PRIVATE')
    expect(first[0].session_id).toMatch(/^[a-f0-9]{64}$/)
  })
  it('preserves identical genuine attempts, even in the same turn', async () => {
    const { directory, credentials } = await fixture()
    await beginCodexAttempt(pre, directory)
    const first = await completeCodexAttempt(post, directory)
    await beginCodexAttempt(pre, directory)
    const second = await completeCodexAttempt(post, directory)
    expect(first[0].event_id).not.toBe(second[0].event_id)
    expect(await queued(directory, credentials)).toHaveLength(2)
  })
  it('captures failed/cancelled requests with usage and isolates subagents', async () => {
    const { directory, credentials } = await fixture()
    const child = { ...pre, agent_id: 'child', agent_type: 'explore' }
    await Promise.all([beginCodexAttempt(pre, directory), beginCodexAttempt(child, directory)])
    const first = await completeCodexAttempt({ ...post, status: 'failed', error: 'PRIVATE provider error' }, directory)
    const second = await completeCodexAttempt({ ...post, ...child, hook_event_name: 'PostModelRequest', status: 'cancelled' }, directory)
    expect(first[0].event_id).not.toBe(second[0].event_id)
    expect(await queued(directory, credentials)).toHaveLength(2)
    expect(JSON.stringify(first)).not.toContain('PRIVATE')
  })
  it('never invents a request identity when Pre was missing or the account changed', async () => {
    const { directory, credentials } = await fixture()
    await expect(completeCodexAttempt(post, directory)).rejects.toThrow('matching Pre')
    await beginCodexAttempt(pre, directory)
    await saveCredentials(directory, { ...credentials, userId: '00000000-0000-0000-0000-000000000002' })
    await expect(completeCodexAttempt(post, directory)).rejects.toThrow('matching Pre')
  })
  it('closes a no-usage failure without emitting a fake summary', async () => {
    const { directory } = await fixture()
    await beginCodexAttempt(pre, directory)
    expect(await completeCodexAttempt({ ...post, status: 'failed', token_usage: null }, directory)).toEqual([])
    await beginCodexAttempt(pre, directory)
    expect(await completeCodexAttempt(post, directory)).toHaveLength(1)
  })
})
