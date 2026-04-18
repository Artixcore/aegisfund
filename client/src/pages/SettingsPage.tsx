import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import {
  ASSET_CLASS_LABELS,
  BROKER_ASSET_CLASSES,
  BROKER_VENUE_BY_CLASS,
  type BrokerAssetClass,
} from "@shared/brokerVenues";
import {
  Bell,
  Bitcoin,
  ChevronRight,
  Globe,
  Key,
  Landmark,
  Lock,
  Monitor,
  Save,
  Shield,
  ShieldCheck,
  Smartphone,
  Sliders,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

type SettingsSection =
  | "profile"
  | "security"
  | "notifications"
  | "wallets"
  | "trading"
  | "agents"
  | "display";

const SECTIONS: { id: SettingsSection; label: string; icon: React.ElementType; description: string }[] = [
  { id: "profile", label: "Profile", icon: User, description: "Manage your identity and account details" },
  { id: "security", label: "Security", icon: Shield, description: "Passwords, sessions, and access control" },
  { id: "notifications", label: "Notifications", icon: Bell, description: "Alerts, price notifications, and agent updates" },
  { id: "wallets", label: "Connected Wallets", icon: Wallet, description: "Manage linked wallet addresses" },
  { id: "trading", label: "Trading connections", icon: Landmark, description: "Broker API keys and execution mode" },
  { id: "agents", label: "Agent Preferences", icon: Sliders, description: "Configure AI agent behavior and schedules" },
  { id: "display", label: "Display", icon: Monitor, description: "Theme, layout, and interface preferences" },
];

function ToggleSwitch({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => !disabled && onChange(!enabled)}
      title={disabled ? "Not saved to the server yet" : undefined}
      className={`relative w-10 h-5.5 rounded-full transition-colors duration-200 ${
        enabled ? "bg-foreground" : "bg-border"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      style={{ height: "22px", width: "40px" }}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-background transition-transform duration-200 ${enabled ? "translate-x-[18px]" : "translate-x-0"}`}
      />
    </button>
  );
}

function SectionNav({
  active,
  onSelect,
}: {
  active: SettingsSection;
  onSelect: (s: SettingsSection) => void;
}) {
  return (
    <div className="w-56 shrink-0 border-r border-border">
      <div className="px-4 py-3 border-b border-border">
        <div className="mono-label">Settings</div>
      </div>
      <nav className="p-2 space-y-0.5">
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-md text-sm transition-all text-left ${
                active === s.id
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
              }`}
            >
              <Icon size={14} />
              <span className="font-medium">{s.label}</span>
              {active === s.id && <ChevronRight size={11} className="ml-auto text-muted-foreground" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function ProfileSection() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name ?? "");
  const updateMutation = trpc.settings.updateProfile.useMutation({
    onSuccess: () => toast.success("Profile updated"),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Profile</h2>
        <p className="text-xs text-muted-foreground">Manage your account identity and personal information.</p>
      </div>

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-foreground/10 border border-border flex items-center justify-center">
          <span className="text-lg font-mono font-semibold">
            {(user?.name ?? "U").split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2)}
          </span>
        </div>
        <div>
          <div className="text-sm font-medium">{user?.name ?? "Operator"}</div>
          <div className="text-xs font-mono text-muted-foreground">{user?.email ?? "—"}</div>
          <button
            type="button"
            disabled
            title="Avatar upload is not configured yet"
            className="text-xs text-muted-foreground mt-1 transition-colors opacity-50 cursor-not-allowed"
          >
            Change avatar
          </button>
        </div>
      </div>

      <div className="aegis-divider" />

      {/* Form */}
      <div className="space-y-4 max-w-md">
        <div>
          <label className="mono-label mb-1.5 block">Display Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-input border border-border rounded-md px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring w-full transition-colors"
          />
        </div>
        <div>
          <label className="mono-label mb-1.5 block">Email Address</label>
          <input
            value={user?.email ?? ""}
            disabled
            className="bg-muted border border-border rounded-md px-3 py-2 text-sm text-muted-foreground w-full cursor-not-allowed"
          />
          <p className="text-[11px] font-mono text-muted-foreground mt-1">From your account session</p>
        </div>
        <div>
          <label className="mono-label mb-1.5 block">Account Role</label>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-md">
            <ShieldCheck size={13} className="text-muted-foreground" />
            <span className="text-sm font-mono text-muted-foreground capitalize">{user?.role ?? "user"}</span>
          </div>
        </div>
        <button
          onClick={() => updateMutation.mutate({ name })}
          disabled={updateMutation.isPending}
          className="flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-xs font-semibold hover:bg-foreground/90 transition-all disabled:opacity-50"
        >
          <Save size={12} />
          Save Changes
        </button>
      </div>
    </div>
  );
}

function SecuritySection() {
  const items = [
    {
      icon: Key,
      label: "Change Password",
      description: "Update your account password",
      action: "Configure",
      title: "Password change is not wired for this auth method yet",
    },
    {
      icon: Smartphone,
      label: "Two-Factor Authentication",
      description: "Add an extra layer of security",
      action: "Enable",
      title: "Enable MFA from the API or a dedicated security flow when exposed here",
    },
    {
      icon: Lock,
      label: "Session Management",
      description: "View and revoke active sessions",
      action: "Manage",
      title: "Open session tools when available",
    },
    {
      icon: Shield,
      label: "Export Encrypted Backup",
      description: "Download an encrypted backup of your data",
      action: "Export",
      title: "Backup export is not implemented in this UI yet",
    },
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Security</h2>
        <p className="text-xs text-muted-foreground">Manage authentication, sessions, and access controls.</p>
      </div>

      <div className="space-y-3">
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="aegis-card flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-foreground/5 border border-border flex items-center justify-center shrink-0">
                  <Icon size={14} className="text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
              </div>
              <button
                type="button"
                disabled
                title={item.title}
                className="shrink-0 px-3 py-1.5 rounded-md border border-border text-xs font-mono text-muted-foreground opacity-50 cursor-not-allowed"
              >
                {item.action}
              </button>
            </div>
          );
        })}
      </div>

      <div className="aegis-divider" />

      <div className="aegis-card">
        <div className="mono-label mb-3">Security Status</div>
        <div className="space-y-2">
          {[
            { label: "Session auth", status: "Active", ok: true },
            { label: "Session Encryption", status: "Enabled", ok: true },
            { label: "E2E Messaging", status: "Active", ok: true },
            { label: "2FA", status: "Not configured", ok: false },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <span className="text-xs font-mono text-muted-foreground">{item.label}</span>
              <span className={`text-xs font-mono ${item.ok ? "text-aegis-green" : "text-aegis-gold"}`}>
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState({
    priceAlerts: true,
    agentUpdates: true,
    messages: true,
    portfolioSummary: false,
    marketEvents: true,
    systemAlerts: true,
  });

  const toggle = (key: keyof typeof prefs) => {
    setPrefs((p) => ({ ...p, [key]: !p[key] }));
    toast.success("Notification preference updated");
  };

  const items = [
    { key: "priceAlerts" as const, label: "Price Alerts", description: "BTC, ETH, SOL price threshold notifications" },
    { key: "agentUpdates" as const, label: "Agent Updates", description: "Notifications when AI agents complete analysis" },
    { key: "messages" as const, label: "New Messages", description: "Encrypted message arrival notifications" },
    { key: "portfolioSummary" as const, label: "Daily Portfolio Summary", description: "End-of-day portfolio performance report" },
    { key: "marketEvents" as const, label: "Market Events", description: "Major market events and breaking news" },
    { key: "systemAlerts" as const, label: "System Alerts", description: "Security and system status notifications" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Notifications</h2>
        <p className="text-xs text-muted-foreground">Configure alerts, updates, and notification preferences.</p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.key} className="aegis-card flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.description}</div>
            </div>
            <ToggleSwitch enabled={prefs[item.key]} onChange={() => toggle(item.key)} />
          </div>
        ))}
      </div>
    </div>
  );
}

const SETTINGS_CHAIN_META: Record<string, { icon: string; color: string }> = {
  BTC: { icon: "₿", color: "oklch(0.78 0.12 85)" },
  ETH: { icon: "Ξ", color: "oklch(0.65 0.15 240)" },
  SOL: { icon: "◎", color: "oklch(0.72 0.12 195)" },
};

function TradingConnectionsSection() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.trading.listStatus.useQuery(undefined, { staleTime: 30_000 });

  const [editId, setEditId] = useState<number | null>(null);
  const [assetClass, setAssetClass] = useState<BrokerAssetClass>("crypto");
  const [venue, setVenue] = useState<string>("binance");
  const [environment, setEnvironment] = useState<"paper" | "live">("paper");
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [passphrase, setPassphrase] = useState("");
  const [baseUrlOverride, setBaseUrlOverride] = useState("");

  const resetForm = () => {
    setEditId(null);
    setLabel("");
    setApiKey("");
    setApiSecret("");
    setPassphrase("");
    setBaseUrlOverride("");
  };

  const setModeMut = trpc.trading.setExecutionMode.useMutation({
    onSuccess: () => {
      utils.trading.listStatus.invalidate();
      toast.success("Execution mode saved");
    },
    onError: () => toast.error("Could not save execution mode"),
  });
  const saveMut = trpc.trading.saveConnection.useMutation({
    onSuccess: () => {
      utils.trading.listStatus.invalidate();
      toast.success("Broker connection saved");
      resetForm();
    },
    onError: (e) => toast.error(e.message ?? "Save failed"),
  });
  const deleteMut = trpc.trading.deleteConnection.useMutation({
    onSuccess: () => {
      utils.trading.listStatus.invalidate();
      toast.success("Connection removed");
    },
    onError: () => toast.error("Could not remove connection"),
  });

  useEffect(() => {
    const venues = BROKER_VENUE_BY_CLASS[assetClass];
    setVenue((v) => (venues.includes(v) ? v : venues[0] ?? "custom"));
  }, [assetClass]);

  const startEdit = (id: number) => {
    const row = data?.connections.find((c) => c.id === id);
    if (!row) return;
    setEditId(id);
    setAssetClass(row.assetClass);
    setVenue(row.venue);
    setEnvironment(row.environment);
    setLabel(row.label ?? "");
    setApiKey("");
    setApiSecret("");
    setPassphrase("");
    setBaseUrlOverride("");
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!apiKey.trim()) {
      toast.error("API key is required");
      return;
    }
    saveMut.mutate({
      ...(editId != null ? { id: editId } : {}),
      assetClass,
      venue,
      label: label.trim() || undefined,
      environment,
      credentials: {
        apiKey: apiKey.trim(),
        ...(apiSecret.trim() ? { apiSecret: apiSecret.trim() } : {}),
        ...(passphrase.trim() ? { passphrase: passphrase.trim() } : {}),
        ...(baseUrlOverride.trim() ? { baseUrlOverride: baseUrlOverride.trim() } : {}),
      },
    });
  };

  const modes = [
    {
      id: "backtest" as const,
      title: "Backtest",
      body: "Simulated fills using historical-style logic. No broker keys required.",
    },
    {
      id: "paper" as const,
      title: "Paper",
      body: "Use sandbox / paper API endpoints. Store paper API keys below.",
    },
    {
      id: "live" as const,
      title: "Live",
      body: "Real accounts and production API keys. Highest risk — use least-privilege keys.",
    },
  ];

  return (
    <div className="space-y-8 max-w-2xl">
      <div>
        <h2 className="text-base font-semibold mb-1">Trading connections</h2>
        <p className="text-xs text-muted-foreground">
          Add API keys only from brokers or exchanges that allow programmatic access. Keys are encrypted at rest (AES-256-GCM)
          like other sensitive data. They are never shown again after you save — re-enter to rotate.
        </p>
      </div>

      <div className="space-y-3">
        <div className="mono-label">Default execution mode</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {modes.map((m) => {
            const active = data?.defaultMode === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setModeMut.mutate({ defaultMode: m.id })}
                disabled={setModeMut.isPending || isLoading}
                className={`text-left rounded-lg border px-3 py-2.5 transition-colors ${
                  active ? "border-foreground/50 bg-accent" : "border-border hover:border-foreground/25"
                }`}
              >
                <div className="text-sm font-medium">{m.title}</div>
                <p className="text-[11px] text-muted-foreground mt-1 leading-snug">{m.body}</p>
              </button>
            );
          })}
        </div>
      </div>

      {data && data.defaultMode !== "backtest" && (
        <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-[11px] font-mono text-muted-foreground">
          <span className="text-foreground/90">Coverage ({data.defaultMode})</span>
          {": "}
          {BROKER_ASSET_CLASSES.map((ac) => (
            <span key={ac} className="inline-flex items-center gap-0.5 mr-2">
              {ASSET_CLASS_LABELS[ac]} {data.coverage[ac] ? "✓" : "—"}
            </span>
          ))}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="mono-label">Saved connections</div>
        </div>
        {isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : !data?.connections.length ? (
          <p className="text-xs text-muted-foreground">No broker connections yet.</p>
        ) : (
          <div className="space-y-2">
            {data.connections.map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs"
              >
                <div>
                  <span className="font-medium text-foreground">{ASSET_CLASS_LABELS[c.assetClass as BrokerAssetClass]}</span>
                  <span className="text-muted-foreground"> · {c.venue} · {c.environment}</span>
                  {c.keyHintSuffix ? (
                    <span className="font-mono text-muted-foreground"> · key {c.keyHintSuffix}</span>
                  ) : null}
                  {c.label ? <span className="text-muted-foreground"> · {c.label}</span> : null}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => startEdit(c.id)}
                    className="px-2 py-1 rounded border border-border text-[11px] hover:bg-accent"
                  >
                    Replace keys
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm("Remove this broker connection?")) deleteMut.mutate({ id: c.id });
                    }}
                    className="p-1.5 rounded border border-border text-muted-foreground hover:text-destructive"
                    title="Remove"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-4 aegis-card">
        <div className="mono-label">{editId != null ? `Update connection #${editId}` : "Add connection"}</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-mono text-muted-foreground block mb-1">Asset class</label>
            <select
              value={assetClass}
              onChange={(e) => setAssetClass(e.target.value as BrokerAssetClass)}
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm"
            >
              {BROKER_ASSET_CLASSES.map((ac) => (
                <option key={ac} value={ac}>
                  {ASSET_CLASS_LABELS[ac]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[11px] font-mono text-muted-foreground block mb-1">Venue</label>
            <select
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm"
            >
              {BROKER_VENUE_BY_CLASS[assetClass].map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[11px] font-mono text-muted-foreground block mb-1">Environment</label>
            <select
              value={environment}
              onChange={(e) => setEnvironment(e.target.value as "paper" | "live")}
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm"
            >
              <option value="paper">Paper / sandbox</option>
              <option value="live">Live / production</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] font-mono text-muted-foreground block mb-1">Label (optional)</label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="My Alpaca paper"
              className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm"
              maxLength={128}
            />
          </div>
        </div>
        <div>
          <label className="text-[11px] font-mono text-muted-foreground block mb-1">API key</label>
          <input
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={editId != null ? "Required to replace stored key" : "Required"}
            className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] font-mono text-muted-foreground block mb-1">API secret (optional)</label>
          <input
            type="password"
            autoComplete="off"
            value={apiSecret}
            onChange={(e) => setApiSecret(e.target.value)}
            className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] font-mono text-muted-foreground block mb-1">Passphrase (optional, some exchanges)</label>
          <input
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-[11px] font-mono text-muted-foreground block mb-1">Base URL override (optional)</label>
          <input
            value={baseUrlOverride}
            onChange={(e) => setBaseUrlOverride(e.target.value)}
            placeholder="https://…"
            className="w-full bg-muted border border-border rounded-md px-3 py-2 text-sm font-mono"
          />
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={saveMut.isPending}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-foreground text-background text-xs font-medium disabled:opacity-50"
          >
            <Save size={12} />
            {saveMut.isPending ? "Saving…" : "Save connection"}
          </button>
          {editId != null && (
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-md border border-border text-xs">
              Cancel edit
            </button>
          )}
        </div>
      </form>
    </div>
  );
}

function WalletsSection() {
  const [, setLocation] = useLocation();
  const { data: wallets, isLoading } = trpc.wallet.getWallets.useQuery();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Connected Wallets</h2>
        <p className="text-xs text-muted-foreground">Addresses saved for your account. Full management lives on the Wallets page.</p>
      </div>
      {isLoading ? (
        <p className="text-xs font-mono text-muted-foreground">Loading wallets…</p>
      ) : !wallets || wallets.length === 0 ? (
        <div className="aegis-card text-sm text-muted-foreground">
          No wallet addresses on file yet.{" "}
          <button
            type="button"
            onClick={() => setLocation("/wallets")}
            className="text-foreground underline-offset-2 hover:underline font-medium"
          >
            Go to Wallets
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map((w) => {
            const meta = SETTINGS_CHAIN_META[w.chain] ?? { icon: "?", color: "oklch(0.5 0 0)" };
            return (
              <div key={w.id} className="aegis-card">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-base font-bold shrink-0"
                      style={{ background: `${meta.color}18`, color: meta.color }}
                    >
                      {meta.icon}
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{w.label || `${w.chain} wallet`}</div>
                      <div className="mono-label">{w.chain} Network</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-mono text-aegis-green">Saved</span>
                    <button
                      type="button"
                      onClick={() => setLocation("/wallets")}
                      className="px-2.5 py-1 rounded border border-border text-[11px] font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
                    >
                      Manage
                    </button>
                  </div>
                </div>
                <div className="mt-3 pt-3 border-t border-border">
                  <div className="mono-label mb-1">Address</div>
                  <div className="text-xs font-mono text-muted-foreground break-all">{w.address}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <button
        type="button"
        onClick={() => setLocation("/wallets")}
        className="flex items-center gap-2 px-4 py-2 rounded-md border border-border text-xs font-mono text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-all"
      >
        <Bitcoin size={12} />
        Add or edit wallets
      </button>
    </div>
  );
}

function AgentsSection() {
  const [prefs, setPrefs] = useState({
    autoRun: false,
    scheduleDaily: true,
    detailedOutput: true,
    alertOnComplete: true,
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Agent Preferences</h2>
        <p className="text-xs text-muted-foreground">Configure AI agent behavior, schedules, and output settings.</p>
      </div>
      <div className="space-y-3">
        {[
          { key: "autoRun" as const, label: "Auto-Run on Login", description: "Automatically activate all agents when you sign in" },
          { key: "scheduleDaily" as const, label: "Daily Scheduled Analysis", description: "Run all agents once per day at market open" },
          { key: "detailedOutput" as const, label: "Detailed Structured Output", description: "Show full JSON output from agents" },
          { key: "alertOnComplete" as const, label: "Alert on Completion", description: "Notify when an agent finishes analysis" },
        ].map((item) => (
          <div key={item.key} className="aegis-card flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.description}</div>
            </div>
            <ToggleSwitch
              enabled={prefs[item.key]}
              onChange={() => setPrefs((p) => ({ ...p, [item.key]: !p[item.key] }))}
              disabled
            />
          </div>
        ))}
      </div>
      <p className="text-[11px] font-mono text-muted-foreground">
        Agent preferences are not persisted to the server yet; controls are disabled until a settings API exists.
      </p>
    </div>
  );
}

function DisplaySection() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold mb-1">Display</h2>
        <p className="text-xs text-muted-foreground">Interface appearance and layout preferences.</p>
      </div>
      <div className="space-y-4">
        <div>
          <div className="mono-label mb-2">Theme</div>
          <div className="flex gap-3">
            {["Dark (Default)", "Darker", "Midnight"].map((t, i) => (
              <button
                key={t}
                type="button"
                disabled={i !== 0}
                title={i === 0 ? undefined : "Additional themes are not implemented yet"}
                className={`px-4 py-2 rounded-md border text-xs font-mono transition-all ${
                  i === 0
                    ? "border-foreground/40 text-foreground bg-foreground/5"
                    : "border-border text-muted-foreground opacity-50 cursor-not-allowed"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mono-label mb-2">Language & Region</div>
          <div className="flex items-center gap-2 px-3 py-2 bg-muted border border-border rounded-md max-w-xs">
            <Globe size={13} className="text-muted-foreground" />
            <span className="text-sm text-muted-foreground">English (US) · UTC</span>
          </div>
        </div>
        <div>
          <div className="mono-label mb-2">Data Refresh Interval</div>
          <div className="flex gap-2">
            {["30s", "1m", "5m", "15m"].map((t, i) => (
              <button
                key={t}
                type="button"
                disabled
                title="Refresh interval is not user-configurable yet (app uses fixed intervals)"
                className={`px-3 py-1.5 rounded border text-xs font-mono transition-all opacity-50 cursor-not-allowed border-border text-muted-foreground ${
                  i === 1 ? "border-foreground/25" : ""
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<SettingsSection>("profile");

  const renderSection = () => {
    switch (activeSection) {
      case "profile": return <ProfileSection />;
      case "security": return <SecuritySection />;
      case "notifications": return <NotificationsSection />;
      case "wallets": return <WalletsSection />;
      case "trading": return <TradingConnectionsSection />;
      case "agents": return <AgentsSection />;
      case "display": return <DisplaySection />;
    }
  };

  return (
    <div className="h-full flex flex-col animate-fade-up">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border shrink-0">
        <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
        <p className="text-xs text-muted-foreground font-mono mt-0.5">
          Account, security, and platform configuration
        </p>
      </div>

      {/* Body */}
      <div className="flex flex-1 overflow-hidden">
        <SectionNav active={activeSection} onSelect={setActiveSection} />
        <div className="flex-1 overflow-y-auto p-6">
          {renderSection()}
        </div>
      </div>
    </div>
  );
}
