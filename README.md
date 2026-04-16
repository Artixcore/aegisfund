# Aegis Fund — Institutional Intelligence Terminal

> A premium, full-stack crypto portfolio and financial intelligence web application built with React 19, tRPC, Drizzle ORM, and a sleek dark UI design system.

![Aegis Fund Dashboard](https://img.shields.io/badge/status-production--ready-brightgreen) ![Tests](https://img.shields.io/badge/tests-35%20passing-brightgreen) ![TypeScript](https://img.shields.io/badge/TypeScript-strict-blue) ![License](https://img.shields.io/badge/license-MIT-lightgrey)

---

## Overview

Aegis Fund is a production-grade crypto portfolio management and financial intelligence terminal. It combines real-time blockchain data, LLM-powered AI agents, end-to-end encrypted messaging, and a full KYC compliance workflow into a single, cohesive dark-themed interface.

The application is designed for institutional and sophisticated retail investors who require a unified view of their multi-chain holdings, automated market intelligence, and compliance-grade identity verification — secured behind signed session cookies and role-based access control.

---

## Feature Set

### Authentication & Onboarding
- **Session auth** — `GET /api/auth/dev-login` (when enabled) issues a signed HTTP-only cookie; `protectedProcedure` guards API routes. Use `OWNER_OPEN_ID` to grant admin for a chosen `openId`.
- **KYC / Identity Verification** — A 5-step onboarding flow covering tier selection (Basic / Standard / Premium / Institutional), personal information, document upload (front + back), selfie liveness check, and final review submission. Documents and selfies are uploaded directly to S3 via `storagePut` and stored as CDN URLs in the database.
- **MFA Setup** — TOTP-based multi-factor authentication with backup code generation, wired to the `mfaSettings` table.
- **Session Management** — Active session listing and individual session revocation from the Settings panel.

### Dashboard
- **Portfolio Summary Cards** — Total portfolio value, 24-hour P&L (absolute and percentage), and per-chain balance breakdown (BTC / ETH / SOL).
- **Portfolio Equity Curve** — A 30-day area chart (7D / 14D / 30D / 90D range selector) powered by hourly portfolio snapshots recorded by the background scheduler.
- **Asset Allocation Chart** — Recharts donut chart showing percentage allocation across chains.
- **Live Price Tickers** — Real-time BTC, ETH, and SOL prices fetched from the built-in Data API (Yahoo Finance), with 24-hour change percentages and 7-day sparkline charts.
- **Agent Activity Strip** — Live count of running, complete, and idle AI agents.
- **Recent Activity Feed** — Timestamped transaction log.

### Multi-Chain Wallet Management
- **BTC** — Live on-chain balance via [Blockstream.info](https://blockstream.info) (no API key required).
- **ETH** — Live on-chain balance via [Etherscan v2 API](https://docs.etherscan.io).
- **SOL** — Live on-chain balance via Solana mainnet JSON-RPC (`getBalance`).
- **Multi-Wallet per Chain** — Add multiple addresses per chain with custom labels; delete non-default wallets; aggregate balances across all addresses.
- **Price Alerts** — Create above/below threshold alerts per asset; background monitor checks every 5 minutes and fires a push notification when triggered.
- **Triggered Alert History** — Timestamped log of every alert that fired, with price-at-trigger and a one-click Re-arm button.
- **Transaction History** — Per-wallet transaction table with mock data (ready for real blockchain API integration).

### AI Agents Panel
Five parallel LLM-powered intelligence agents, each with its own status indicator (Idle / Running / Analyzing / Complete), task description, and structured JSON output rendered as a formatted analysis card:

| Agent | Focus |
|---|---|
| Market Analysis | Macro market conditions, trend identification |
| Crypto Monitoring | On-chain metrics, DeFi flows, sentiment |
| Forex Monitoring | USD/EUR/GBP cross rates, macro drivers |
| Futures & Commodities | Futures curve, oil, gold, commodity signals |
| Historical Research | Pattern recognition, backtested insights |

- **Run Agent** — Triggers a real LLM call via `invokeLLM` (routes through `LLMManager`: default provider, optional per-agent routing, and fallbacks) with structured JSON schema output.
- **Run All Agents** — Fires all five agents in parallel.
- **Agent Scheduling** — Configure per-agent auto-run intervals (1h to 7d); the background scheduler polls every 60 seconds and auto-runs due agents.
- **History Panel** — Last 10 runs per agent with timestamps and output summaries.

### End-to-End Encrypted Messaging
- Conversation list with online indicators and last-message preview.
- Message thread view with sender avatars, timestamps, and per-message encryption badges.
- Compose interface with Enter-to-send and visible "Secure Channel Active" encryption indicator.
- Conversations and messages are persisted in the database via tRPC procedures.

### Settings
- **Profile** — Name, email, and role display.
- **Security** — MFA setup / disable, active session list with revoke, backup codes.
- **Notifications** — Toggle switches for price alerts, agent updates, and message notifications.
- **Connected Wallets** — Wallet address configuration per chain.
- **Display** — Theme, language, and data refresh interval preferences.
- **Agent Preferences** — Default run mode and output verbosity.

### Admin Panel (`/admin/kyc`)
- Lists all KYC submissions (all / pending filter).
- Per-submission detail expansion: personal info, document images (front, back, selfie), rejection reason.
- **Approve** — One-click approval with `notifyOwner` alert.
- **Reject** — Reject with mandatory reason field and `notifyOwner` alert.
- Role-gated: only users with `role = 'admin'` can access this route and see the Admin sidebar section.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser Client                        │
│  React 19 · Tailwind 4 · tRPC React Query · Recharts        │
│  Wouter routing · Radix UI · shadcn/ui · Framer Motion      │
└───────────────────────┬─────────────────────────────────────┘
                        │ tRPC (HTTP + JSON)
┌───────────────────────▼─────────────────────────────────────┐
│                      Express Server                          │
│  tRPC router · JWT session cookies · dev login route         │
│  Background services: PriceMonitor · AgentScheduler         │
│                       PortfolioSnapshotScheduler             │
└──────┬──────────────────────┬──────────────────────┬────────┘
       │                      │                      │
┌──────▼──────┐   ┌───────────▼──────────┐  ┌───────▼───────┐
│  MySQL/TiDB │   │   External APIs      │  │  AWS S3       │
│  Drizzle ORM│   │  Blockstream (BTC)   │  │  KYC docs     │
│  10 tables  │   │  Etherscan (ETH)     │  │  Selfies      │
└─────────────┘   │  Solana RPC (SOL)    │  └───────────────┘
                  │  Yahoo Finance (Px)  │
                  │  OpenAI-compatible LLM │
                  └──────────────────────┘
```

### Database Schema

| Table | Purpose |
|---|---|
| `users` | OAuth identity, role (user / admin) |
| `wallets` | Per-chain wallet addresses and labels |
| `conversations` | Message thread metadata |
| `messages` | Individual encrypted messages |
| `agent_runs` | LLM agent execution history |
| `agent_schedules` | Per-agent auto-run configuration |
| `portfolio_snapshots` | Hourly total value snapshots |
| `price_alerts` | User-defined price threshold alerts |
| `alert_history` | Log of triggered alerts |
| `kyc_profiles` | KYC submission data and status |
| `mfa_settings` | TOTP secrets and backup codes |
| `user_sessions` | Active session tracking |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 19 + TypeScript |
| Styling | Tailwind CSS 4 + shadcn/ui + Radix UI |
| Charts | Recharts |
| Routing | Wouter |
| API layer | tRPC 11 + Zod validation |
| Server | Express 4 + Node.js |
| ORM | Drizzle ORM |
| Database | MySQL / TiDB |
| Auth | JWT session cookie (`JWT_SECRET`, optional `/api/auth/dev-login`) |
| File storage | AWS S3 (via `storagePut` helper) |
| LLM | Multi-provider `server/llm` layer: OpenAI, Gemini (OpenAI-compat), Grok, DeepSeek, plus legacy `LLM_BASE_URL` / `LLM_API_KEY` |
| Price data | Data gateway (`AEGIS_DATA_API_URL` + key), Yahoo chart route |
| BTC balances | Blockstream.info (free, no key) |
| ETH balances | Etherscan v2 API |
| SOL balances | Solana mainnet JSON-RPC |
| Testing | Vitest |
| Build | Vite 7 + esbuild |
| Package manager | npm (`package-lock.json`) |

`.npmrc` sets `legacy-peer-deps=true` so npm can install alongside **Vite 7** while **@builder.io/vite-plugin-jsx-loc** still declares peer `vite@^4 || ^5`. Remove or adjust that plugin if you want strict peer resolution.

---

## Project Structure

```
aegis-fund/
├── client/
│   ├── index.html                  # Google Fonts (Inter + JetBrains Mono)
│   └── src/
│       ├── components/
│       │   ├── AegisLayout.tsx     # Persistent sidebar + auth guard
│       │   ├── SparklineChart.tsx  # Reusable Recharts sparkline
│       │   └── ui/                 # shadcn/ui component library
│       ├── pages/
│       │   ├── Home.tsx            # Landing / login redirect
│       │   ├── Dashboard.tsx       # Portfolio overview + equity curve
│       │   ├── Wallets.tsx         # Multi-chain wallets + alerts
│       │   ├── Agents.tsx          # AI agents + scheduling + history
│       │   ├── Messages.tsx        # E2E encrypted messaging
│       │   ├── SettingsPage.tsx    # Profile, security, notifications
│       │   ├── KYC.tsx             # 5-step identity verification
│       │   └── AdminKYC.tsx        # Admin KYC review panel
│       ├── index.css               # Premium dark design system
│       └── App.tsx                 # Route definitions
├── server/
│   ├── llm/                        # Multi-provider LLM manager (OpenAI-compat transport)
│   ├── routers.ts                  # All tRPC procedures + background services
│   ├── db.ts                       # Drizzle query helpers
│   ├── blockchain.ts               # BTC / ETH / SOL balance fetchers
│   ├── storage.ts                  # S3 upload/download helpers
│   ├── auth.logout.test.ts         # Auth tests
│   ├── aegis.test.ts               # Core feature tests
│   ├── enhancements.test.ts        # Enhancement feature tests
│   ├── admin.kyc.test.ts           # Admin KYC procedure tests
│   └── _core/                      # Framework internals (OAuth, LLM, etc.)
├── drizzle/
│   ├── schema.ts                   # Full database schema
│   └── *.sql                       # Migration files
├── shared/
│   └── const.ts                    # Shared constants
└── todo.md                         # Full feature checklist
```

---

## Local Development

### Prerequisites

- Node.js 22+
- npm 10+
- A MySQL / TiDB database
- API keys for your LLM and data gateway (see `.env.example`)
- Etherscan API key (for ETH on-chain balances)

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
# Database
DATABASE_URL=mysql://user:password@host:3306/aegis_fund

# Auth
JWT_SECRET=your-jwt-secret
JWT_ISSUER=aegis-fund
AUTH_DEV_LOGIN=true

# Data + LLM (see .env.example for multi-provider keys and LLM_DEFAULT_PROVIDER)
AEGIS_DATA_API_URL=
AEGIS_DATA_API_KEY=
LLM_BASE_URL=https://api.openai.com
LLM_API_KEY=

# Owner identity (admin role)
OWNER_OPEN_ID=dev-local-user
OWNER_NAME=Your Name

# External APIs
ETHERSCAN_API_KEY=your-etherscan-api-key

# Production: AES-256-GCM for KYC / MFA / user name+email at rest (see .env.example)
DATABASE_FIELD_ENCRYPTION_KEY=

# Production: require ciphertextEnvelope on relay sendMessage (optional override)
MESSAGES_REQUIRE_CIPHERTEXT=
```

### Production data protection

- **Database encryption at rest**: enable storage encryption on your MySQL host (for example [Amazon RDS encryption](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Overview.Encryption.html) or your cloud provider’s equivalent) and prefer TLS for client connections.
- **Application field encryption**: set `DATABASE_FIELD_ENCRYPTION_KEY` to a 32-byte secret (64 hex characters or a 44-character base64 string). The server encrypts sensitive KYC columns, MFA material, and `users.name` / `users.email` at rest. In `NODE_ENV=production`, persisting those fields requires this key.
- **Relay messages**: in production, `messages.sendMessage` requires a client `ciphertextEnvelope` (set `MESSAGES_REQUIRE_CIPHERTEXT=false` only if you intentionally allow plaintext relay bodies).

Always run all SQL migrations (`npx drizzle-kit migrate` or your deployment migration command) before serving traffic so every table in [`drizzle/schema.ts`](drizzle/schema.ts) exists.

### Install & Run

```bash
# Install dependencies
npm install

# Apply database migrations
npx drizzle-kit generate
npx drizzle-kit migrate

# Start development server (frontend + backend on :3000)
npm run dev

# Run tests
npm test

# Type check
npm run check

# Production build
npm run build
npm start
```

---

## Background Services

Three background services start automatically when the server boots:

**Price Monitor** — Polls BTC, ETH, and SOL prices every 5 minutes. Compares current prices against all active user price alerts and fires `notifyOwner` when a threshold is crossed, marking the alert as triggered.

**Agent Scheduler** — Polls the `agent_schedules` table every 60 seconds. For any schedule where `nextRunAt <= now` and `isActive = true`, it fires the corresponding LLM agent, stores the result in `agent_runs`, and updates `lastRunAt` / `nextRunAt`.

**Portfolio Snapshot Scheduler** — Runs every hour. For each user with at least one configured wallet, it fetches live on-chain balances × live prices and inserts a row into `portfolio_snapshots`. This powers the Dashboard equity curve chart.

---

## KYC Compliance Flow

```
User                    Server                      Admin
 │                         │                           │
 ├─ Select tier ──────────►│ Save to kycProfiles       │
 ├─ Enter personal info ──►│ Update kycProfiles        │
 ├─ Upload documents ─────►│ storagePut → S3 URL       │
 ├─ Upload selfie ────────►│ storagePut → S3 URL       │
 ├─ Submit for review ────►│ status = under_review     │
 │                         │ notifyOwner("New KYC")   ►│
 │                         │                           ├─ Review at /admin/kyc
 │                         │◄── approve / reject ──────┤
 │◄── status update ───────│ notifyOwner("Reviewed")  ►│
```

---

## Admin Access

To promote a user to admin, update the `role` field directly in the database:

```sql
UPDATE users SET role = 'admin' WHERE openId = 'your-open-id';
```

Once promoted, the **Admin** section appears in the sidebar, providing access to the KYC Review panel at `/admin/kyc`.

---

## Testing

The test suite covers 35 cases across 4 test files:

```bash
npm test
```

| File | Tests | Coverage |
|---|---|---|
| `auth.logout.test.ts` | 1 | Session cookie clearing |
| `aegis.test.ts` | 10 | Prices, portfolio, agents, messages, wallets |
| `enhancements.test.ts` | 16 | Alerts, blockchain balances, scheduling |
| `admin.kyc.test.ts` | 8 | Admin authorization, KYC approve/reject |

---

## Deployment

Build with `npm run build`, run `node dist/index.js` (or `npm start`), and set all variables from `.env.example` on your host (MySQL, `JWT_SECRET`, LLM/data URLs, optional `NOTIFICATION_WEBHOOK_URL`, chain RPC overrides, etc.).

Disable dev login in production unless intentional: `AUTH_DEV_LOGIN=false`.

---

## Design System

The application uses a custom premium dark design system defined in `client/src/index.css`:

- **Backgrounds** — `oklch(0.08 0.005 240)` (near-black) with `oklch(0.11 0.008 240)` (charcoal) for cards.
- **Text** — `oklch(0.97 0.005 240)` (near-white) foreground with `oklch(0.55 0.01 240)` muted text.
- **Accent colors** — Aegis Green `oklch(0.72 0.17 145)`, Aegis Gold `oklch(0.78 0.15 85)`, Aegis Red `oklch(0.65 0.20 25)`.
- **Typography** — Inter for UI text, JetBrains Mono for data labels, addresses, and status indicators.
- **Animations** — `fade-up`, `shimmer`, `pulse-glow`, `slide-in` keyframes for micro-interactions.

---

## License

MIT © Aegis Fund
