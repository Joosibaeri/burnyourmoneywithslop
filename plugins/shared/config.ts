import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

export const SITE_URL = 'https://howmuchmoneydidyoualreadyburnedwithslop.joosibaeri.xyz'
export const LOGIN_PORT = 48173

export interface CollectorConfig {
  supabaseUrl: string
  publishableKey: string
}

export function configDirectory(): string {
  const override = process.env.BYM_CONFIG_DIR
  if (override && !isAbsolute(override)) throw new Error('BYM_CONFIG_DIR must be an absolute path')
  const xdg = process.env.XDG_CONFIG_HOME
  return override || join(xdg && isAbsolute(xdg) ? xdg : join(homedir(), '.config'), 'burnyourmoneywithslop')
}

export function validateConfig(config: CollectorConfig): CollectorConfig {
  const url = new URL(config.supabaseUrl)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('Use the Supabase project origin, not a path or credential-bearing URL')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) throw new Error('Supabase must use HTTPS (HTTP is allowed only for local testing)')
  let publicKey = config.publishableKey.startsWith('sb_publishable_')
  if (!publicKey) {
    try { publicKey = JSON.parse(Buffer.from(config.publishableKey.split('.')[1], 'base64url').toString()).role === 'anon' } catch { /* invalid key */ }
  }
  if (!publicKey) throw new Error('Use a publishable or legacy anon key, never a secret/service-role key')
  return { supabaseUrl: url.origin, publishableKey: config.publishableKey }
}

export async function discoverConfig(siteUrl = SITE_URL): Promise<CollectorConfig> {
  const site = new URL(siteUrl)
  if (site.protocol !== 'https:') throw new Error('Collector configuration must be fetched over HTTPS')
  const response = await fetch(new URL('/collector-config.json', site), { signal: AbortSignal.timeout(10_000), redirect: 'error' })
  if (!response.ok) throw new Error('Hosted collector configuration is unavailable. Check HTTPS/deployment or supply --url and --key.')
  return validateConfig(await response.json() as CollectorConfig)
}
