import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { copyFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { validateConfig } from './plugins/shared/config.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!!url !== !!key) throw new Error('Configure both VITE_SUPABASE_URL and a publishable Supabase key')
  const collectorConfig = url && key ? validateConfig({ supabaseUrl: url, publishableKey: key }) : null
  return {
    plugins: [react(), {
      name: 'public-collector-configuration',
      apply: 'build',
      generateBundle() {
        if (collectorConfig) this.emitFile({ type: 'asset', fileName: 'collector-config.json', source: JSON.stringify(collectorConfig) })
      },
    }, {
      name: 'github-pages-static-routes',
      apply: 'build',
      async closeBundle() {
        const out = fileURLToPath(new URL('./dist/', import.meta.url))
        await mkdir(`${out}auth/callback`, { recursive: true })
        await mkdir(`${out}ranking`, { recursive: true })
        await Promise.all([
          copyFile(`${out}index.html`, `${out}404.html`),
          copyFile(`${out}index.html`, `${out}auth/callback/index.html`),
          copyFile(`${out}index.html`, `${out}ranking/index.html`),
        ])
      },
    }],
    base: '/',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    build: {
      outDir: 'dist',
      sourcemap: true,
    },
    server: {
      port: 5173,
      open: true,
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.tsx'],
      include: ['src/**/*.test.{ts,tsx}', 'plugins/**/*.test.ts'],
    },
  }
})
