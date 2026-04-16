import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  generateEd25519KeypairHex,
  publicKeyMatchesPrivateKeyHex,
  signUtf8MessageHex,
} from "@/lib/dappAuth";
import { trpc } from "@/lib/trpc";
import { addressesForSettings } from "@/wallet/derive";
import { generateWalletMnemonic12 } from "@/wallet/index";
import type { BtcNetworkId } from "@/wallet/types";
import { DAPP_UNKNOWN_ACCOUNT_MSG } from "@shared/const";
import { buildDappRegisterReceiveMessage, ed25519KeyHex64Schema } from "@shared/dappAuth";
import { TRPCClientError } from "@trpc/client";
import { Copy, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";

async function copyText(label: string, text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    window.prompt(`Copy ${label}:`, text);
  }
}

export default function Login() {
  const { isAuthenticated, loading, refresh } = useAuth();
  const [, navigate] = useLocation();
  const gate = trpc.auth.registrationGate.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const [tab, setTab] = useState<"signin" | "create">("signin");
  const [publicHex, setPublicHex] = useState("");
  const [privateHex, setPrivateHex] = useState("");
  const [signInError, setSignInError] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);

  const [genPublic, setGenPublic] = useState("");
  const [genPrivate, setGenPrivate] = useState("");
  const [genMnemonic, setGenMnemonic] = useState("");
  const [receiveBtc, setReceiveBtc] = useState("");
  const [receiveEth, setReceiveEth] = useState("");
  const [receiveSol, setReceiveSol] = useState("");
  const [btcNetwork, setBtcNetwork] = useState<BtcNetworkId>("mainnet");
  const [savedConfirm, setSavedConfirm] = useState(false);
  const [savedMnemonicConfirm, setSavedMnemonicConfirm] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const registerMutation = trpc.auth.registerDapp.useMutation();
  const challengeMutation = trpc.auth.loginChallenge.useMutation();
  const loginMutation = trpc.auth.loginWithSignature.useMutation();

  const hideCreate = Boolean(gate.data?.priorRegistrationOnThisNetwork);

  useEffect(() => {
    if (hideCreate && tab === "create") {
      setTab("signin");
    }
  }, [hideCreate, tab]);

  useEffect(() => {
    if (!loading && isAuthenticated) {
      navigate("/dashboard");
    }
  }, [isAuthenticated, loading, navigate]);

  useEffect(() => {
    if (!genMnemonic) return;
    let cancelled = false;
    void addressesForSettings(genMnemonic, { accountIndex: 0, btcNetwork }).then((a) => {
      if (!cancelled) {
        setReceiveBtc(a.bitcoin);
        setReceiveEth(a.ethereum);
        setReceiveSol(a.solana);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [btcNetwork, genMnemonic]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Shield size={28} className="text-muted-foreground animate-pulse" />
      </div>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Shield size={28} className="text-muted-foreground animate-pulse" />
      </div>
    );
  }

  const onSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setSignInError(null);
    setSignInBusy(true);
    try {
      const pub = ed25519KeyHex64Schema.safeParse(publicHex);
      const priv = ed25519KeyHex64Schema.safeParse(privateHex);
      if (!pub.success || !priv.success) {
        setSignInError("Enter valid 64-character hex keys (a–f, 0–9).");
        return;
      }
      const match = await publicKeyMatchesPrivateKeyHex(pub.data, priv.data);
      if (!match) {
        setSignInError("Private key does not match this public key.");
        return;
      }
      const challenge = await challengeMutation.mutateAsync({ publicKeyHex: pub.data });
      const signatureHex = await signUtf8MessageHex(challenge.message, priv.data);
      await loginMutation.mutateAsync({
        publicKeyHex: pub.data,
        challengeToken: challenge.challengeToken,
        signatureHex,
      });
      await refresh();
      navigate("/dashboard");
    } catch (err) {
      if (err instanceof TRPCClientError) {
        setSignInError(err.message);
      } else {
        setSignInError("Sign in failed.");
      }
    } finally {
      setSignInBusy(false);
    }
  };

  const onGenerate = async () => {
    setCreateError(null);
    setSavedConfirm(false);
    setSavedMnemonicConfirm(false);
    setGenMnemonic("");
    setReceiveBtc("");
    setReceiveEth("");
    setReceiveSol("");
    setCreateBusy(true);
    try {
      const pair = await generateEd25519KeypairHex();
      setGenPublic(pair.publicKeyHex);
      setGenPrivate(pair.privateKeyHex);
      const mnemonic = generateWalletMnemonic12();
      setGenMnemonic(mnemonic);
      const addrs = await addressesForSettings(mnemonic, {
        accountIndex: 0,
        btcNetwork,
      });
      setReceiveBtc(addrs.bitcoin);
      setReceiveEth(addrs.ethereum);
      setReceiveSol(addrs.solana);
    } catch {
      setCreateError("Could not generate keys. Try again.");
    } finally {
      setCreateBusy(false);
    }
  };

  const onRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!savedConfirm || !savedMnemonicConfirm || !genPublic || !genPrivate || !genMnemonic) {
      setCreateError("Generate keys, save both backups, and confirm both checkboxes.");
      return;
    }
    let addrs: Awaited<ReturnType<typeof addressesForSettings>>;
    try {
      addrs = await addressesForSettings(genMnemonic, {
        accountIndex: 0,
        btcNetwork,
      });
    } catch {
      setCreateError("Could not derive receive addresses. Try generating again.");
      return;
    }
    const receiveMessage = buildDappRegisterReceiveMessage({
      publicKeyHex: genPublic,
      btc: addrs.bitcoin,
      eth: addrs.ethereum,
      sol: addrs.solana,
      btcNetwork,
    });
    setCreateBusy(true);
    try {
      const receiveSignatureHex = await signUtf8MessageHex(receiveMessage, genPrivate);
      await registerMutation.mutateAsync({
        publicKeyHex: genPublic,
        btc: addrs.bitcoin,
        eth: addrs.ethereum,
        sol: addrs.solana,
        btcNetwork,
        receiveSignatureHex,
      });
      setPublicHex(genPublic);
      setPrivateHex(genPrivate);
      setTab("signin");
      setGenPublic("");
      setGenPrivate("");
      setGenMnemonic("");
      setReceiveBtc("");
      setReceiveEth("");
      setReceiveSol("");
      setSavedConfirm(false);
      setSavedMnemonicConfirm(false);
    } catch (err) {
      if (err instanceof TRPCClientError) {
        setCreateError(err.message);
      } else {
        setCreateError("Registration failed.");
      }
    } finally {
      setCreateBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-10">
      <div className="max-w-lg w-full flex flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-foreground/5 border border-border flex items-center justify-center">
            <Shield size={32} className="text-foreground" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-semibold tracking-tight">Aegis Fund</h1>
            <p className="text-xs font-mono text-muted-foreground tracking-widest uppercase mt-1">
              Decentralized access
            </p>
          </div>
        </div>

        {hideCreate ? (
          <p className="text-sm text-muted-foreground text-center leading-relaxed max-w-md">
            This network already has an account. Sign in with your saved keys.
          </p>
        ) : null}

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as "signin" | "create")}
          className="w-full"
        >
          <TabsList className={`grid w-full ${hideCreate ? "grid-cols-1" : "grid-cols-2"}`}>
            <TabsTrigger value="signin">Sign in</TabsTrigger>
            {!hideCreate ? <TabsTrigger value="create">Create account</TabsTrigger> : null}
          </TabsList>

          <TabsContent value="signin" className="mt-6 space-y-4">
            <form onSubmit={onSignIn} className="space-y-4 aegis-card p-6">
              <p className="text-xs text-muted-foreground leading-relaxed">
                Paste your 64-character hex public and private keys. Your private key stays in the
                browser; only a cryptographic signature is sent to the server.
              </p>
              <div className="space-y-2">
                <Label htmlFor="pub">Public key (hex)</Label>
                <Input
                  id="pub"
                  className="font-mono text-xs"
                  value={publicHex}
                  onChange={(e) => setPublicHex(e.target.value.trim())}
                  placeholder="64 hex characters"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="priv">Private key (hex)</Label>
                <Input
                  id="priv"
                  type="password"
                  className="font-mono text-xs"
                  value={privateHex}
                  onChange={(e) => setPrivateHex(e.target.value.trim())}
                  placeholder="64 hex characters"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
              {signInError ? (
                <div className="space-y-2">
                  <p className="text-sm text-destructive">{signInError}</p>
                  {!hideCreate && signInError === DAPP_UNKNOWN_ACCOUNT_MSG ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setTab("create")}
                    >
                      Go to Create account
                    </Button>
                  ) : null}
                </div>
              ) : null}
              <Button type="submit" className="w-full" disabled={signInBusy}>
                {signInBusy ? "Signing in…" : "Sign in"}
              </Button>
            </form>
          </TabsContent>

          {!hideCreate ? (
            <TabsContent value="create" className="mt-6 space-y-4">
              <form onSubmit={onRegister} className="space-y-4 aegis-card p-6">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Keys are generated locally. Your Ed25519 keys sign you in; a separate recovery
                  phrase controls BTC, ETH, and SOL receive addresses. The server never sees your
                  private key or phrase—only your public key and the three addresses, bound by
                  signature.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="btc-net">Bitcoin network (for receive address)</Label>
                  <Select value={btcNetwork} onValueChange={(v) => setBtcNetwork(v as BtcNetworkId)}>
                    <SelectTrigger id="btc-net" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mainnet">Mainnet</SelectItem>
                      <SelectItem value="testnet">Testnet</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => void onGenerate()}
                  disabled={createBusy}
                >
                  {createBusy && !genPublic ? "Generating…" : "Generate keys & receive addresses"}
                </Button>
                {genPublic ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Recovery phrase (BTC / ETH / SOL)</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => void copyText("recovery phrase", genMnemonic)}
                        >
                          <Copy size={12} /> Copy
                        </Button>
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-relaxed">
                        Anyone with this phrase can spend funds sent to your generated receive
                        addresses. Store it offline, separate from your sign-in keys.
                      </p>
                      <Input readOnly className="font-mono text-xs leading-relaxed" value={genMnemonic} />
                    </div>
                    <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-3">
                      <p className="text-[11px] font-medium text-foreground">Generated receive addresses</p>
                      <p className="text-[11px] font-mono break-all text-muted-foreground">
                        BTC: {receiveBtc}
                      </p>
                      <p className="text-[11px] font-mono break-all text-muted-foreground">
                        ETH: {receiveEth}
                      </p>
                      <p className="text-[11px] font-mono break-all text-muted-foreground">
                        SOL: {receiveSol}
                      </p>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Public key</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => void copyText("public key", genPublic)}
                        >
                          <Copy size={12} /> Copy
                        </Button>
                      </div>
                      <Input readOnly className="font-mono text-xs" value={genPublic} />
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <Label>Private key</Label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 gap-1 text-xs"
                          onClick={() => void copyText("private key", genPrivate)}
                        >
                          <Copy size={12} /> Copy
                        </Button>
                      </div>
                      <Input readOnly className="font-mono text-xs" value={genPrivate} type="password" />
                    </div>
                    <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={savedConfirm}
                        onCheckedChange={(c) => setSavedConfirm(c === true)}
                        className="mt-0.5"
                      />
                      <span>I have saved my sign-in keys (public and private) in a safe place.</span>
                    </label>
                    <label className="flex items-start gap-2 text-sm text-muted-foreground cursor-pointer">
                      <Checkbox
                        checked={savedMnemonicConfirm}
                        onCheckedChange={(c) => setSavedMnemonicConfirm(c === true)}
                        className="mt-0.5"
                      />
                      <span>I have saved my recovery phrase in a safe place.</span>
                    </label>
                  </>
                ) : null}
                {createError ? (
                  <p className="text-sm text-destructive">{createError}</p>
                ) : null}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={
                    createBusy ||
                    !savedConfirm ||
                    !savedMnemonicConfirm ||
                    !genPublic ||
                    !genMnemonic
                  }
                >
                  Register account
                </Button>
              </form>
            </TabsContent>
          ) : null}
        </Tabs>

        {import.meta.env.DEV ? (
          <p className="text-[11px] font-mono text-muted-foreground text-center space-x-2">
            <span>
              Dev shortcut:{" "}
              <a className="underline hover:text-foreground" href="/api/auth/dev-login?redirect=/dashboard">
                dev-login
              </a>{" "}
              (requires AUTH_DEV_LOGIN)
            </span>
            <span aria-hidden="true">·</span>
            <a className="underline hover:text-foreground" href="/api/version" target="_blank" rel="noreferrer">
              API version
            </a>
          </p>
        ) : null}
      </div>
    </div>
  );
}
