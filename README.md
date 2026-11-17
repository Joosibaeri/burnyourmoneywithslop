# Burn Your Money With Slop

> Compare AI coding usage with friends: tokens, actual spending, and private groups. Plugins for Codex, Claude Code, Cursor, and OpenCode.

[![Deploy to GitHub Pages](https://github.com/Joosibaeri/burnyourmoneywithslop/actions/workflows/deploy.yml/badge.svg)](https://github.com/Joosibaeri/burnyourmoneywithslop/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Live Demo

**https://burnyourmoneywithslop.joosibaeri.xyz** (configured via GitHub Pages + custom domain)

---

## Features

- **Real Subscription Costs**: Track actual monthly spending on AI subscriptions (Claude Pro, Cursor, ChatGPT Plus, etc.)
- **Token Usage**: Monitor input/output/reasoning/cache tokens across all tools
- **Private Groups**: Create invite-only groups to compare usage with friends
- **Multi-Tool Support**: Plugins for OpenCode, Claude Code, Cursor, and Codex
- **Privacy-First**: Only token totals sent — never prompts, code, or transcripts
- **Supabase Backend**: Real-time sync, auth, and PostgreSQL with RLS
- **GitHub Pages Hosting**: Free static hosting with custom domain support

---

## Quick Start (Demo Mode)

No setup required to explore the UI:

```bash
git clone https://github.com/Joosibaeri/burnyourmoneywithslop
cd burnyourmoneywithslop
npm install
npm run dev
```

Open http://localhost:5173 — works immediately with mock data.

---

## Production Setup

### 1. Supabase Backend

Follow the complete guide: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)

Quick steps:
1. Create Supabase project
2. Enable GitHub OAuth provider
3. Run migrations: `supabase db push --remote --yes`
4. Deploy Edge Function: `supabase functions deploy ingest-usage --remote --yes`
5. Add credentials to GitHub repo secrets (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`)

### 2. Custom Domain

Configure `burnyourmoneywithslop.joosibaeri.xyz`: [docs/CUSTOM_DOMAIN.md](docs/CUSTOM_DOMAIN.md)

### 3. Install Plugins

Track real usage from your AI tools: [docs/PLUGIN_INSTALL.md](docs/PLUGIN_INSTALL.md)

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   AI Tools      │     │  Burn Your Money │     │    Supabase     │
│                 │     │  With Slop       │     │                 │
│  • OpenCode     │────▶│  (React + Vite)  │────▶│  • PostgreSQL   │
│  • Claude Code  │     │  • Dashboard     │     │  • Auth (GitHub)│
│  • Cursor       │     │  • Groups        │     │  • Edge Functions│
│  • Codex        │     │  • Subscriptions │     │  • Storage      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                              ▲
                              │ GitHub Pages
                              ▼
                    ┌──────────────────┐
                    │  Custom Domain   │
                    │  burnyourmoney-  │
                    │  withslop.joos-  │
                    │  ibaeri.xyz      │
                    └──────────────────┘
```

---

## Plugin Data Flow

Each plugin captures usage locally and sends only aggregated metrics:

| Tool | Hook/Event | Data Sent |
|------|------------|-----------|
| OpenCode | `session.usage.updated`, `session.step.ended` | Tokens, cost, model, session ID |
| Claude Code | `Stop`, `SessionEnd` (via transcript) | Tokens, cost, model, conversation ID |
| Cursor | `sessionEnd` (via transcript) | Tokens, cost, model, conversation ID |
| Codex | `PostModelRequest`, `SessionEnd` | Tokens, cost, model, session ID |

**Never sent:** Prompts, code, file contents, transcripts, or any user data.

---

## Subscription Cost Model

- **Real costs**: Monthly subscription fees (Claude Pro $20, Cursor Premium $30, etc.)
- **Shared subscriptions**: One ChatGPT Plus used via Codex + OpenCode = counted once/month
- **Custom prices**: Override catalog prices for taxes, discounts, or actual invoices
- **Model estimates**: Separate from real spending, shown as "Estimated" in charts

---

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite 6, Recharts
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions, Storage)
- **Hosting**: GitHub Pages with custom domain
- **Plugins**: Native integrations for each AI tool
- **CI/CD**: GitHub Actions

---

## Project Structure

```
burnyourmoneywithslop/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── contexts/           # React contexts (Auth, Supabase)
│   ├── lib/                # Utilities, mock data
│   └── pages/              # Page components
├── supabase/
│   ├── migrations/         # Database schema
│   ├── functions/          # Edge Functions
│   └── config.toml         # Supabase CLI config
├── plugins/
│   ├── opencode/           # OpenCode server plugin
│   ├── claude-code/        # Claude Code hook plugin
│   ├── cursor/             # Cursor hook plugin
│   └── codex/              # Codex hook plugin
├── docs/                   # Setup guides
├── .github/workflows/      # CI/CD
└── public/                 # Static assets (CNAME, favicon)
```

---

## Development

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Run tests
npm test

# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build for production
npm run build

# Preview production build
npm run preview
```

---

## Deployment

Push to `master` branch triggers GitHub Actions workflow:
1. Builds React app with Vite
2. Deploys to `gh-pages` branch
3. GitHub Pages serves from `gh-pages` branch
4. Custom domain `burnyourmoneywithslop.joosibaeri.xyz` resolves via CNAME

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

---

## License

MIT License - see [LICENSE](LICENSE) for details.

---

## Links

- **Live Site**: https://burnyourmoneywithslop.joosibaeri.xyz
- **Repository**: https://github.com/Joosibaeri/burnyourmoneywithslop
- **Supabase Setup**: [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)
- **Custom Domain**: [docs/CUSTOM_DOMAIN.md](docs/CUSTOM_DOMAIN.md)
- **Plugin Install**: [docs/PLUGIN_INSTALL.md](docs/PLUGIN_INSTALL.md) 
