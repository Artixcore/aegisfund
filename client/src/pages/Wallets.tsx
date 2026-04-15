import { trpc } from "@/lib/trpc";
import LocalWalletPanel from "@/components/LocalWalletPanel";
import SparklineChart from "@/components/SparklineChart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  BellOff,
  Check,
  Clock,
  Copy,
  Edit2,
  ExternalLink,
  History,
  Loader2,
  Plus,
  RefreshCw,
  RefreshCcw,
  Send,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n);
}
function formatPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

const CHAIN_META: Record<string, { name: string; icon: string; color: string; explorerBase: string }> = {
  BTC: { name: "Bitcoin", icon: "₿", color: "oklch(0.78 0.12 85)", explorerBase: "https://blockstream.info/address/" },
  ETH: { name: "Ethereum", icon: "Ξ", color: "oklch(0.65 0.15 240)", explorerBase: "https://etherscan.io/address/" },
  SOL: { name: "Solana", icon: "◎", color: "oklch(0.72 0.12 195)", explorerBase: "https://solscan.io/account/" },
};

const MOCK_TX: Record<string, Array<{ type: string; amount: string; usd: string; address: string; time: string; hash: string }>> = {
  BTC: [
    { type: "receive", amount: "+0.0821 BTC", usd: "+$8,420.18", address: "bc1q...x4f2", time: "2h ago", hash: "a1b2c3d4..." },
    { type: "send", amount: "-0.12 BTC", usd: "-$12,300.00", address: "bc1q...m9k1", time: "2d ago", hash: "e5f6g7h8..." },
    { type: "receive", amount: "+0.5 BTC", usd: "+$51,250.00", address: "bc1q...p3r7", time: "5d ago", hash: "i9j0k1l2..." },
  ],
  ETH: [
    { type: "send", amount: "-2.5 ETH", usd: "-$6,125.00", address: "0x...d4e5", time: "5h ago", hash: "q7r8s9t0..." },
    { type: "receive", amount: "+5.0 ETH", usd: "+$12,250.00", address: "0x...a1b2", time: "3d ago", hash: "u1v2w3x4..." },
    { type: "receive", amount: "+3.84 ETH", usd: "+$9,408.00", address: "0x...c3d4", time: "7d ago", hash: "y5z6a7b8..." },
  ],
  SOL: [
    { type: "receive", amount: "+48.0 SOL", usd: "+$7,344.00", address: "Aegis...x4f2", time: "1d ago", hash: "g3h4i5j6..." },
    { type: "send", amount: "-25.0 SOL", usd: "-$3,825.00", address: "Vault...m9k1", time: "4d ago", hash: "k7l8m9n0..." },
    { type: "receive", amount: "+200.0 SOL", usd: "+$30,600.00", address: "Fund...p3r7", time: "8d ago", hash: "o1p2q3r4..." },
  ],
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setCopied(true);
          toast.success("Address copied");
          setTimeout(() => setCopied(false), 2000);
        });
      }}
      className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
    >
      {copied ? <Check size={12} className="text-aegis-green" /> : <Copy size={12} />}
    </button>
  );
}

function EditAddressModal({
  chain,
  currentAddress,
  onClose,
  onSave,
}: {
  chain: string;
  currentAddress: string;
  onClose: () => void;
  onSave: (address: string) => void;
}) {
  const [value, setValue] = useState(currentAddress);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="aegis-card w-full max-w-md mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Update {chain} Wallet Address</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>
        <p className="text-xs text-muted-foreground">
          Enter a real {chain} address. Balances prefer self-hosted RPC or Esplora base URLs from environment (see the project `.env.example`).
        </p>
        <input
          className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-foreground/40"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={chain === "BTC" ? "bc1q..." : chain === "ETH" ? "0x..." : "Solana address..."}
        />
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-md border border-border text-xs hover:bg-accent transition-all">Cancel</button>
          <button
            onClick={() => { if (value.trim().length > 10) { onSave(value.trim()); onClose(); } }}
            className="flex-1 py-2 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-all"
          >
            Save & Fetch Balance
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateAlertModal({
  onClose,
  onSave,
  prices,
}: {
  onClose: () => void;
  onSave: (data: { symbol: "BTC" | "ETH" | "SOL"; condition: "above" | "below"; threshold: number }) => void;
  prices: Record<string, { price: number }>;
}) {
  const [symbol, setSymbol] = useState<"BTC" | "ETH" | "SOL">("BTC");
  const [condition, setCondition] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("");

  const currentPrice = prices[symbol]?.price ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="aegis-card w-full max-w-sm mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Create Price Alert</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mono-label mb-1.5 block">Asset</label>
            <div className="flex gap-2">
              {(["BTC", "ETH", "SOL"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSymbol(s)}
                  className={`flex-1 py-1.5 rounded-md border text-xs font-mono transition-all ${symbol === s ? "border-foreground/60 bg-accent text-foreground" : "border-border text-muted-foreground hover:border-foreground/30"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mono-label mb-1.5 block">Condition</label>
            <div className="flex gap-2">
              {(["above", "below"] as const).map((c) => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  className={`flex-1 py-1.5 rounded-md border text-xs font-mono capitalize transition-all ${condition === c ? "border-foreground/60 bg-accent text-foreground" : "border-border text-muted-foreground hover:border-foreground/30"}`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mono-label mb-1.5 block">
              Threshold (current: {currentPrice > 0 ? formatUsd(currentPrice) : "—"})
            </label>
            <input
              type="number"
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-foreground/40"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              placeholder="e.g. 75000"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-md border border-border text-xs hover:bg-accent transition-all">Cancel</button>
          <button
            onClick={() => {
              const t = parseFloat(threshold);
              if (!isNaN(t) && t > 0) { onSave({ symbol, condition, threshold: t }); onClose(); }
            }}
            className="flex-1 py-2 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-all"
          >
            Create Alert
          </button>
        </div>
      </div>
    </div>
  );
}

function AddWalletModal({
  chain,
  onClose,
  onSave,
}: {
  chain: string;
  onClose: () => void;
  onSave: (address: string, label: string) => void;
}) {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="aegis-card w-full max-w-md mx-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Add {chain} Wallet</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={14} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="mono-label mb-1.5 block">Wallet Address</label>
            <input
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-foreground/40"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={chain === "BTC" ? "bc1q..." : chain === "ETH" ? "0x..." : "Solana address..."}
            />
          </div>
          <div>
            <label className="mono-label mb-1.5 block">Label (optional)</label>
            <input
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs font-mono focus:outline-none focus:border-foreground/40"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Cold Wallet, Hot Wallet"
            />
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-md border border-border text-xs hover:bg-accent transition-all">Cancel</button>
          <button
            onClick={() => { if (address.trim().length > 10) { onSave(address.trim(), label.trim()); onClose(); } else { toast.error("Enter a valid address"); } }}
            className="flex-1 py-2 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-all"
          >
            Add Wallet
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Wallets() {
  const utils = trpc.useUtils();
  const [editingChain, setEditingChain] = useState<string | null>(null);
  const [showCreateAlert, setShowCreateAlert] = useState(false);
  const [addingWalletChain, setAddingWalletChain] = useState<string | null>(null);
  const [alertTab, setAlertTab] = useState<"active" | "history">("active");
  const [walletTab, setWalletTab] = useState<"portfolio" | "local">("portfolio");

  const { data: prices, isLoading: pricesLoading, refetch: refetchPrices } = trpc.prices.getCryptoPrices.useQuery(undefined, {
    refetchInterval: 60_000,
  });
  const { data: wallets, isLoading: walletsLoading } = trpc.wallet.getWallets.useQuery();
  const { data: onChainBalances, isLoading: balancesLoading, refetch: refetchBalances } = trpc.wallet.getOnChainBalances.useQuery(undefined, {
    refetchInterval: 120_000,
  });
  const { data: alerts, isLoading: alertsLoading } = trpc.alerts.getAlerts.useQuery();

  const updateWallet = trpc.wallet.updateWallet.useMutation({
    onSuccess: () => {
      utils.wallet.getWallets.invalidate();
      utils.wallet.getOnChainBalances.invalidate();
      toast.success("Wallet address updated — fetching live balance...");
    },
    onError: () => toast.error("Failed to update wallet address"),
  });

  const addWallet = trpc.wallet.addWallet.useMutation({
    onSuccess: () => {
      utils.wallet.getWallets.invalidate();
      utils.wallet.getOnChainBalances.invalidate();
      toast.success("Wallet added — fetching live balance...");
    },
    onError: () => toast.error("Failed to add wallet"),
  });

  const deleteWallet = trpc.wallet.deleteWallet.useMutation({
    onSuccess: () => {
      utils.wallet.getWallets.invalidate();
      utils.wallet.getOnChainBalances.invalidate();
      toast.success("Wallet removed");
    },
  });

  const { data: alertHistory, isLoading: historyLoading } = trpc.alertHistory.getHistory.useQuery();

  const rearmAlert = trpc.alertHistory.rearm.useMutation({
    onSuccess: () => {
      utils.alerts.getAlerts.invalidate();
      toast.success("Alert re-armed");
    },
  });

  const createAlert = trpc.alerts.createAlert.useMutation({
    onSuccess: () => {
      utils.alerts.getAlerts.invalidate();
      toast.success("Price alert created");
    },
    onError: () => toast.error("Failed to create alert"),
  });

  const deleteAlert = trpc.alerts.deleteAlert.useMutation({
    onSuccess: () => { utils.alerts.getAlerts.invalidate(); toast.success("Alert deleted"); },
  });

  const toggleAlert = trpc.alerts.toggleAlert.useMutation({
    onSuccess: () => utils.alerts.getAlerts.invalidate(),
  });

  const walletMap: Record<string, string> = {};
  if (wallets) {
    for (const w of wallets) if (!walletMap[w.chain]) walletMap[w.chain] = w.address;
  }

  const editingWallet = wallets?.find((w) => w.chain === editingChain);

  // Group wallets by chain for multi-wallet display
  const walletsByChain: Record<string, typeof wallets> = {};
  if (wallets) {
    for (const w of wallets) {
      if (!walletsByChain[w.chain]) walletsByChain[w.chain] = [];
      walletsByChain[w.chain]!.push(w);
    }
  }

  const totalValue =
    ((onChainBalances?.BTC?.balance ?? 0) * (prices?.BTC?.price ?? 0)) +
    ((onChainBalances?.ETH?.balance ?? 0) * (prices?.ETH?.price ?? 0)) +
    ((onChainBalances?.SOL?.balance ?? 0) * (prices?.SOL?.price ?? 0));

  const allTx = Object.entries(MOCK_TX).flatMap(([chain, txs]) =>
    txs.map((tx) => ({ ...tx, chain }))
  );

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      <Tabs value={walletTab} onValueChange={(v) => setWalletTab(v as "portfolio" | "local")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="portfolio">Portfolio</TabsTrigger>
          <TabsTrigger value="local">Local wallet</TabsTrigger>
        </TabsList>
        <TabsContent value="portfolio" className="space-y-6 mt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Wallets</h1>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">
            Multi-chain portfolio · Live on-chain balances
          </p>
        </div>
        <div className="flex items-center gap-3">
          {totalValue > 0 && (
            <div className="text-right">
              <div className="mono-label">Live Portfolio Value</div>
              <div className="text-lg font-semibold tabular-nums">{formatUsd(totalValue)}</div>
            </div>
          )}
          <button
            onClick={() => { refetchPrices(); refetchBalances(); }}
            className="p-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
            title="Refresh all"
          >
            <RefreshCw size={13} className={(pricesLoading || balancesLoading) ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {/* Wallet Cards */}
      <div className="grid grid-cols-3 gap-5">
        {(["BTC", "ETH", "SOL"] as const).map((chain) => {
          const meta = CHAIN_META[chain];
          const price = prices?.[chain]?.price ?? 0;
          const changePct = prices?.[chain]?.changePct24h ?? 0;
          const sparkline = prices?.[chain]?.sparkline ?? [];
          const up = changePct >= 0;
          const onChain = onChainBalances?.[chain];
          const balance = onChain?.balance ?? 0;
          const address = walletMap[chain] ?? "—";
          const valueUsd = balance * price;
          const hasError = !!onChain?.error;

          return (
            <div key={chain} className="aegis-card space-y-4">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-bold shrink-0"
                    style={{ background: `${meta.color}18`, color: meta.color }}
                  >
                    {meta.icon}
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{meta.name}</div>
                    <div className="mono-label">{chain} Network</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold tabular-nums">
                    {price > 0 && balance > 0 ? formatUsd(valueUsd) : "—"}
                  </div>
                  <div className={`flex items-center justify-end gap-1 text-xs font-mono ${up ? "text-aegis-green" : "text-aegis-red"}`}>
                    {up ? <ArrowUpRight size={11} /> : <ArrowDownRight size={11} />}
                    {formatPct(changePct)}
                  </div>
                </div>
              </div>

              {/* Live Balance */}
              <div className="flex items-center justify-between py-3 border-t border-b border-border">
                <div>
                  <div className="mono-label flex items-center gap-1">
                    On-Chain Balance
                    {balancesLoading && <Loader2 size={9} className="animate-spin" />}
                    {hasError && <AlertTriangle size={9} className="text-aegis-amber" />}
                  </div>
                  <div className="text-sm font-mono font-medium mt-0.5">
                    {balancesLoading ? "Fetching..." : hasError ? "Unavailable" : `${balance.toFixed(6)} ${chain}`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="mono-label">Live Price</div>
                  <div className="text-sm font-mono font-medium mt-0.5">
                    {price > 0 ? formatUsd(price) : "—"}
                  </div>
                </div>
              </div>

              {/* Sparkline */}
              <div>
                <div className="mono-label mb-2">5-Day Price</div>
                <SparklineChart data={sparkline} positive={up} height={44} showTooltip />
              </div>

              {/* Address */}
              <div>
                <div className="mono-label mb-1.5">Wallet Address</div>
                <div className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                  <span className="text-xs font-mono text-muted-foreground truncate flex-1">{address}</span>
                  <CopyButton text={address} />
                  <button
                    onClick={() => setEditingChain(chain)}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                    title="Edit address"
                  >
                    <Edit2 size={12} />
                  </button>
                  <a
                    href={`${meta.explorerBase}${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                    title="View on explorer"
                  >
                    <ExternalLink size={12} />
                  </a>
                </div>
                {hasError && (
                  <p className="text-[10px] text-aegis-amber font-mono mt-1">
                    Could not fetch balance — check address format
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => toast.info("Feature coming soon")}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md border border-border text-xs font-medium hover:bg-accent hover:border-foreground/20 transition-all"
                >
                  <ArrowDownRight size={13} />
                  Receive
                </button>
                <button
                  onClick={() => toast.info("Feature coming soon")}
                  className="flex-1 flex items-center justify-center gap-2 py-2 rounded-md border border-border text-xs font-medium hover:bg-accent hover:border-foreground/20 transition-all"
                >
                  <Send size={13} />
                  Send
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Multi-Wallet Breakdown */}
      <div className="aegis-card">
        <div className="mono-label mb-4">Wallet Addresses</div>
        <div className="space-y-3">
          {(["BTC", "ETH", "SOL"] as const).map((chain) => {
            const chainWallets = walletsByChain[chain] ?? [];
            const meta = CHAIN_META[chain];
            return (
              <div key={chain}>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded flex items-center justify-center text-xs font-bold" style={{ background: `${meta.color}18`, color: meta.color }}>
                      {meta.icon}
                    </div>
                    <span className="text-xs font-mono font-medium">{chain}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">{chainWallets.length} address{chainWallets.length !== 1 ? "es" : ""}</span>
                  </div>
                  <button
                    onClick={() => setAddingWalletChain(chain)}
                    className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <Plus size={10} /> Add
                  </button>
                </div>
                <div className="space-y-1.5 pl-7">
                  {chainWallets.map((w) => (
                    <div key={w.id} className="flex items-center gap-2 bg-muted rounded-md px-3 py-2">
                      {w.isDefault && <span className="text-[9px] font-mono text-aegis-green border border-aegis-green/30 rounded px-1">DEFAULT</span>}
                      {w.label && <span className="text-[10px] font-mono text-muted-foreground shrink-0">{w.label}</span>}
                      <span className="text-xs font-mono text-muted-foreground truncate flex-1">{w.address}</span>
                      <CopyButton text={w.address} />
                      <button onClick={() => setEditingChain(chain)} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all"><Edit2 size={11} /></button>
                      {!w.isDefault && (
                        <button onClick={() => deleteWallet.mutate({ id: w.id })} className="p-1 rounded text-muted-foreground hover:text-aegis-red hover:bg-accent transition-all"><Trash2 size={11} /></button>
                      )}
                    </div>
                  ))}
                  {chainWallets.length === 0 && (
                    <div className="text-[10px] font-mono text-muted-foreground py-1">No addresses configured</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Price Alerts Panel */}
      <div className="aegis-card">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold">Price Alerts</div>
            <div className="mono-label mt-0.5">Notify when price crosses threshold</div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-md border border-border overflow-hidden">
              <button
                onClick={() => setAlertTab("active")}
                className={`px-3 py-1.5 text-xs font-mono transition-all ${alertTab === "active" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                Active
              </button>
              <button
                onClick={() => setAlertTab("history")}
                className={`px-3 py-1.5 text-xs font-mono transition-all flex items-center gap-1 ${alertTab === "history" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
              >
                <History size={10} /> History
              </button>
            </div>
            {alertTab === "active" && (
              <button
                onClick={() => setShowCreateAlert(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-all"
              >
                <Plus size={11} />
                New Alert
              </button>
            )}
          </div>
        </div>

        {alertTab === "active" ? (
          alertsLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 size={12} className="animate-spin" />
              Loading alerts...
            </div>
          ) : !alerts || alerts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bell size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs font-mono">No price alerts configured</p>
              <p className="text-[11px] mt-1">Create an alert to get notified when BTC, ETH, or SOL crosses a price level</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => {
                const currentPrice = prices?.[alert.symbol]?.price ?? 0;
                const threshold = parseFloat(String(alert.threshold));
                const isNear = currentPrice > 0 && Math.abs(currentPrice - threshold) / threshold < 0.05;
                return (
                  <div
                    key={alert.id}
                    className={`flex items-center justify-between p-3 rounded-lg border transition-all ${alert.isActive ? "border-border bg-muted/30" : "border-border/40 bg-muted/10 opacity-60"}`}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
                        style={{ background: `${CHAIN_META[alert.symbol]?.color}18`, color: CHAIN_META[alert.symbol]?.color }}
                      >
                        {alert.symbol}
                      </div>
                      <div>
                        <div className="text-xs font-mono">
                          <span className={alert.condition === "above" ? "text-aegis-green" : "text-aegis-red"}>
                            {alert.condition === "above" ? "↑ Above" : "↓ Below"}
                          </span>
                          {" "}{formatUsd(threshold)}
                        </div>
                        <div className="mono-label mt-0.5">
                          Current: {currentPrice > 0 ? formatUsd(currentPrice) : "—"}
                          {isNear && alert.isActive && (
                            <span className="ml-2 text-aegis-amber">⚡ Near threshold</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {alert.triggeredAt && (
                        <span className="text-[10px] font-mono text-muted-foreground">Triggered</span>
                      )}
                      <button
                        onClick={() => toggleAlert.mutate({ id: alert.id, isActive: !alert.isActive })}
                        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-accent transition-all"
                        title={alert.isActive ? "Disable alert" : "Enable alert"}
                      >
                        {alert.isActive ? <Bell size={12} className="text-aegis-green" /> : <BellOff size={12} />}
                      </button>
                      <button
                        onClick={() => deleteAlert.mutate({ id: alert.id })}
                        className="p-1.5 rounded text-muted-foreground hover:text-aegis-red hover:bg-accent transition-all"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* Alert History Tab */
          historyLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
              <Loader2 size={12} className="animate-spin" />
              Loading history...
            </div>
          ) : !alertHistory || alertHistory.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <History size={24} className="mx-auto mb-2 opacity-30" />
              <p className="text-xs font-mono">No triggered alerts yet</p>
              <p className="text-[11px] mt-1">Triggered alerts will appear here with price-at-trigger and re-arm option</p>
            </div>
          ) : (
            <div className="space-y-2">
              {alertHistory.map((h) => {
                const threshold = parseFloat(String(h.threshold));
                const priceAtTrigger = parseFloat(String(h.priceAtTrigger));
                return (
                  <div key={h.id} className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/20">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold"
                        style={{ background: `${CHAIN_META[h.symbol]?.color}18`, color: CHAIN_META[h.symbol]?.color }}
                      >
                        {h.symbol}
                      </div>
                      <div>
                        <div className="text-xs font-mono">
                          <span className={h.condition === "above" ? "text-aegis-green" : "text-aegis-red"}>
                            {h.condition === "above" ? "↑ Above" : "↓ Below"}
                          </span>
                          {" "}{formatUsd(threshold)}
                          <span className="text-muted-foreground ml-2">→ triggered at {formatUsd(priceAtTrigger)}</span>
                        </div>
                        <div className="mono-label mt-0.5 flex items-center gap-1">
                          <Clock size={9} />
                          {new Date(h.triggeredAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => rearmAlert.mutate({ symbol: h.symbol, condition: h.condition, threshold })}
                      disabled={rearmAlert.isPending}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-border text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all disabled:opacity-50"
                      title="Re-arm this alert"
                    >
                      <RefreshCcw size={10} />
                      Re-arm
                    </button>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>

      {/* Transaction History */}
      <div className="aegis-card">
        <div className="flex items-center justify-between mb-5">
          <div className="mono-label">Transaction History</div>
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <Wallet size={11} />
            All chains · Live balances (RPC / REST as configured)
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Type", "Asset", "Amount", "USD Value", "Address", "Time", "Hash"].map((h) => (
                  <th key={h} className="text-left pb-3 font-mono text-muted-foreground tracking-wider uppercase text-[10px] pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allTx.map((tx, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-accent/30 transition-colors">
                  <td className="py-3 pr-4">
                    <span className={`flex items-center gap-1.5 ${tx.type === "receive" ? "text-aegis-green" : "text-aegis-red"}`}>
                      {tx.type === "receive" ? <ArrowDownRight size={11} /> : <ArrowUpRight size={11} />}
                      <span className="font-mono capitalize">{tx.type}</span>
                    </span>
                  </td>
                  <td className="py-3 pr-4 font-mono font-medium">{tx.chain}</td>
                  <td className={`py-3 pr-4 font-mono ${tx.type === "receive" ? "text-aegis-green" : "text-aegis-red"}`}>{tx.amount}</td>
                  <td className="py-3 pr-4 font-mono text-muted-foreground">{tx.usd}</td>
                  <td className="py-3 pr-4 font-mono text-muted-foreground">{tx.address}</td>
                  <td className="py-3 pr-4 font-mono text-muted-foreground">{tx.time}</td>
                  <td className="py-3 font-mono text-muted-foreground">
                    <span className="flex items-center gap-1">{tx.hash}<ExternalLink size={9} /></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

        </TabsContent>
        <TabsContent value="local" className="mt-4">
          <LocalWalletPanel />
        </TabsContent>
      </Tabs>

      {/* Edit Address Modal */}
      {editingChain && editingWallet && (
        <EditAddressModal
          chain={editingChain}
          currentAddress={editingWallet.address}
          onClose={() => setEditingChain(null)}
          onSave={(address) => updateWallet.mutate({ chain: editingChain as "BTC" | "ETH" | "SOL", address })}
        />
      )}

      {/* Create Alert Modal */}
      {showCreateAlert && (
        <CreateAlertModal
          onClose={() => setShowCreateAlert(false)}
          onSave={(data) => createAlert.mutate(data)}
          prices={prices ?? {}}
        />
      )}
      {/* Add Wallet Modal */}
      {addingWalletChain && (
        <AddWalletModal
          chain={addingWalletChain}
          onClose={() => setAddingWalletChain(null)}
          onSave={(address, label) => addWallet.mutate({ chain: addingWalletChain as "BTC" | "ETH" | "SOL", address, label })}
        />
      )}
    </div>
  );
}
