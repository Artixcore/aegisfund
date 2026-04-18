import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import SparklineChart from "@/components/SparklineChart";
import { parseGrounding } from "@shared/agentGrounding";
import {
  ArrowDownRight,
  ArrowUpRight,
  Activity,
  AlertTriangle,
  BarChart3,
  BookMarked,
  Bot,
  RefreshCw,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useState } from "react";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function formatUsdCompact(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return formatUsd(n);
}
function formatPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function PriceCard({
  symbol, name, price, changePct, sparkline,
}: {
  symbol: string; name: string; price: number; changePct: number; sparkline: number[];
}) {
  const up = changePct >= 0;
  return (
    <div className="aegis-card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="mono-label">{symbol}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{name}</div>
        </div>
        <div className={`flex items-center gap-1 text-xs font-mono font-medium ${up ? "text-aegis-green" : "text-aegis-red"}`}>
          {up ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          {formatPct(changePct)}
        </div>
      </div>
      <div className="text-xl font-semibold tabular-nums">
        {price > 0 ? formatUsd(price) : <span className="shimmer rounded h-6 w-28 block" />}
      </div>
      <SparklineChart data={sparkline} positive={up} height={36} />
    </div>
  );
}

const ALLOCATION_COLORS = [
  "oklch(0.93 0 0)",
  "oklch(0.55 0 0)",
  "oklch(0.35 0 0)",
];

const AGENT_TYPES = [
  "market_analysis",
  "crypto_monitoring",
  "forex_monitoring",
  "futures_commodities",
  "historical_research",
  "portfolio_trading",
  "executive_briefing",
] as const;

const RANGE_OPTIONS = [
  { label: "7D", days: 7 },
  { label: "14D", days: 14 },
  { label: "30D", days: 30 },
  { label: "90D", days: 90 },
];

const tooltipStyle = {
  background: "oklch(0.11 0 0)",
  border: "1px solid oklch(0.20 0 0)",
  borderRadius: "6px",
  fontSize: "11px",
  fontFamily: "var(--font-mono)",
  color: "oklch(0.93 0 0)",
};

export default function Dashboard() {
  const { user } = useAuth();
  const [historyDays, setHistoryDays] = useState(30);

  const { data: prices, isLoading: pricesLoading, refetch: refetchPrices } = trpc.prices.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: portfolio, isLoading: portfolioLoading } = trpc.portfolio.getSummary.useQuery();
  const { data: agentStatuses } = trpc.agents.getAgentStatuses.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: historyData, isLoading: historyLoading } = trpc.portfolio.getHistory.useQuery({ days: historyDays });

  const btc = prices?.BTC;
  const eth = prices?.ETH;
  const sol = prices?.SOL;

  const agentRunByType = new Map(agentStatuses?.map((a) => [a.agentType, a]) ?? []);
  let runningAgentTypes = 0;
  let completeAgentTypes = 0;
  let otherAgentTypes = 0;
  for (const t of AGENT_TYPES) {
    const st = agentRunByType.get(t)?.status;
    if (st === "running" || st === "analyzing") runningAgentTypes += 1;
    else if (st === "complete") completeAgentTypes += 1;
    else otherAgentTypes += 1;
  }

  let dashboardLiveBookAgents = 0;
  let dashboardNavBookAgents = 0;
  for (const t of AGENT_TYPES) {
    const run = agentRunByType.get(t);
    const pb = parseGrounding(run?.output)?.portfolioBook;
    if (!pb) continue;
    if (pb.bookMode === "light") dashboardNavBookAgents += 1;
    else dashboardLiveBookAgents += 1;
  }

  const allocationData = portfolio
    ? [
        { name: "BTC", value: portfolio.allocationBtc },
        { name: "ETH", value: portfolio.allocationEth },
        { name: "SOL", value: portfolio.allocationSol },
      ]
    : [];

  const runningAgents = runningAgentTypes;
  const completedAgents = completeAgentTypes;

  // Compute P&L from history
  const firstValue = historyData?.[0]?.totalValueUsd ?? 0;
  const lastValue = historyData?.[historyData.length - 1]?.totalValueUsd ?? 0;
  const historyPnl = lastValue - firstValue;
  const historyPnlPct = firstValue > 0 ? (historyPnl / firstValue) * 100 : 0;
  const historyPositive = historyPnl >= 0;

  const chartData = (historyData ?? []).map((row, i) => ({
    i,
    date: new Date(row.snapshotAt).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    value: row.totalValueUsd ?? 0,
  }));

  return (
    <div className="p-4 sm:p-6 space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Command Center</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Welcome back, {user?.name?.split(" ")[0] ?? "Operator"} · Portfolio Overview
          </p>
        </div>
        <button
          onClick={() => refetchPrices()}
          className="h-10 px-3 rounded-md border border-border text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all self-start sm:self-auto"
        >
          <RefreshCw size={11} />
          Refresh
        </button>
      </div>

      {/* Portfolio summary row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Total portfolio value */}
        <div className="lg:col-span-2 aegis-card">
          <div className="mono-label mb-2">Total Portfolio Value</div>
          {portfolioLoading ? (
            <div className="shimmer rounded h-8 w-48 mb-2" />
          ) : (
            <div className="text-2xl sm:text-3xl font-semibold tabular-nums">
              {formatUsd(portfolio?.totalValueUsd ?? 0)}
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            {portfolio && (
              <>
                <span className={`flex items-center gap-1 text-sm font-mono ${portfolio.changePct24h >= 0 ? "text-aegis-green" : "text-aegis-red"}`}>
                  {portfolio.changePct24h >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                  {formatUsd(Math.abs(portfolio.change24h))}
                </span>
                <span className={`text-xs font-mono ${portfolio.changePct24h >= 0 ? "text-aegis-green" : "text-aegis-red"}`}>
                  ({formatPct(portfolio.changePct24h)})
                </span>
                <span className="text-xs text-muted-foreground font-mono">24h</span>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-border">
            <div>
              <div className="mono-label">BTC</div>
              <div className="text-sm font-mono font-medium mt-0.5">{(portfolio?.btcBalance ?? 0).toFixed(4)}</div>
            </div>
            <div>
              <div className="mono-label">ETH</div>
              <div className="text-sm font-mono font-medium mt-0.5">{(portfolio?.ethBalance ?? 0).toFixed(4)}</div>
            </div>
            <div>
              <div className="mono-label">SOL</div>
              <div className="text-sm font-mono font-medium mt-0.5">{(portfolio?.solBalance ?? 0).toFixed(2)}</div>
            </div>
          </div>
        </div>

        {/* Asset allocation */}
        <div className="aegis-card">
          <div className="mono-label mb-3">Asset Allocation</div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <ResponsiveContainer width={80} height={80}>
              <PieChart>
                <Pie
                  data={allocationData.length ? allocationData : [{ name: "", value: 1 }]}
                  cx="50%" cy="50%"
                  innerRadius={24} outerRadius={38}
                  dataKey="value" strokeWidth={0}
                >
                  {allocationData.map((_, i) => (
                    <Cell key={i} fill={ALLOCATION_COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v}%`, ""]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5">
              {allocationData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: ALLOCATION_COLORS[i] }} />
                  <span className="text-xs font-mono text-muted-foreground">{d.name}</span>
                  <span className="text-xs font-mono ml-auto">{d.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Agent status */}
        <div className="aegis-card">
          <div className="flex items-center justify-between mb-3">
            <div className="mono-label">Intelligence Agents</div>
            <Link
              href="/agents"
              className="text-[10px] font-mono text-muted-foreground hover:text-foreground border border-border rounded px-2 py-0.5 transition-colors"
            >
              Open
            </Link>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`pulse-dot ${runningAgents > 0 ? "pulse-blue" : "pulse-gray"}`} />
                <span className="text-xs font-mono text-muted-foreground">Active</span>
              </div>
              <span className="text-sm font-mono font-medium">{runningAgents}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="pulse-dot pulse-green" />
                <span className="text-xs font-mono text-muted-foreground">Complete</span>
              </div>
              <span className="text-sm font-mono font-medium">{completedAgents}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="pulse-dot pulse-gray" />
                <span className="text-xs font-mono text-muted-foreground">Idle / other</span>
              </div>
              <span className="text-sm font-mono font-medium">{otherAgentTypes}</span>
            </div>
          </div>
          <div className="mt-3 pt-3 border-t border-border space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
              <Zap size={10} />
              <span>{AGENT_TYPES.length} agent types · {agentStatuses?.length ?? 0} with run history</span>
            </div>
            <div className="flex items-start gap-2 text-[10px] font-mono text-muted-foreground leading-relaxed">
              <BookMarked size={10} className="shrink-0 mt-0.5 text-foreground/60" />
              <span>
                {dashboardLiveBookAgents + dashboardNavBookAgents > 0 ? (
                  <>
                    Latest runs:{" "}
                    <span className="text-foreground/85">{dashboardLiveBookAgents} live chain book</span>
                    {" · "}
                    <span className="text-foreground/85">{dashboardNavBookAgents} stored NAV (scheduled)</span>
                    . Manual runs refresh balances; schedules skip RPC.
                  </>
                ) : (
                  <>Run an agent from the Agents desk to attach portfolio book context to reports.</>
                )}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* P&L History Chart */}
      <div className="aegis-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 size={13} className="text-muted-foreground" />
              <div className="mono-label">Portfolio Equity Curve</div>
            </div>
            {!historyLoading && historyData && historyData.length > 0 && (
              <div className="flex items-center gap-2">
                <span className={`text-sm font-mono font-medium ${historyPositive ? "text-aegis-green" : "text-aegis-red"}`}>
                  {historyPositive ? "+" : ""}{formatUsd(historyPnl)}
                </span>
                <span className={`text-xs font-mono ${historyPositive ? "text-aegis-green" : "text-aegis-red"}`}>
                  ({formatPct(historyPnlPct)})
                </span>
                <span className="text-xs text-muted-foreground font-mono">{historyDays}d P&L</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.label}
                onClick={() => setHistoryDays(opt.days)}
                className={`h-8 px-2.5 rounded text-xs font-mono transition-all ${
                  historyDays === opt.days
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {historyLoading ? (
          <div className="shimmer rounded h-40 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={historyPositive ? "oklch(0.72 0.17 142)" : "oklch(0.65 0.20 25)"} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={historyPositive ? "oklch(0.72 0.17 142)" : "oklch(0.65 0.20 25)"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.20 0 0)" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "oklch(0.50 0 0)" }}
                axisLine={false} tickLine={false}
                interval={Math.floor(chartData.length / 5)}
              />
              <YAxis
                tick={{ fontSize: 9, fontFamily: "var(--font-mono)", fill: "oklch(0.50 0 0)" }}
                axisLine={false} tickLine={false}
                tickFormatter={formatUsdCompact}
                width={56}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v: number) => [formatUsd(v), "Portfolio Value"]}
                labelStyle={{ color: "oklch(0.60 0 0)", marginBottom: 2 }}
              />
              <Area
                type="monotone"
                dataKey="value"
                stroke={historyPositive ? "oklch(0.72 0.17 142)" : "oklch(0.65 0.20 25)"}
                strokeWidth={1.5}
                fill="url(#portfolioGrad)"
                dot={false}
                activeDot={{ r: 3, strokeWidth: 0 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Live price tickers */}
      <div>
        <div className="mono-label mb-3">Live Market Prices</div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <PriceCard symbol="BTC" name="Bitcoin" price={btc?.price ?? 0} changePct={btc?.changePct24h ?? 0} sparkline={btc?.sparkline ?? []} />
          <PriceCard symbol="ETH" name="Ethereum" price={eth?.price ?? 0} changePct={eth?.changePct24h ?? 0} sparkline={eth?.sparkline ?? []} />
          <PriceCard symbol="SOL" name="Solana" price={sol?.price ?? 0} changePct={sol?.changePct24h ?? 0} sparkline={sol?.sparkline ?? []} />
        </div>
      </div>

      {/* Bottom row: Activity + Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* On-chain activity (no server-side tx feed yet) */}
        <div className="aegis-card">
          <div className="flex items-center justify-between mb-4">
            <div className="mono-label">Recent Activity</div>
            <Activity size={13} className="text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground font-mono leading-relaxed">
            On-chain transfers are not indexed here yet. Use your wallet explorer for transaction history; portfolio totals above reflect live balances.
          </p>
        </div>

        {/* Watchlist + Alerts */}
        <div className="flex flex-col gap-4">
          <div className="aegis-card flex-1">
            <div className="flex items-center justify-between mb-4">
              <div className="mono-label">Market Alerts</div>
              <AlertTriangle size={13} className="text-aegis-gold" />
            </div>
            <p className="text-xs text-muted-foreground font-mono leading-relaxed">
              Configure price alerts on Wallets (Price Alerts) to receive threshold notifications when markets move.
            </p>
          </div>

          <div className="aegis-card">
            <div className="flex items-center justify-between mb-3">
              <div className="mono-label">Watchlist</div>
              <TrendingUp size={13} className="text-muted-foreground" />
            </div>
            <div className="space-y-2">
              {[
                { symbol: "BTC", price: btc?.price, pct: btc?.changePct24h },
                { symbol: "ETH", price: eth?.price, pct: eth?.changePct24h },
                { symbol: "SOL", price: sol?.price, pct: sol?.changePct24h },
              ].map((w) => (
                <div key={w.symbol} className="flex items-center justify-between">
                  <span className="text-xs font-mono font-medium">{w.symbol}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-muted-foreground">
                      {w.price ? formatUsd(w.price) : "—"}
                    </span>
                    <span className={`text-xs font-mono ${(w.pct ?? 0) >= 0 ? "text-aegis-green" : "text-aegis-red"}`}>
                      {w.pct !== undefined ? formatPct(w.pct) : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
