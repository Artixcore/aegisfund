# Aegis Fund — Project TODO

## Phase 1: Design System & Scaffolding
- [x] Set up premium dark design system in index.css (black/charcoal backgrounds, white/gray text, monospace accents)
- [x] Add Inter + JetBrains Mono fonts via Google Fonts CDN
- [x] Configure Tailwind CSS variables for dark theme
- [x] Update App.tsx with routes for all sections and dark ThemeProvider

## Phase 2: Database Schema & Server Infrastructure
- [x] Add wallets table to drizzle/schema.ts
- [x] Add messages/conversations tables to drizzle/schema.ts
- [x] Add agent_runs table to drizzle/schema.ts
- [x] Add portfolio_snapshots table to drizzle/schema.ts
- [x] Run migration and apply SQL
- [x] Add DB query helpers in server/db.ts
- [x] Add tRPC routers: wallet, messages, agents, portfolio, prices

## Phase 3: Auth & Navigation
- [x] Build persistent sidebar with Dashboard, Wallets, AI Agents, Messages, Settings icons
- [x] Implement AegisLayout component wrapping all authenticated pages
- [x] Wire session login/logout flow (dev-login + JWT cookie)
- [x] Add protected route guard for authenticated sections
- [x] Build login/landing page

## Phase 4: Dashboard
- [x] Portfolio summary cards (total value, 24h P&L, BTC/ETH/SOL balances)
- [x] Asset allocation donut chart (Recharts)
- [x] Live price tickers for BTC, ETH, SOL via Data API (YahooFinance/get_stock_chart)
- [x] 24h change percentages with color indicators
- [x] Sparkline charts for each asset (7-day)
- [x] Recent activity feed (mock transactions)
- [x] Agent activity summary strip

## Phase 5: Wallets
- [x] BTC wallet card with address, balance, QR placeholder, copy button
- [x] ETH wallet card with address, balance, QR placeholder, copy button
- [x] SOL wallet card with address, balance, QR placeholder, copy button
- [x] Live price ticker + 24h change per wallet using Data API
- [x] Sparkline chart per wallet (7-day)
- [x] Transaction history table per wallet (mock data)
- [x] Send/Receive placeholder modals

## Phase 6: AI Agents
- [x] Market Analysis Agent card with status, task, and LLM output
- [x] Crypto Monitoring Agent card with status, task, and LLM output
- [x] Forex Monitoring Agent card with status, task, and LLM output
- [x] Futures/Commodities Agent card with status, task, and LLM output
- [x] Historical Research Agent card with status, task, and LLM output
- [x] Agent status badges: Running, Idle, Complete, Alert
- [x] Run agent tRPC mutation triggering real LLM calls
- [x] Structured output rendering (portfolio risk, market summary, insights)
- [x] Central command overview panel

## Phase 7: Messages
- [x] Conversation list sidebar with contact avatars and last message preview
- [x] Message thread view with timestamp and sender info
- [x] Compose interface with send button
- [x] E2E encryption status indicator ("Secure Channel Active")
- [x] Encryption badge on each message
- [x] Mock conversation data

## Phase 8: Settings
- [x] Profile section (username, email, avatar placeholder)
- [x] Security section (change password placeholder, session management)
- [x] Notification toggles (price alerts, agent updates, messages)
- [x] Connected wallets configuration
- [x] Theme/display preferences

## Phase 9: Polish & Delivery
- [x] Micro-animations and hover states throughout
- [x] Loading skeletons for async data
- [x] Error boundary and empty states
- [x] Vitest unit tests for key routers (11 tests passing)
- [x] Final checkpoint and delivery

## Enhancement 1: Real On-Chain Wallet Balances
- [x] Add walletAddresses table (userId, chain, address, label, isTracked)
- [x] Migration for walletAddresses table
- [x] Blockchain balance router: fetch BTC balance via Blockstream (free, no key)
- [x] Blockchain balance router: fetch ETH balance via Etherscan v2 API
- [x] Blockchain balance router: fetch SOL balance via Solana mainnet JSON-RPC
- [x] Update Wallets page to show live on-chain balances
- [x] Add wallet address input in Wallets page (Edit Address modal)
- [x] Show loading/error states for on-chain fetch

## Enhancement 2: Price Alerts & Notifications
- [x] Add priceAlerts table (userId, symbol, condition, threshold, isActive, triggeredAt)
- [x] Migration for priceAlerts table
- [x] Price alert router: create/list/delete/toggle alerts
- [x] Background price monitor: check alerts every 5 min, fire notifyOwner on trigger
- [x] Price Alerts UI in Wallets page (create alert, list active alerts)
- [x] Toast notification when alert is created/triggered

## Enhancement 3: Agent Auto-Scheduling
- [x] Add agentSchedules table (userId, agentType, intervalHours, isActive, lastRunAt, nextRunAt)
- [x] Migration for agentSchedules table
- [x] Agent schedule router: create/update/list/toggle schedules
- [x] Background scheduler: check due agents every minute, auto-run via LLM
- [x] Agent history view: list past runs with timestamps and outputs
- [x] Schedule configuration UI in AI Agents page (set interval, toggle on/off)
- [x] Historical comparison: show last N runs per agent type

## Sprint 2: KYC, Login/Onboarding, P&L History, Multi-Wallet, Alert History

- [x] Schema: kycProfiles, mfaSettings, userSessions, alertHistory tables
- [x] Sprint 2 migration applied
- [x] KYC tRPC router: getStatus, savePersonalInfo, saveDocumentInfo, saveSelfie, submitForReview
- [x] MFA tRPC router: getSettings, setup, verify, disable
- [x] Sessions tRPC router: list, revoke
- [x] alertHistory tRPC router: getHistory, rearm
- [x] portfolio.getHistory procedure (7/14/30/90d equity curve data)
- [x] wallet.addWallet procedure (multi-wallet per chain with label)
- [x] wallet.deleteWallet procedure
- [x] KYC.tsx: 5-step onboarding (tier selection, personal info, document, selfie, review)
- [x] KYC status display (approved / under_review / rejected)
- [x] Dashboard.tsx: 30-day equity curve AreaChart with range selector (7D/14D/30D/90D)
- [x] Dashboard.tsx: P&L delta from history (absolute + percentage)
- [x] Wallets.tsx: Multi-wallet breakdown section per chain with labels
- [x] Wallets.tsx: Add Wallet modal (address + optional label)
- [x] Wallets.tsx: Delete non-default wallet
- [x] Wallets.tsx: Alert History tab (triggered log with price-at-trigger + timestamp)
- [x] Wallets.tsx: Re-arm button on alert history entries
- [x] Settings.tsx: MFA setup (TOTP + backup codes)
- [x] Settings.tsx: Active sessions list with revoke
- [x] AegisLayout.tsx: KYC/Identity link in Compliance sidebar section
- [x] App.tsx: /kyc route added
- [x] 27 vitest tests passing
- [x] 0 TypeScript errors

## Sprint 3: Real Snapshots, S3 KYC Uploads, Admin Panel

- [x] Background scheduler: hourly portfolio snapshot (on-chain balance × live price)
- [x] server/storage.ts: verify storagePut helper is available
- [x] tRPC kyc.uploadDocument procedure (server-side S3 upload via multipart)
- [x] tRPC kyc.uploadSelfie procedure (server-side S3 upload)
- [x] Update kycProfiles schema: documentUrl, selfieUrl columns
- [x] KYC.tsx: real file input → POST to /api/kyc/upload → store S3 URL
- [x] Admin KYC router: listPending, approve, reject (adminProcedure)
- [x] notifyOwner on new KYC submission
- [x] Admin KYC page (/admin/kyc): pending submissions table with approve/reject
- [x] AegisLayout: Admin section in sidebar (admin role only)
- [x] App.tsx: /admin/kyc route
- [x] Vitest: admin KYC procedure tests
- [x] 0 TypeScript errors
- [x] Checkpoint saved
