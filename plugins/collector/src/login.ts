import { createServer, type ServerResponse } from 'node:http'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { LOGIN_PORT, validateConfig, type CollectorConfig } from '../../shared/config'
import { saveCredentials, withLock } from '../../shared/storage'

function reply(response: ServerResponse, status: number, message: string): void {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
  })
  // Only constant application messages are rendered here, never provider errors or tokens.
  response.end(`<!doctype html><title>Burn Your Money collector</title><h1>${message}</h1><p>You can close this tab and return to your terminal.</p>`)
}

export async function collectorLogin(config: CollectorConfig, directory: string, options: { onUrl: (url: string) => void | Promise<void>; port?: number; timeoutMs?: number }): Promise<void> {
  config = validateConfig(config)
  const state = randomBytes(32).toString('hex')
  const memory = new Map<string, string>()
  const supabase = createClient(config.supabaseUrl, config.publishableKey, {
    auth: {
      flowType: 'pkce', persistSession: true, autoRefreshToken: false, detectSessionInUrl: false,
      storageKey: 'burnyourmoney-collector-login',
      storage: { getItem: key => memory.get(key) ?? null, setItem: (key, value) => { memory.set(key, value) }, removeItem: key => { memory.delete(key) } },
    },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(10_000), redirect: 'error' }) },
  })
  let finish!: () => void
  let fail!: (error: Error) => void
  const completed = new Promise<void>((resolve, reject) => { finish = resolve; fail = reject })
  // A timeout can reject while onUrl is still running; attach a handler immediately.
  void completed.catch(() => {})
  let exchanging = false
  let port = options.port ?? LOGIN_PORT
  const server = createServer((request, response) => {
    void (async () => {
      const path = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
      const candidate = path.pathname.split('/').at(-1) ?? ''
      if (request.method !== 'GET' || request.headers.host !== `127.0.0.1:${port}` || path.pathname !== `/auth/callback/${candidate}` || !/^[a-f0-9]{64}$/.test(candidate) || !timingSafeEqual(Buffer.from(candidate), Buffer.from(state))) {
        reply(response, 400, 'Invalid collector callback'); return
      }
      if (path.searchParams.has('error')) {
        reply(response, 400, 'GitHub sign-in was not completed'); fail(new Error('GitHub sign-in was not completed')); return
      }
      const code = path.searchParams.get('code')
      if (!code || code.length > 2048 || exchanging) { reply(response, 400, 'Missing or already-used sign-in code'); return }
      exchanging = true
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (error || !data.session) throw new Error('Could not exchange collector sign-in code')
      const session = data.session
      await withLock(directory, () => saveCredentials(directory, {
        ...config, accessToken: session.access_token, refreshToken: session.refresh_token,
        expiresAt: session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in, userId: session.user.id,
      }))
      reply(response, 200, 'Collector signed in successfully')
      finish()
    })().catch(() => { reply(response, 400, 'Collector sign-in failed'); fail(new Error('Collector sign-in failed. Run login again.')) })
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  const timer = setTimeout(() => fail(new Error('Collector login timed out after five minutes. Run login again.')), options.timeoutMs ?? 300_000)
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Could not bind collector callback')
    port = address.port
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github', options: { redirectTo: `http://127.0.0.1:${port}/auth/callback/${state}`, scopes: 'read:user user:email', skipBrowserRedirect: true },
    })
    if (error || !data.url) throw new Error('Could not start GitHub collector sign-in')
    await options.onUrl(data.url)
    await completed
  } finally {
    clearTimeout(timer)
    server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    memory.clear()
  }
}
