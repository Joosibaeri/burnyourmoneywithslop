import { describe, expect, it } from 'vitest'
import { internalReturnTo } from './auth-redirect'
import { isPublishableKey } from './client-config'

describe('client auth boundaries', () => {
  it('preserves internal invite return paths only', () => {
    expect(internalReturnTo('/invite/friends-code')).toBe('/invite/friends-code')
    for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/\nLocation:evil', null]) expect(internalReturnTo(value)).toBe('/')
  })
  it('rejects secret/service-role keys in public clients', () => {
    const jwt = (role: string) => 'header.' + btoa(JSON.stringify({ role })) + '.signature'
    expect(isPublishableKey('sb_publishable_public')).toBe(true)
    expect(isPublishableKey(jwt('anon'))).toBe(true)
    expect(isPublishableKey(jwt('service_role'))).toBe(false)
    expect(isPublishableKey('sb_secret_private')).toBe(false)
  })
})
