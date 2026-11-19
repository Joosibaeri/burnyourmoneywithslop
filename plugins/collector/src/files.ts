import { lstat, mkdir, open, readFile, realpath, rename, unlink } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'

export async function existingText(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8') }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
}

// Preserve symlinks and make private backups before changing an existing file.
export async function writeConfig(path: string, content: string, expected?: string | null): Promise<string | null> {
  const info = await lstat(path).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return null; throw error })
  const destination = info?.isSymbolicLink() ? await realpath(path) : path
  const previous = await existingText(destination)
  if (expected !== undefined && previous !== expected) throw new Error('Configuration changed during installation; it was not overwritten. Retry the command.')
  if (previous === content) return null
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 })
  let backup: string | null = null
  if (previous !== null) {
    backup = `${destination}.bym-backup-${randomUUID()}`
    const file = await open(backup, 'wx', 0o600)
    try { await file.writeFile(previous); await file.sync() } finally { await file.close() }
  }
  const temporary = `${destination}.${randomUUID()}.tmp`
  const file = await open(temporary, 'wx', 0o600)
  try {
    try { await file.writeFile(content); await file.sync() } finally { await file.close() }
    if (await existingText(destination) !== previous) throw new Error('Configuration changed during installation; it was not overwritten. Retry the command.')
    await rename(temporary, destination)
  } finally { await unlink(temporary).catch(() => {}) }
  return backup
}
