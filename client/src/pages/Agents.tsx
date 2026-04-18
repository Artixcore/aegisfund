import { trpc } from "@/lib/trpc";
import { parseGrounding, stripGrounding, type AgentRunGroundingMeta } from "@shared/agentGrounding";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  BarChart3,
  BookMarked,
  Bot,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  DollarSign,
  Globe,
  History,
  Loader2,
  Play,
  Sparkles,
  Timer,
  TrendingUp,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type AgentType =
  | "market_analysis"
  | "crypto_monitoring"
  | "forex_monitoring"
  | "futures_commodities"
  | "historical_research"
  | "portfolio_trading"
  | "executive_briefing";

/** Card and command-strip order (five desks, portfolio allocator, then synthesizer). */
const AGENT_CARD_ORDER: AgentType[] = [
  "market_analysis",
  "crypto_monitoring",
  "forex_monitoring",
  "futures_commodities",
  "historical_research",
  "portfolio_trading",
  "executive_briefing",
];

const AGENT_META: Record<AgentType, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  mission: string;
}> = {
  market_analysis: {
    label: "Market Analysis",
    description: "Macro intelligence & institutional research desk",
    icon: BarChart3,
    color: "oklch(0.65 0.15 240)",
    bgColor: "oklch(0.65 0.15 240 / 0.10)",
    mission: "Evaluates macro trends, volatility regimes, sentiment, and risk across all asset classes.",
  },
  crypto_monitoring: {
    label: "Crypto Monitoring",
    description: "On-chain intelligence & narrative tracking",
    icon: Activity,
    color: "oklch(0.72 0.17 145)",
    bgColor: "oklch(0.72 0.17 145 / 0.10)",
    mission: "Monitors whale activity, on-chain flows, narrative trends, and market events across crypto.",
  },
  forex_monitoring: {
    label: "Forex Monitoring",
    description: "G10 & EM currency intelligence",
    icon: Globe,
    color: "oklch(0.78 0.12 85)",
    bgColor: "oklch(0.78 0.12 85 / 0.10)",
    mission: "Tracks major forex pairs, DXY trends, central bank policy divergence, and EM risk.",
  },
  futures_commodities: {
    label: "Futures & Commodities",
    description: "Energy, metals & index futures desk",
    icon: TrendingUp,
    color: "oklch(0.60 0.15 290)",
    bgColor: "oklch(0.60 0.15 290 / 0.10)",
    mission: "Monitors crude oil, gold, industrial metals, agricultural commodities, and equity futures.",
  },
  historical_research: {
    label: "Historical Research",
    description: "Cycle analysis & pattern intelligence",
    icon: History,
    color: "oklch(0.72 0.12 195)",
    bgColor: "oklch(0.72 0.12 195 / 0.10)",
    mission: "Compiles historical data, identifies market cycle analogs, and produces long-range intelligence.",
  },
  portfolio_trading: {
    label: "Portfolio Trading",
    description: "Advisory allocation & trade plan (not auto-executed)",
    icon: ArrowRightLeft,
    color: "oklch(0.68 0.16 35)",
    bgColor: "oklch(0.68 0.16 35 / 0.10)",
    mission:
      "Reads your grounded portfolio book and market snapshot, then outputs a structured trade plan (target weights, per-chain actions). Aegis does not submit orders — you execute elsewhere if you choose.",
  },
  executive_briefing: {
    label: "Executive Briefing",
    description: "Single-page synthesis of all desk outputs",
    icon: Sparkles,
    color: "oklch(0.78 0.14 300)",
    bgColor: "oklch(0.78 0.14 300 / 0.12)",
    mission: "Reads the latest complete report from each specialist desk plus live snapshot context, and produces one institutional executive brief. Run desks first for richer input.",
  },
};

function formatUsdCompact(n: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 100_000 ? 0 : 2,
  }).format(n);
}

function GroundingStrip({
  grounding,
  accentColor,
}: {
  grounding: AgentRunGroundingMeta;
  accentColor: string;
}) {
  const pb = grounding.portfolioBook;
  const bookMode = pb?.bookMode ?? "live";
  const asOfLabel = pb?.asOf
    ? new Date(pb.asOf).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })
    : null;
  const isLight = bookMode === "light";

  return (
    <div
      className="rounded-md border border-border/60 bg-muted/25 px-3 py-2.5 space-y-1.5"
      style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
    >
      <div className="flex items-center gap-2">
        <BookMarked size={12} className="shrink-0" style={{ color: accentColor }} />
        <span className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">Grounding</span>
        {pb && (
          <span
            className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${isLight ? "bg-muted text-muted-foreground" : "text-foreground/80"}`}
            style={isLight ? {} : { background: `${accentColor}18` }}
          >
            {isLight ? "stored NAV" : "live chain"}
          </span>
        )}
      </div>
      <div className="text-[10px] font-mono text-muted-foreground leading-relaxed">
        <span className="text-foreground/90">Snapshot</span>{" "}
        <span className="text-foreground/70">{grounding.datasetVersion}</span>
      </div>
      {pb ? (
        <div className="text-[10px] font-mono text-muted-foreground leading-relaxed space-y-0.5">
          <div>
            {isLight ? (
              <>
                <span className="text-foreground/90">Scheduled book</span> · {pb.positionCount} wallet row
                {pb.positionCount !== 1 ? "s" : ""} on file · last NAV ~{formatUsdCompact(pb.totalValueUsd)} (no RPC this run)
              </>
            ) : (
              <>
                <span className="text-foreground/90">Live book</span> · {pb.positionCount} tracked wallet
                {pb.positionCount !== 1 ? "s" : ""} · ~{formatUsdCompact(pb.totalValueUsd)} at spot marks
              </>
            )}
          </div>
          <div>
            <span className="text-foreground/90">Alerts</span> · {pb.activeAlertCount} active price alert
            {pb.activeAlertCount !== 1 ? "s" : ""}
            {asOfLabel ? (
              <>
                {" "}
                · book as of <span className="text-foreground/70">{asOfLabel}</span>
              </>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-[10px] font-mono text-muted-foreground">Market data only (no portfolio book on this run).</p>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const configs: Record<string, { label: string; cls: string; dot: string }> = {
    idle: { label: "IDLE", cls: "status-badge status-idle", dot: "pulse-dot pulse-gray" },
    running: { label: "RUNNING", cls: "status-badge status-running", dot: "pulse-dot pulse-blue" },
    analyzing: { label: "ANALYZING", cls: "status-badge status-analyzing", dot: "pulse-dot pulse-gold" },
    complete: { label: "COMPLETE", cls: "status-badge status-complete", dot: "pulse-dot pulse-green" },
    alert: { label: "ALERT", cls: "status-badge status-alert", dot: "pulse-dot" },
  };
  const cfg = configs[status] ?? configs.idle;
  return (
    <span className={cfg.cls}>
      <span className={cfg.dot} />
      {cfg.label}
    </span>
  );
}

function OutputSection({ output }: { output: Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);
  if (!output) return null;
  const cleaned = stripGrounding(output);
  const { summary, executive_summary, ...rest } = cleaned;
  const summaryStr =
    executive_summary !== undefined && executive_summary !== null
      ? String(executive_summary)
      : summary !== undefined && summary !== null
        ? String(summary)
        : null;
  const summaryLabel = executive_summary != null ? "Executive summary" : "Analysis summary";
  return (
    <div className="mt-4 space-y-3">
      {summaryStr && (
        <div className="bg-muted/50 rounded-md p-3 border border-border/50">
          <div className="mono-label mb-1.5">{summaryLabel}</div>
          <p className="text-xs text-foreground leading-relaxed">{summaryStr}</p>
        </div>
      )}
      {Object.keys(rest).length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-1.5 text-xs font-mono text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
            {expanded ? "Hide" : "Show"} structured data ({Object.keys(rest).length} fields)
          </button>
          {expanded && (
            <div className="mt-2 space-y-2">
              {Object.entries(rest).map(([key, value]) => (
                <div key={key} className="bg-muted/30 rounded p-2.5 border border-border/30">
                  <div className="mono-label mb-1">{key.replace(/_/g, " ")}</div>
                  {Array.isArray(value) ? (
                    <ul className="space-y-1">
                      {(value as Array<string | number | boolean | object>).map((item, i) => (
                        <li key={i} className="text-xs text-muted-foreground font-mono">
                          {typeof item === "object" ? JSON.stringify(item) : String(item)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-foreground">
                      {typeof value === "object" ? JSON.stringify(value, null, 2) : String(value)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ScheduleModal({
  agentType,
  currentSchedule,
  onClose,
  onSave,
}: {
  agentType: AgentType;
  currentSchedule: { intervalHours: number; isActive: boolean } | null;
  onClose: () => void;
  onSave: (data: { intervalHours: number; isActive: boolean }) => void;
}) {
  const meta = AGENT_META[agentType];
  const [intervalHours, setIntervalHours] = useState(currentSchedule?.intervalHours ?? 4);
  const [isActive, setIsActive] = useState(currentSchedule?.isActive ?? true);

  const presets = [1, 2, 4, 8, 12, 24, 48, 168];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="aegis-card w-full max-w-sm mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: meta.bgColor }}>
              <Calendar size={13} style={{ color: meta.color }} />
            </div>
            <h3 className="text-sm font-semibold">Schedule: {meta.label}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>

        <p className="text-xs text-muted-foreground">
          Configure automatic execution interval. The agent will run on schedule and store results for historical comparison.
        </p>

        <div>
          <label className="mono-label mb-2 block">Run Interval</label>
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            {presets.map((h) => (
              <button
                key={h}
                onClick={() => setIntervalHours(h)}
                className={`py-1.5 rounded-md border text-xs font-mono transition-all ${intervalHours === h ? "border-foreground/60 bg-accent text-foreground" : "border-border text-muted-foreground hover:border-foreground/30"}`}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={168}
              value={intervalHours}
              onChange={(e) => setIntervalHours(Math.max(1, Math.min(168, parseInt(e.target.value) || 4)))}
              className="w-20 bg-muted border border-border rounded-md px-3 py-1.5 text-xs font-mono focus:outline-none focus:border-foreground/40"
            />
            <span className="text-xs text-muted-foreground">hours between runs</span>
          </div>
        </div>

        <div className="flex items-center justify-between py-3 border-t border-border">
          <div>
            <div className="text-xs font-medium">Auto-Schedule Active</div>
            <div className="mono-label mt-0.5">Agent runs automatically on interval</div>
          </div>
          <button
            onClick={() => setIsActive(!isActive)}
            className={`relative w-10 h-5 rounded-full transition-all ${isActive ? "bg-aegis-green" : "bg-muted-foreground/30"}`}
          >
            <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${isActive ? "left-5" : "left-0.5"}`} />
          </button>
        </div>

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-md border border-border text-xs hover:bg-accent transition-all">Cancel</button>
          <button
            onClick={() => { onSave({ intervalHours, isActive }); onClose(); }}
            className="flex-1 py-2 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-all"
          >
            Save Schedule
          </button>
        </div>
      </div>
    </div>
  );
}

function HistoryPanel({
  agentType,
  onClose,
}: {
  agentType: AgentType;
  onClose: () => void;
}) {
  const meta = AGENT_META[agentType];
  const { data: history, isLoading } = trpc.agents.getAgentHistory.useQuery({ agentType, limit: 10 });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="aegis-card w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: meta.bgColor }}>
              <History size={13} style={{ color: meta.color }} />
            </div>
            <h3 className="text-sm font-semibold">{meta.label} — Run History</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>

        <div className="overflow-y-auto flex-1 space-y-3 pr-1">
          {isLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
              <Loader2 size={12} className="animate-spin" />
              Loading history...
            </div>
          ) : !history || history.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <History size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs font-mono">No completed runs yet</p>
              <p className="text-[11px] mt-1">Run this agent manually or set up auto-scheduling to build history</p>
            </div>
          ) : (
            history.map((run, i) => {
              const output = run.output as Record<string, unknown> | null;
              const summary = output?.summary ? String(output.summary) : null;
              const grounding = parseGrounding(output);
              return (
                <div key={run.id} className="border border-border/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                        Run #{history.length - i}
                      </span>
                      <StatusBadge status={run.status} />
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                      <Clock size={9} />
                      {run.completedAt ? new Date(run.completedAt).toLocaleString() : "—"}
                    </div>
                  </div>
                  {grounding && (
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[9px] font-mono text-muted-foreground border border-border/40 rounded px-2 py-1 bg-muted/20">
                      <span className="text-foreground/80">{grounding.datasetVersion}</span>
                      {grounding.portfolioBook ? (
                        <>
                          <span className="text-border">·</span>
                          <span>{grounding.portfolioBook.bookMode === "light" ? "NAV" : "live"}</span>
                          <span className="text-border">·</span>
                          <span>{grounding.portfolioBook.positionCount} wallets</span>
                          <span className="text-border">·</span>
                          <span>{formatUsdCompact(grounding.portfolioBook.totalValueUsd)}</span>
                          <span className="text-border">·</span>
                          <span>{grounding.portfolioBook.activeAlertCount} alerts</span>
                        </>
                      ) : (
                        <>
                          <span className="text-border">·</span>
                          <span>prices only</span>
                        </>
                      )}
                    </div>
                  )}
                  {summary && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{summary}</p>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function AgentCard({
  agentType,
  agentRun,
  schedule,
  onRun,
  isRunning,
  onSchedule,
  onHistory,
}: {
  agentType: AgentType;
  agentRun: {
    status: string;
    output: unknown;
    taskDescription: string | null;
    completedAt: Date | null;
    errorMessage?: string | null;
  } | null;
  schedule: { intervalHours: number; isActive: boolean; nextRunAt: Date | null } | null;
  onRun: () => void;
  isRunning: boolean;
  onSchedule: () => void;
  onHistory: () => void;
}) {
  const meta = AGENT_META[agentType];
  const Icon = meta.icon;
  const status = agentRun?.status ?? "idle";
  const output = agentRun?.output as Record<string, unknown> | null;
  const grounding = output ? parseGrounding(output) : null;
  const isActive = isRunning || status === "running" || status === "analyzing";

  return (
    <div
      className="aegis-card flex flex-col gap-4"
      style={{ borderColor: isActive ? `${meta.color}30` : undefined }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{ background: meta.bgColor }}
          >
            <Icon size={16} style={{ color: meta.color }} />
          </div>
          <div>
            <div className="text-sm font-semibold">{meta.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{meta.description}</div>
          </div>
        </div>
        <StatusBadge status={isRunning ? "running" : status} />
      </div>

      {/* Mission */}
      <p className="text-xs text-muted-foreground leading-relaxed border-l-2 pl-3" style={{ borderColor: meta.color + "40" }}>
        {meta.mission}
      </p>

      {/* Schedule indicator */}
      {schedule?.isActive && (
        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-muted/50 border border-border/50">
          <Timer size={10} style={{ color: meta.color }} />
          <span className="text-[10px] font-mono text-muted-foreground">
            Auto-runs every {schedule.intervalHours}h
            {schedule.nextRunAt && ` · Next: ${new Date(schedule.nextRunAt).toLocaleTimeString()}`}
          </span>
        </div>
      )}

      {status === "alert" && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-muted-foreground flex gap-2 items-start">
          <AlertTriangle size={14} className="shrink-0 text-destructive mt-0.5" />
          <div>
            <div className="font-mono text-[10px] uppercase tracking-wide text-destructive/90 mb-1">Run failed</div>
            <p className="leading-relaxed">
              {agentRun?.errorMessage?.trim()
                ? agentRun.errorMessage
                : "No error details were stored for this run."}
            </p>
          </div>
        </div>
      )}

      {grounding && status !== "alert" && (
        <GroundingStrip grounding={grounding} accentColor={meta.color} />
      )}

      {/* Output — omit stale JSON when latest run failed */}
      {output && status !== "alert" && <OutputSection output={output} />}

      {/* Completed time */}
      {agentRun?.completedAt && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground">
          <Clock size={9} />
          Last run: {new Date(agentRun.completedAt).toLocaleString()}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-auto">
        <button
          onClick={onRun}
          disabled={isActive}
          className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md border border-border text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:bg-accent hover:border-foreground/20"
          style={isActive ? {} : { borderColor: `${meta.color}30` }}
        >
          {isActive ? (
            <>
              <Loader2 size={12} className="animate-spin" style={{ color: meta.color }} />
              <span style={{ color: meta.color }}>Running...</span>
            </>
          ) : (
            <>
              <Play size={12} />
              Run
            </>
          )}
        </button>
        <button
          onClick={onSchedule}
          className={`px-3 py-2 rounded-md border text-xs transition-all hover:bg-accent ${schedule?.isActive ? "border-aegis-green/40 text-aegis-green" : "border-border text-muted-foreground hover:border-foreground/20"}`}
          title="Configure schedule"
        >
          <Timer size={12} />
        </button>
        <button
          onClick={onHistory}
          className="px-3 py-2 rounded-md border border-border text-xs text-muted-foreground transition-all hover:bg-accent hover:border-foreground/20"
          title="View run history"
        >
          <History size={12} />
        </button>
      </div>
    </div>
  );
}

export default function Agents() {
  const utils = trpc.useUtils();
  const { data: agentRuns, isLoading } = trpc.agents.getAgentStatuses.useQuery(undefined, {
    refetchInterval: 5000,
  });
  const { data: schedules } = trpc.agents.getSchedules.useQuery();

  const [runningAgents, setRunningAgents] = useState<Set<AgentType>>(new Set());
  const [schedulingAgent, setSchedulingAgent] = useState<AgentType | null>(null);
  const [historyAgent, setHistoryAgent] = useState<AgentType | null>(null);

  const runMutation = trpc.agents.runAgent.useMutation({
    onSuccess: (_, variables) => {
      setRunningAgents((prev) => { const next = new Set(prev); next.delete(variables.agentType); return next; });
      utils.agents.getAgentStatuses.invalidate();
      toast.success("Agent completed analysis");
    },
    onError: (_, variables) => {
      setRunningAgents((prev) => { const next = new Set(prev); next.delete(variables.agentType); return next; });
      toast.error("Agent encountered an error");
    },
  });

  const briefingMutation = trpc.agents.runExecutiveBriefing.useMutation({
    onSuccess: () => {
      setRunningAgents((prev) => { const next = new Set(prev); next.delete("executive_briefing"); return next; });
      utils.agents.getAgentStatuses.invalidate();
      toast.success("Executive briefing ready");
    },
    onError: () => {
      setRunningAgents((prev) => { const next = new Set(prev); next.delete("executive_briefing"); return next; });
      toast.error("Executive briefing failed");
    },
  });

  const upsertSchedule = trpc.agents.upsertSchedule.useMutation({
    onSuccess: () => {
      utils.agents.getSchedules.invalidate();
      toast.success("Schedule saved");
    },
    onError: () => toast.error("Failed to save schedule"),
  });

  const handleRunAgent = (agentType: AgentType) => {
    setRunningAgents((prev) => new Set(prev).add(agentType));
    if (agentType === "executive_briefing") {
      briefingMutation.mutate();
      toast.info("Synthesizing executive briefing from latest desk outputs…");
      return;
    }
    runMutation.mutate({ agentType });
    toast.info(`${AGENT_META[agentType].label} agent activated`);
  };

  const handleRunAll = () => {
    const allTypes = AGENT_CARD_ORDER.filter((t) => t !== "executive_briefing");
    allTypes.forEach((type) => {
      if (!runningAgents.has(type)) {
        setTimeout(() => handleRunAgent(type), Math.random() * 500);
      }
    });
  };

  const agentRunMap = new Map(agentRuns?.map((r) => [r.agentType, r]) ?? []);
  const scheduleMap = new Map(schedules?.map((s) => [s.agentType, s]) ?? []);

  const totalComplete = agentRuns?.filter((r) => r.status === "complete").length ?? 0;
  const totalRunning = runningAgents.size + (agentRuns?.filter((r) => r.status === "running" || r.status === "analyzing").length ?? 0);
  const totalScheduled = schedules?.filter((s) => s.isActive).length ?? 0;
  const agentsWithLiveChainBook =
    agentRuns?.filter((r) => {
      const pb = parseGrounding(r.output)?.portfolioBook;
      return pb != null && pb.bookMode !== "light";
    }).length ?? 0;
  const agentsWithNavOnlyBook =
    agentRuns?.filter((r) => parseGrounding(r.output)?.portfolioBook?.bookMode === "light").length ?? 0;

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">AI Agents</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Five specialist desks + portfolio trading + executive briefing · Auto-scheduling
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-4 px-4 py-2 rounded-md border border-border bg-card text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <div className={`pulse-dot ${totalRunning > 0 ? "pulse-blue" : "pulse-gray"}`} />
              <span className="text-muted-foreground">{totalRunning} running</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="pulse-dot pulse-green" />
              <span className="text-muted-foreground">{totalComplete} complete</span>
            </div>
            {totalScheduled > 0 && (
              <div className="flex items-center gap-1.5">
                <Timer size={9} className="text-aegis-green" />
                <span className="text-aegis-green">{totalScheduled} scheduled</span>
              </div>
            )}
          </div>
          <button
            onClick={handleRunAll}
            disabled={totalRunning > 0}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Zap size={12} />
            Run All Agents
          </button>
        </div>
      </div>

      {/* Command overview strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        {AGENT_CARD_ORDER.map((type) => {
          const meta = AGENT_META[type];
          const run = agentRunMap.get(type);
          const sched = scheduleMap.get(type);
          const status =
            runningAgents.has(type)
            || (type === "executive_briefing" && briefingMutation.isPending)
            || (type !== "executive_briefing" && runMutation.isPending && runMutation.variables?.agentType === type)
              ? "running"
              : (run?.status ?? "idle");
          const Icon = meta.icon;
          return (
            <div
              key={type}
              className="flex flex-col items-center gap-2 p-3 rounded-lg border border-border bg-card text-center"
              style={{ borderColor: status === "complete" ? `${meta.color}25` : undefined }}
            >
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: meta.bgColor }}>
                {status === "complete" ? (
                  <CheckCircle2 size={14} style={{ color: meta.color }} />
                ) : status === "running" || status === "analyzing" ? (
                  <Loader2 size={14} className="animate-spin" style={{ color: meta.color }} />
                ) : status === "alert" ? (
                  <AlertTriangle size={14} className="text-aegis-red" />
                ) : (
                  <Icon size={14} style={{ color: meta.color }} />
                )}
              </div>
              <div className="text-[10px] font-mono text-muted-foreground leading-tight">{meta.label}</div>
              <StatusBadge status={status} />
              {sched?.isActive && (
                <div className="flex items-center gap-1 text-[9px] font-mono text-aegis-green">
                  <Timer size={8} />
                  {sched.intervalHours}h
                </div>
              )}
              {(() => {
                const pb = parseGrounding(run?.output)?.portfolioBook;
                if (!pb) return null;
                const navOnly = pb.bookMode === "light";
                return (
                  <div
                    className="flex items-center justify-center gap-0.5 text-[8px] font-mono text-muted-foreground/90"
                    title={navOnly ? "Last run used stored NAV book (no chain RPC)" : "Last run includes live chain portfolio book"}
                  >
                    <BookMarked size={8} style={{ color: meta.color }} />
                    <span>{navOnly ? "NAV" : "live"}</span>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Agent cards grid */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-5">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="aegis-card h-48 shimmer" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5">
          {AGENT_CARD_ORDER.map((type) => {
            const sched = scheduleMap.get(type);
            return (
              <AgentCard
                key={type}
                agentType={type}
                agentRun={agentRunMap.get(type) ?? null}
                schedule={sched ? { intervalHours: sched.intervalHours, isActive: sched.isActive, nextRunAt: sched.nextRunAt } : null}
                onRun={() => handleRunAgent(type)}
                isRunning={
                  runningAgents.has(type)
                  || (type !== "executive_briefing" && runMutation.isPending && runMutation.variables?.agentType === type)
                  || (type === "executive_briefing" && briefingMutation.isPending)
                }
                onSchedule={() => setSchedulingAgent(type)}
                onHistory={() => setHistoryAgent(type)}
              />
            );
          })}
          {/* Intelligence Overview card */}
          <div className="aegis-card flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-foreground/5 border border-border flex items-center justify-center">
                <Bot size={16} className="text-foreground" />
              </div>
              <div>
                <div className="text-sm font-semibold">Intelligence Overview</div>
                <div className="text-xs text-muted-foreground">Central command summary</div>
              </div>
            </div>
            <div className="space-y-3">
              {AGENT_CARD_ORDER.map((type) => {
                const meta = AGENT_META[type];
                const run = agentRunMap.get(type);
                const sched = scheduleMap.get(type);
                const status =
                  runningAgents.has(type)
                  || (type === "executive_briefing" && briefingMutation.isPending)
                  || (type !== "executive_briefing" && runMutation.isPending && runMutation.variables?.agentType === type)
                    ? "running"
                    : (run?.status ?? "idle");
                return (
                  <div key={type} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ background: meta.color }} />
                      <span className="text-xs font-mono text-muted-foreground">{meta.label}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {sched?.isActive && (
                        <span className="text-[9px] font-mono text-aegis-green flex items-center gap-0.5">
                          <Timer size={8} />{sched.intervalHours}h
                        </span>
                      )}
                      <StatusBadge status={status} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="pt-3 border-t border-border space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <DollarSign size={10} />
                <span>Powered by institutional LLM infrastructure</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <Calendar size={10} />
                <span>{totalScheduled} agent{totalScheduled !== 1 ? "s" : ""} on auto-schedule</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                <BookMarked size={10} />
                <span>
                  {agentsWithLiveChainBook + agentsWithNavOnlyBook > 0
                    ? `${agentsWithLiveChainBook} live chain · ${agentsWithNavOnlyBook} stored NAV (scheduled) · grounding on latest runs`
                    : "Complete a run to attach portfolio book grounding (wallets, marks, alerts)"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Modal */}
      {schedulingAgent && (
        <ScheduleModal
          agentType={schedulingAgent}
          currentSchedule={scheduleMap.get(schedulingAgent) ?? null}
          onClose={() => setSchedulingAgent(null)}
          onSave={(data) => upsertSchedule.mutate({ agentType: schedulingAgent, ...data })}
        />
      )}

      {/* History Panel */}
      {historyAgent && (
        <HistoryPanel
          agentType={historyAgent}
          onClose={() => setHistoryAgent(null)}
        />
      )}
    </div>
  );
}
