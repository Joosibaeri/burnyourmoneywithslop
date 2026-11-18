import { chmod, mkdir, open, readFile, rename, stat, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { validateConfig, type CollectorConfig } from './config'

export interface Credentials extends CollectorConfig {
  accessToken: string
  refreshToken: string
  expiresAt: number
  userId: string
}

export async function privateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') await chmod(directory, 0o700)
}

export async function writePrivateJson(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    try { await file.writeFile(JSON.stringify(value)); await file.sync() }
    finally { await file.close() }
    await rename(temporary, path)
  } finally { await unlink(temporary).catch(() => {}) }
}

// All collectors on a machine share refresh credentials. Serialize rotation and queue writes.
export async function withLock<T>(directory: string, action: () => Promise<T>): Promise<T> {
  await privateDirectory(directory)
  const path = join(directory, 'collector.lock')
  const deadline = Date.now() + 15_000
  const token = `${process.pid}:${randomUUID()}`
  for (;;) {
    try {
      const file = await open(path, 'wx', 0o600)
      try { await file.writeFile(token) } finally { await file.close() }
      break
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      const owner = await readFile(path, 'utf8').catch(() => '')
      const pid = Number(owner.split(':')[0])
      if (Number.isSafeInteger(pid) && pid > 0) {
        try { process.kill(pid, 0) } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ESRCH') await unlink(path).catch(() => {})
        }
      } else if (owner === '' && Date.now() - (await stat(path).catch(() => ({ mtimeMs: Date.now() }))).mtimeMs > 30_000) {
        // A process can die between exclusive creation and writing its owner.
        await unlink(path).catch(() => {})
      }
      if (Date.now() >= deadline) throw new Error('Another collector is busy; retry shortly')
      await delay(25)
    }
  }
  try { return await action() } finally {
    if (await readFile(path, 'utf8').catch(() => '') === token) await unlink(path).catch(() => {})
  }
}

export async function readCredentials(directory: string): Promise<Credentials> {
  let credentials: Credentials
  try { credentials = JSON.parse(await readFile(join(directory, 'credentials.json'), 'utf8')) as Credentials }
  catch { throw new Error('Collector is not signed in. Run: npm run collector -- login') }
  validateConfig(credentials)
  if (!credentials.accessToken || !credentials.refreshToken || !credentials.userId || !Number.isFinite(credentials.expiresAt)) throw new Error('Invalid collector credentials. Sign in again.')
  return credentials
}

export async function saveCredentials(directory: string, credentials: Credentials): Promise<void> {
  validateConfig(credentials)
  await privateDirectory(directory)
  await writePrivateJson(join(directory, 'credentials.json'), credentials)
}
