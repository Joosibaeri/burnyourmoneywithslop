import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useAsyncData } from './useAsyncData'

afterEach(cleanup)
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

describe('request-scoped UI data', () => {
  it('hides the previous account’s result immediately when the key changes', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const loadFirst = () => first.promise
    const loadSecond = () => second.promise
    const hook = renderHook(({ key, load }) => useAsyncData(key, load), { initialProps: { key: 'alice', load: loadFirst } })
    await act(async () => { first.resolve('private-alice-data') })
    expect(hook.result.current.data).toBe('private-alice-data')
    hook.rerender({ key: 'bob', load: loadSecond })
    expect(hook.result.current.data).toBeNull()
    expect(hook.result.current.loading).toBe(true)
    await act(async () => { second.resolve('bob-data') })
    expect(hook.result.current.data).toBe('bob-data')
  })
  it('ignores a late response from a superseded request', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const loadFirst = () => first.promise
    const loadSecond = () => second.promise
    const hook = renderHook(({ key, load }) => useAsyncData(key, load), { initialProps: { key: 'old', load: loadFirst } })
    hook.rerender({ key: 'current', load: loadSecond })
    await act(async () => { second.resolve('current-data') })
    await act(async () => { first.resolve('old-data') })
    expect(hook.result.current.data).toBe('current-data')
  })
  it('does not fetch or retain data for a disabled request', async () => {
    const load = async () => 'should-not-load'
    const hook = renderHook(() => useAsyncData(null, load))
    await act(async () => {})
    expect(hook.result.current).toEqual({ data: null, error: null, loading: false })
  })
})
