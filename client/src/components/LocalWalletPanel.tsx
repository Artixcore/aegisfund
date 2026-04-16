import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  bitcoinAdapter,
  DEFAULT_WALLET_SETTINGS,
  deleteVault,
  ethereumAdapter,
  solanaAdapter,
  generateWalletMnemonic12,
  getVaultWrapped,
  getWalletSettings,
  listLocalTxs,
  openChainWalletDb,
  putLocalTx,
  putVaultWrapped,
  putWalletSettings,
  unwrapMnemonic,
  validateWalletMnemonic,
  walletSessionClear,
  walletSessionGetMnemonic,
  walletSessionSetMnemonic,
  wrapMnemonic,
  addressesForSettings,
  type LocalTxRecord,
  type WalletSettings,
} from "@/wallet";
import { Copy, ExternalLink, Loader2, Lock, QrCode, RefreshCw, Shield } from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

function explorerTxUrl(chain: "ethereum" | "bitcoin" | "solana", txHash: string, settings: WalletSettings): string {
  if (chain === "ethereum") {
    return settings.ethNetwork === "sepolia"
      ? `https://sepolia.etherscan.io/tx/${txHash}`
      : `https://etherscan.io/tx/${txHash}`;
  }
  if (chain === "bitcoin") {
    return settings.btcNetwork === "testnet"
      ? `https://blockstream.info/testnet/tx/${txHash}`
      : `https://blockstream.info/tx/${txHash}`;
  }
  return settings.solNetwork === "devnet"
    ? `https://solscan.io/tx/${txHash}?cluster=devnet`
    : `https://solscan.io/tx/${txHash}`;
}

export default function LocalWalletPanel() {
  const [wdb, setWdb] = useState<IDBDatabase | null>(null);
  const [hasVault, setHasVault] = useState(false);
  const [settings, setSettings] = useState<WalletSettings>({ ...DEFAULT_WALLET_SETTINGS });
  const [unlockPass, setUnlockPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmMnemonic, setConfirmMnemonic] = useState("");
  const [importMnemonic, setImportMnemonic] = useState("");
  const [phase, setPhase] = useState<"none" | "create" | "import">("none");
  const [busy, setBusy] = useState(false);
  const [balances, setBalances] = useState<{ eth?: string; btc?: string; sol?: string; err?: string }>({});
  const [addrs, setAddrs] = useState<{ ethereum?: string; bitcoin?: string; solana?: string }>({});
  const [qrEth, setQrEth] = useState<string | null>(null);
  const [qrSol, setQrSol] = useState<string | null>(null);
  const [sendChain, setSendChain] = useState<"ethereum" | "bitcoin" | "solana">("ethereum");
  const [sendTo, setSendTo] = useState("");
  const [sendAmt, setSendAmt] = useState("");
  const [feeHint, setFeeHint] = useState("");
  const [txs, setTxs] = useState<LocalTxRecord[]>([]);
  const sessionMnemonic = walletSessionGetMnemonic();

  const refreshTxs = useCallback(async (db: IDBDatabase) => {
    setTxs(await listLocalTxs(db));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await openChainWalletDb();
        if (cancelled) return;
        setWdb(db);
        const v = await getVaultWrapped(db);
        setHasVault(!!v);
        const s = await getWalletSettings(db);
        setSettings({ ...DEFAULT_WALLET_SETTINGS, ...s });
        await refreshTxs(db);
      } catch (e) {
        console.error(e);
        toast.error("Could not open local wallet database");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshTxs]);

  const refreshBalances = async () => {
    const m = walletSessionGetMnemonic();
    if (!m || !wdb) return;
    setBusy(true);
    setBalances({});
    try {
      const s = await getWalletSettings(wdb);
      const ethB = await ethereumAdapter.getBalance(m, s.accountIndex, s);
      const btcB = await bitcoinAdapter.getBalance(m, s.accountIndex, s);
      let solFormatted = "—";
      try {
        if (s.solRpcUrl.trim()) {
          const solB = await solanaAdapter.getBalance(m, s.accountIndex, s);
          solFormatted = solB.formatted;
        }
      } catch {
        solFormatted = "—";
      }
      const a = await addressesForSettings(m, s);
      setAddrs({ ethereum: a.ethereum, bitcoin: a.bitcoin, solana: a.solana });
      setBalances({ eth: ethB.formatted, btc: btcB.formatted, sol: solFormatted });
      const ethQr = await QRCode.toDataURL(a.ethereum, { width: 160, margin: 1, errorCorrectionLevel: "M" });
      setQrEth(ethQr);
      if (a.solana) {
        const solQr = await QRCode.toDataURL(a.solana, { width: 160, margin: 1, errorCorrectionLevel: "M" });
        setQrSol(solQr);
      } else setQrSol(null);
    } catch (e) {
      setBalances({ err: String(e) });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (sessionMnemonic && wdb) void refreshBalances();
  }, [sessionMnemonic, wdb]);

  const saveSettings = async () => {
    if (!wdb) return;
    await putWalletSettings(wdb, settings);
    toast.success("Settings saved");
    if (sessionMnemonic) void refreshBalances();
  };

  const onCreateStart = () => {
    setPhase("create");
    setConfirmMnemonic("");
    setNewPass("");
    setImportMnemonic(generateWalletMnemonic12());
  };

  const onCreateFinish = async () => {
    if (!wdb || !importMnemonic.trim()) return;
    if (!validateWalletMnemonic(importMnemonic.trim())) {
      toast.error("Invalid mnemonic");
      return;
    }
    if (importMnemonic.trim().split(/\s+/).join(" ") !== confirmMnemonic.trim().split(/\s+/).join(" ")) {
      toast.error("Confirmation does not match mnemonic");
      return;
    }
    if (!newPass.trim()) {
      toast.error("Choose a passphrase");
      return;
    }
    setBusy(true);
    try {
      const wrapped = await wrapMnemonic(importMnemonic.trim(), newPass.trim());
      await putVaultWrapped(wdb, wrapped);
      setHasVault(true);
      walletSessionSetMnemonic(importMnemonic.trim());
      setPhase("none");
      setUnlockPass("");
      setConfirmMnemonic("");
      setNewPass("");
      toast.success("Local wallet created — keys stay on this device");
      await refreshBalances();
    } catch {
      toast.error("Could not save wallet");
    } finally {
      setBusy(false);
    }
  };

  const onImportFinish = async () => {
    if (!wdb || !importMnemonic.trim() || !newPass.trim()) return;
    if (!validateWalletMnemonic(importMnemonic.trim())) {
      toast.error("Invalid mnemonic");
      return;
    }
    setBusy(true);
    try {
      const wrapped = await wrapMnemonic(importMnemonic.trim(), newPass.trim());
      await putVaultWrapped(wdb, wrapped);
      setHasVault(true);
      walletSessionSetMnemonic(importMnemonic.trim());
      setPhase("none");
      setImportMnemonic("");
      setNewPass("");
      setUnlockPass("");
      toast.success("Wallet imported");
      await refreshBalances();
    } catch {
      toast.error("Could not import");
    } finally {
      setBusy(false);
    }
  };

  const onUnlock = async () => {
    if (!wdb || !unlockPass.trim()) return;
    const wrapped = await getVaultWrapped(wdb);
    if (!wrapped) {
      toast.error("No wallet vault");
      return;
    }
    setBusy(true);
    try {
      const m = await unwrapMnemonic(wrapped, unlockPass.trim());
      walletSessionSetMnemonic(m);
      setUnlockPass("");
      toast.success("Wallet unlocked for this session");
      await refreshBalances();
    } catch {
      toast.error("Wrong passphrase");
    } finally {
      setBusy(false);
    }
  };

  const onLock = () => {
    walletSessionClear();
    setBalances({});
    setAddrs({});
    setQrEth(null);
    setQrSol(null);
    toast.message("Session cleared — passphrase required again to sign");
  };

  const onDeleteWallet = async () => {
    if (!wdb) return;
    if (!window.confirm("Delete local wallet from this browser? You must have your mnemonic backup.")) return;
    await deleteVault(wdb);
    walletSessionClear();
    setHasVault(false);
    setBalances({});
    setAddrs({});
    setQrEth(null);
    setQrSol(null);
    toast.success("Local vault removed");
  };

  const estimateFee = async () => {
    const m = walletSessionGetMnemonic();
    if (!m || !wdb || !sendTo.trim() || !sendAmt.trim()) return;
    const s = await getWalletSettings(wdb);
    setBusy(true);
    setFeeHint("");
    try {
      if (sendChain === "ethereum") {
        const r = await ethereumAdapter.estimateNativeSendFee(m, s.accountIndex, s, sendTo.trim(), sendAmt.trim());
        setFeeHint(r.display);
      } else if (sendChain === "bitcoin") {
        const r = await bitcoinAdapter.estimateNativeSendFee(m, s.accountIndex, s, sendTo.trim(), sendAmt.trim());
        setFeeHint(r.display);
      } else {
        const r = await solanaAdapter.estimateNativeSendFee(m, s.accountIndex, s, sendTo.trim(), sendAmt.trim());
        setFeeHint(r.display);
      }
    } catch (e) {
      setFeeHint(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onSend = async () => {
    const m = walletSessionGetMnemonic();
    if (!m || !wdb || !sendTo.trim() || !sendAmt.trim()) return;
    const s = await getWalletSettings(wdb);
    setBusy(true);
    const chainParams = {
      mnemonic: m,
      accountIndex: s.accountIndex,
      to: sendTo.trim(),
      ethRpcUrl: s.ethRpcUrl,
      ethNetwork: s.ethNetwork,
      btcEsploraBase: s.btcEsploraBase,
      btcNetwork: s.btcNetwork,
      solRpcUrl: s.solRpcUrl,
      solNetwork: s.solNetwork,
    };
    try {
      if (sendChain === "ethereum") {
        const res = await ethereumAdapter.signAndBroadcastNativeSend({
          ...chainParams,
          amountEthDecimal: sendAmt.trim(),
        });
        await putLocalTx(wdb, {
          id: crypto.randomUUID(),
          chain: "ethereum",
          txHash: res.txHash,
          amountDisplay: sendAmt.trim(),
          to: sendTo.trim(),
          status: "pending",
          ts: Date.now(),
        });
        toast.success(`Broadcast: ${res.txHash}`);
      } else if (sendChain === "bitcoin") {
        const sats = String(Math.round(Number(sendAmt) * 1e8));
        const res = await bitcoinAdapter.signAndBroadcastNativeSend({
          ...chainParams,
          amountSats: sats,
        });
        await putLocalTx(wdb, {
          id: crypto.randomUUID(),
          chain: "bitcoin",
          txHash: res.txHash,
          amountDisplay: `${sendAmt} BTC`,
          to: sendTo.trim(),
          status: "pending",
          ts: Date.now(),
        });
        toast.success(`Broadcast: ${res.txHash}`);
      } else {
        const res = await solanaAdapter.signAndBroadcastNativeSend({
          ...chainParams,
          amountSolDecimal: sendAmt.trim(),
        });
        await putLocalTx(wdb, {
          id: crypto.randomUUID(),
          chain: "solana",
          txHash: res.txHash,
          amountDisplay: `${sendAmt.trim()} SOL`,
          to: sendTo.trim(),
          status: "pending",
          ts: Date.now(),
        });
        toast.success(`Broadcast: ${res.txHash}`);
      }
      setSendAmt("");
      setFeeHint("");
      await refreshTxs(wdb);
      void refreshBalances();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!wdb) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="animate-spin text-muted-foreground" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="aegis-card p-4 space-y-2 border border-aegis-green/20">
        <div className="flex items-center gap-2 text-aegis-green">
          <Shield size={16} />
          <span className="text-sm font-semibold">Non-custodial · browser-only chain access</span>
        </div>
        <p className="text-xs text-muted-foreground font-mono leading-relaxed">
          Your mnemonic is encrypted locally and never sent to Aegis servers. Set JSON-RPC (ETH, SOL) and Esplora (BTC) URLs that allow browser
          CORS (often a self-hosted node or tunnel). See docs/LOCAL_WALLET.md.
        </p>
      </div>

      {!hasVault ? (
        <div className="aegis-card p-4 space-y-4">
          <p className="text-xs text-muted-foreground">Create a new 12-word wallet or restore from backup.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => void onCreateStart()}>
              Create wallet
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setPhase("import"); setImportMnemonic(""); setNewPass(""); }}>
              Import mnemonic
            </Button>
          </div>
          {phase === "create" && (
            <div className="space-y-3 border border-border rounded-md p-3">
              <Label className="text-xs font-mono">Write down this mnemonic, then type it again to confirm.</Label>
              <textarea
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs font-mono min-h-[72px]"
                readOnly
                value={importMnemonic}
              />
              <Input
                className="font-mono text-xs"
                placeholder="Re-type mnemonic to confirm"
                value={confirmMnemonic}
                onChange={(e) => setConfirmMnemonic(e.target.value)}
              />
              <Input type="password" className="font-mono text-xs" placeholder="Passphrase (encrypts vault)" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              <Button size="sm" disabled={busy} onClick={() => void onCreateFinish()}>
                Save encrypted vault
              </Button>
            </div>
          )}
          {phase === "import" && (
            <div className="space-y-3 border border-border rounded-md p-3">
              <textarea
                className="w-full bg-muted border border-border rounded-md px-3 py-2 text-xs font-mono min-h-[72px]"
                placeholder="12 or 24 words…"
                value={importMnemonic}
                onChange={(e) => setImportMnemonic(e.target.value)}
              />
              <Input type="password" className="font-mono text-xs" placeholder="Passphrase" value={newPass} onChange={(e) => setNewPass(e.target.value)} />
              <Button size="sm" disabled={busy} onClick={() => void onImportFinish()}>
                Import & encrypt
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="aegis-card p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-semibold">Session</span>
              {sessionMnemonic ? (
                <Button size="sm" variant="secondary" onClick={onLock}>
                  <Lock size={14} className="mr-1" />
                  Lock session
                </Button>
              ) : (
                <div className="flex gap-2 flex-wrap items-end w-full sm:w-auto">
                  <Input type="password" className="h-8 text-xs w-full sm:w-48" placeholder="Passphrase" value={unlockPass} onChange={(e) => setUnlockPass(e.target.value)} />
                  <Button size="sm" className="h-8" disabled={busy} onClick={() => void onUnlock()}>
                    Unlock
                  </Button>
                </div>
              )}
            </div>
            <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => void onDeleteWallet()}>
              Delete local vault…
            </Button>
          </div>

          <div className="aegis-card p-4 space-y-3">
            <h3 className="text-sm font-semibold">Endpoints</h3>
            <div className="space-y-2">
              <Label className="text-xs font-mono">ETH JSON-RPC (CORS must allow this origin)</Label>
              <Input className="font-mono text-xs" value={settings.ethRpcUrl} onChange={(e) => setSettings({ ...settings, ethRpcUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono">BTC Esplora base</Label>
              <Input className="font-mono text-xs" value={settings.btcEsploraBase} onChange={(e) => setSettings({ ...settings, btcEsploraBase: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-mono">SOL JSON-RPC (CORS must allow this origin)</Label>
              <Input className="font-mono text-xs" value={settings.solRpcUrl} onChange={(e) => setSettings({ ...settings, solRpcUrl: e.target.value })} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-mono">ETH network</Label>
                <select
                  className="w-full h-8 text-xs bg-muted border border-border rounded-md px-2"
                  value={settings.ethNetwork}
                  onChange={(e) => setSettings({ ...settings, ethNetwork: e.target.value as WalletSettings["ethNetwork"] })}
                >
                  <option value="mainnet">mainnet</option>
                  <option value="sepolia">sepolia</option>
                </select>
              </div>
              <div>
                <Label className="text-xs font-mono">BTC network</Label>
                <select
                  className="w-full h-8 text-xs bg-muted border border-border rounded-md px-2"
                  value={settings.btcNetwork}
                  onChange={(e) => setSettings({ ...settings, btcNetwork: e.target.value as WalletSettings["btcNetwork"] })}
                >
                  <option value="mainnet">mainnet</option>
                  <option value="testnet">testnet</option>
                </select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs font-mono">SOL cluster</Label>
                <select
                  className="w-full h-8 text-xs bg-muted border border-border rounded-md px-2"
                  value={settings.solNetwork}
                  onChange={(e) => setSettings({ ...settings, solNetwork: e.target.value as WalletSettings["solNetwork"] })}
                >
                  <option value="mainnet-beta">mainnet-beta</option>
                  <option value="devnet">devnet</option>
                </select>
              </div>
            </div>
            <div>
              <Label className="text-xs font-mono">Account index (BIP44)</Label>
              <Input
                type="number"
                min={0}
                className="h-8 text-xs"
                value={settings.accountIndex}
                onChange={(e) => setSettings({ ...settings, accountIndex: Math.max(0, parseInt(e.target.value, 10) || 0) })}
              />
            </div>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void saveSettings()}>
              Save settings
            </Button>
          </div>

          {sessionMnemonic && (
            <div className="aegis-card p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Receive</h3>
                <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={busy} onClick={() => void refreshBalances()}>
                  <RefreshCw size={14} className={busy ? "animate-spin" : ""} />
                </Button>
              </div>
              {balances.err && <p className="text-xs text-destructive font-mono">{balances.err}</p>}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs font-mono">
                <div>
                  <div className="text-muted-foreground mb-1">Ethereum</div>
                  <div className="break-all">{addrs.ethereum ?? "—"}</div>
                  <div className="text-aegis-green mt-1">{balances.eth ?? "—"}</div>
                  {addrs.ethereum && (
                    <button
                      type="button"
                      className="mt-1 text-muted-foreground hover:text-foreground"
                      onClick={() => void navigator.clipboard.writeText(addrs.ethereum!)}
                    >
                      <Copy size={12} className="inline" /> copy
                    </button>
                  )}
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Bitcoin</div>
                  <div className="break-all">{addrs.bitcoin ?? "—"}</div>
                  <div className="text-aegis-green mt-1">{balances.btc ?? "—"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground mb-1">Solana</div>
                  <div className="break-all">{addrs.solana ?? "—"}</div>
                  <div className="text-aegis-green mt-1">{balances.sol ?? "—"}</div>
                  {addrs.solana && (
                    <button
                      type="button"
                      className="mt-1 text-muted-foreground hover:text-foreground"
                      onClick={() => void navigator.clipboard.writeText(addrs.solana!)}
                    >
                      <Copy size={12} className="inline" /> copy
                    </button>
                  )}
                </div>
              </div>
              {(qrEth || qrSol) && (
                <div className="flex flex-wrap items-start gap-4 text-xs text-muted-foreground">
                  {qrEth && (
                    <div className="flex items-center gap-2">
                      <QrCode size={14} />
                      <img src={qrEth} alt="ETH QR" className="rounded border border-border w-[120px] h-[120px]" />
                    </div>
                  )}
                  {qrSol && (
                    <div className="flex items-center gap-2">
                      <QrCode size={14} />
                      <img src={qrSol} alt="SOL QR" className="rounded border border-border w-[120px] h-[120px]" />
                    </div>
                  )}
                </div>
              )}

              <div className="border-t border-border pt-4 space-y-2">
                <h3 className="text-sm font-semibold">Send</h3>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant={sendChain === "ethereum" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setSendChain("ethereum")}>
                    ETH
                  </Button>
                  <Button size="sm" variant={sendChain === "bitcoin" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setSendChain("bitcoin")}>
                    BTC
                  </Button>
                  <Button size="sm" variant={sendChain === "solana" ? "default" : "outline"} className="h-8 text-xs" onClick={() => setSendChain("solana")}>
                    SOL
                  </Button>
                </div>
                <Input className="font-mono text-xs" placeholder="To address" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
                <Input
                  className="font-mono text-xs"
                  placeholder={sendChain === "ethereum" ? "Amount (ETH)" : sendChain === "bitcoin" ? "Amount (BTC)" : "Amount (SOL)"}
                  value={sendAmt}
                  onChange={(e) => setSendAmt(e.target.value)}
                />
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button size="sm" variant="secondary" className="h-8 text-xs w-full sm:w-auto" disabled={busy} onClick={() => void estimateFee()}>
                    Estimate fee
                  </Button>
                  <Button size="sm" className="h-8 text-xs w-full sm:w-auto" disabled={busy} onClick={() => void onSend()}>
                    Sign & broadcast
                  </Button>
                </div>
                {feeHint && <p className="text-[10px] font-mono text-muted-foreground">{feeHint}</p>}
              </div>
            </div>
          )}

          <div className="aegis-card p-4">
            <h3 className="text-sm font-semibold mb-2">Local activity</h3>
            {txs.length === 0 ? (
              <p className="text-xs text-muted-foreground font-mono">No transactions recorded yet</p>
            ) : (
              <ul className="space-y-2 text-xs font-mono">
                {txs.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center gap-2 border-b border-border/40 pb-2">
                    <span className="text-muted-foreground">{t.chain}</span>
                    <a
                      className="text-sky-400 hover:underline inline-flex items-center gap-1"
                      href={explorerTxUrl(t.chain, t.txHash, settings)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {t.txHash.slice(0, 18)}… <ExternalLink size={10} />
                    </a>
                    <span>{t.amountDisplay}</span>
                    <span className="text-muted-foreground">{t.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
