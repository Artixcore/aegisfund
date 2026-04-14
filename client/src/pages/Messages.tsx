import { useAuth } from "@/_core/hooks/useAuth";
import {
  createFullIdentity,
  deletePeer,
  getBlockedPeerIds,
  getIdentity,
  getPeer,
  identityToInvite,
  listMessagesForPeer,
  listOutboxForPeer,
  listPeers,
  openP2pDb,
  parseInvite,
  peerRecordFromInvite,
  putIdentity,
  putMessage,
  putOutbox,
  putPeer,
  deleteOutbox,
  setBlockedPeerIds,
  type P2pChannelFrame,
  type P2pIdentityRecord,
  type P2pPeerRecord,
  type P2pRtcSession,
  P2pRtcSession as P2pRtcSessionClass,
  ReplayGuard,
  buildOutgoingChat,
  decryptIncomingChat,
  wrapIdentitySecrets,
  unwrapIdentitySecrets,
} from "@/p2p";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  Radio,
  Send,
  Shield,
  Trash2,
  UserPlus,
} from "lucide-react";
import QRCode from "qrcode";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

function formatMessageTime(ts: number) {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}

function isUnlocked(id: P2pIdentityRecord | null): id is P2pIdentityRecord {
  return !!id && !!id.signingSecretB64 && !!id.x25519SecretB64;
}

export default function Messages() {
  const { user } = useAuth();
  const [db, setDb] = useState<IDBDatabase | null>(null);
  const [identity, setIdentity] = useState<P2pIdentityRecord | null>(null);
  const [peers, setPeers] = useState<P2pPeerRecord[]>([]);
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [selectedPeerId, setSelectedPeerId] = useState<string | null>(null);
  const [storedMessages, setStoredMessages] = useState<Awaited<ReturnType<typeof listMessagesForPeer>>>([]);
  const [outboxCount, setOutboxCount] = useState(0);
  const [compose, setCompose] = useState("");
  const [inviteQr, setInviteQr] = useState<string | null>(null);
  const [addPeerJson, setAddPeerJson] = useState("");
  const [lockPw, setLockPw] = useState("");
  const [unlockPw, setUnlockPw] = useState("");
  const [offerOut, setOfferOut] = useState("");
  const [offerIn, setOfferIn] = useState("");
  const [answerOut, setAnswerOut] = useState("");
  const [answerIn, setAnswerIn] = useState("");
  const [rtcConn, setRtcConn] = useState<RTCPeerConnectionState | "new">("new");
  const rtcRef = useRef<P2pRtcSession | null>(null);
  const replayRef = useRef(new ReplayGuard());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshPeers = useCallback(async (database: IDBDatabase) => {
    setPeers(await listPeers(database));
    setBlocked(await getBlockedPeerIds(database));
  }, []);

  const refreshMessages = useCallback(
    async (database: IDBDatabase, peerId: string | null) => {
      if (!peerId) {
        setStoredMessages([]);
        setOutboxCount(0);
        return;
      }
      setStoredMessages(await listMessagesForPeer(database, peerId));
      const ob = await listOutboxForPeer(database, peerId);
      setOutboxCount(ob.length);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const database = await openP2pDb();
        if (cancelled) return;
        setDb(database);
        let id = await getIdentity(database);
        if (!id) {
          id = await createFullIdentity();
          await putIdentity(database, id);
        }
        setIdentity(id);
        await refreshPeers(database);
      } catch (e) {
        console.error(e);
        toast.error("Could not open local P2P store");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshPeers]);

  useEffect(() => {
    if (!db || !selectedPeerId) return;
    void refreshMessages(db, selectedPeerId);
  }, [db, selectedPeerId, refreshMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [storedMessages.length, selectedPeerId]);

  useEffect(() => {
    if (!identity) {
      setInviteQr(null);
      return;
    }
    let cancelled = false;
    const inv = JSON.stringify(identityToInvite(identity));
    QRCode.toDataURL(inv, { width: 200, margin: 1, errorCorrectionLevel: "M" })
      .then((url) => {
        if (!cancelled) setInviteQr(url);
      })
      .catch(() => {
        if (!cancelled) setInviteQr(null);
      });
    return () => {
      cancelled = true;
    };
  }, [identity]);

  const selectedPeer = peers.find((p) => p.peerId === selectedPeerId) ?? null;

  const closeRtc = () => {
    rtcRef.current?.close();
    rtcRef.current = null;
    setRtcConn("new");
  };

  useEffect(() => {
    return () => closeRtc();
  }, []);

  const handleInboundFrame = async (text: string, peer: P2pPeerRecord) => {
    if (!db || !identity || !isUnlocked(identity)) return;
    let frame: P2pChannelFrame;
    try {
      frame = JSON.parse(text) as P2pChannelFrame;
    } catch {
      return;
    }
    if (frame.type !== "chat") return;
    if (blocked.has(peer.peerId)) return;
    const msg = frame.payload;
    const r = replayRef.current.checkAndRecord(msg.fromUserId, msg.id, msg.ts, msg.nonce);
    if (r !== "ok") return;
    try {
      const plain = await decryptIncomingChat(msg, identity, peer);
      await putMessage(db, {
        id: msg.id,
        peerId: peer.peerId,
        direction: "in",
        plaintext: plain,
        ts: msg.ts,
      });
      await refreshMessages(db, peer.peerId);
    } catch (e) {
      console.warn("Decrypt failed", e);
    }
  };

  const drainOutbox = async (session: P2pRtcSession, peerId: string) => {
    if (!db) return;
    const rows = await listOutboxForPeer(db, peerId);
    for (const row of rows) {
      try {
        session.sendJson(JSON.parse(row.frameJson) as object);
        await deleteOutbox(db, row.id);
      } catch {
        break;
      }
    }
    await refreshMessages(db, peerId);
  };

  const startInitiator = async () => {
    if (!selectedPeer || !identity || !isUnlocked(identity)) return;
    closeRtc();
    setOfferOut("");
    setAnswerIn("");
    try {
      const session = new P2pRtcSessionClass({
        isInitiator: true,
        onMessage: (t) => void handleInboundFrame(t, selectedPeer),
        onChannelOpen: () => {
          void drainOutbox(session, selectedPeer.peerId);
          toast.success("P2P channel open");
        },
        onConnectionState: (s) => setRtcConn(s),
      });
      rtcRef.current = session;
      const pkg = await session.createOfferPackage();
      setOfferOut(pkg);
      toast.success("Offer ready — copy to peer (answerer)");
    } catch (e) {
      console.error(e);
      toast.error("Failed to create WebRTC offer");
    }
  };

  const completeInitiator = async () => {
    const session = rtcRef.current;
    if (!session || !answerIn.trim()) {
      toast.error("Paste answer JSON first");
      return;
    }
    try {
      await session.completeWithAnswer(answerIn.trim());
    } catch (e) {
      console.error(e);
      toast.error("Failed to apply answer");
    }
  };

  const runAnswerer = async () => {
    if (!selectedPeer || !identity || !isUnlocked(identity)) return;
    if (!offerIn.trim()) {
      toast.error("Paste offer JSON from initiator");
      return;
    }
    closeRtc();
    setAnswerOut("");
    try {
      const session = new P2pRtcSessionClass({
        isInitiator: false,
        onMessage: (t) => void handleInboundFrame(t, selectedPeer),
        onChannelOpen: () => {
          void drainOutbox(session, selectedPeer.peerId);
          toast.success("P2P channel open");
        },
        onConnectionState: (s) => setRtcConn(s),
      });
      rtcRef.current = session;
      const ans = await session.acceptOffer(offerIn.trim());
      setAnswerOut(ans);
      toast.success("Answer ready — send back to initiator");
    } catch (e) {
      console.error(e);
      toast.error("Failed to answer offer");
    }
  };

  const handleSend = async () => {
    if (!compose.trim() || !db || !selectedPeer || !identity || !isUnlocked(identity)) return;
    const text = compose.trim();
    try {
      const wire = await buildOutgoingChat(identity, selectedPeer, text);
      const frame: P2pChannelFrame = { type: "chat", payload: wire };
      const frameJson = JSON.stringify(frame);
      const session = rtcRef.current;
      if (session?.dc?.readyState === "open") {
        session.sendJson(frame);
      } else {
        await putOutbox(db, {
          id: crypto.randomUUID(),
          peerId: selectedPeer.peerId,
          frameJson,
          createdAt: Date.now(),
          attempts: 0,
        });
        toast.message("Queued — will send when P2P connects");
      }
      await putMessage(db, {
        id: wire.id,
        peerId: selectedPeer.peerId,
        direction: "out",
        plaintext: text,
        ts: wire.ts,
      });
      setCompose("");
      await refreshMessages(db, selectedPeer.peerId);
    } catch {
      toast.error("Send failed");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const copyInvite = async () => {
    if (!identity) return;
    await navigator.clipboard.writeText(JSON.stringify(identityToInvite(identity)));
    toast.success("Invite copied");
  };

  const addPeer = async () => {
    if (!db || !identity || !addPeerJson.trim()) return;
    try {
      const inv = parseInvite(addPeerJson.trim());
      if (inv.userId === identity.userId) {
        toast.error("That invite is your own device");
        return;
      }
      const peer = peerRecordFromInvite(inv);
      await putPeer(db, peer);
      setAddPeerJson("");
      await refreshPeers(db);
      setSelectedPeerId(peer.peerId);
      toast.success("Contact added");
    } catch {
      toast.error("Invalid invite JSON");
    }
  };

  const toggleBlockPeer = async () => {
    if (!db || !selectedPeerId) return;
    const next = new Set(blocked);
    if (next.has(selectedPeerId)) next.delete(selectedPeerId);
    else next.add(selectedPeerId);
    await setBlockedPeerIds(db, [...next]);
    setBlocked(next);
    toast.success(next.has(selectedPeerId) ? "Peer blocked" : "Peer unblocked");
  };

  const removePeer = async () => {
    if (!db || !selectedPeerId) return;
    closeRtc();
    await deletePeer(db, selectedPeerId);
    setSelectedPeerId(null);
    await refreshPeers(db);
    toast.success("Contact removed");
  };

  const lockInbox = async () => {
    if (!db || !identity || !lockPw.trim()) return;
    try {
      const wrapped = await wrapIdentitySecrets(identity, lockPw.trim());
      await putIdentity(db, wrapped);
      setIdentity(wrapped);
      setLockPw("");
      toast.success("P2P keys encrypted locally");
    } catch {
      toast.error("Lock failed");
    }
  };

  const unlockInbox = async () => {
    if (!db || !identity || !unlockPw.trim()) return;
    try {
      const unwrapped = await unwrapIdentitySecrets(identity, unlockPw.trim());
      await putIdentity(db, unwrapped);
      setIdentity(unwrapped);
      setUnlockPw("");
      toast.success("Unlocked");
    } catch {
      toast.error("Wrong passphrase");
    }
  };

  if (!db || !identity) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={28} />
      </div>
    );
  }

  const locked = !isUnlocked(identity);

  return (
    <div className="h-full flex flex-col animate-fade-up">
      <div className="px-6 py-4 border-b border-border shrink-0">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Messages</h1>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              Decentralized P2P · no relay server · {user?.name ? `Signed in as ${user.name}` : "Local keys"}
            </p>
          </div>
          <div className="encryption-badge">
            <Radio size={11} />
            P2P + E2E
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden min-h-0">
        <div className="w-80 shrink-0 border-r border-border flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="mono-label">Your P2P identity</div>
            <div className="text-[10px] font-mono break-all text-muted-foreground">{identity.userId}</div>
            {locked ? (
              <div className="space-y-2 pt-1">
                <Input
                  type="password"
                  placeholder="Passphrase to unlock"
                  value={unlockPw}
                  onChange={(e) => setUnlockPw(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button size="sm" className="w-full h-8" onClick={() => void unlockInbox()}>
                  <KeyRound size={14} className="mr-1" />
                  Unlock
                </Button>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="h-8 text-xs flex-1" onClick={() => void copyInvite()}>
                    <Copy size={14} className="mr-1" />
                    Copy invite
                  </Button>
                </div>
                {inviteQr && (
                  <div className="flex justify-center pt-1">
                    <img src={inviteQr} alt="Invite QR" className="rounded border border-border w-[120px] h-[120px]" />
                  </div>
                )}
                <div className="flex gap-2 items-end">
                  <Input
                    type="password"
                    placeholder="New lock passphrase"
                    value={lockPw}
                    onChange={(e) => setLockPw(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => void lockInbox()}>
                    <Lock size={14} />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="px-4 py-2 border-b border-border space-y-2">
            <div className="mono-label flex items-center gap-1">
              <UserPlus size={12} />
              Add contact
            </div>
            <Textarea
              value={addPeerJson}
              onChange={(e) => setAddPeerJson(e.target.value)}
              placeholder="Paste peer invite JSON…"
              rows={2}
              className="text-xs font-mono resize-none min-h-[48px]"
            />
            <Button size="sm" className="w-full h-8" disabled={locked} onClick={() => void addPeer()}>
              Save contact
            </Button>
          </div>

          <div className="px-4 py-2 border-b border-border">
            <div className="mono-label">Contacts</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {peers.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-28 text-muted-foreground text-xs font-mono px-4 text-center">
                No peers yet — share your invite or add one
              </div>
            ) : (
              peers.map((p) => (
                <button
                  key={p.peerId}
                  type="button"
                  onClick={() => setSelectedPeerId(p.peerId)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-accent/50 ${
                    selectedPeerId === p.peerId ? "bg-accent" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-foreground/10 border border-border flex items-center justify-center shrink-0 text-[10px] font-mono font-semibold">
                      {initials(p.displayName ?? p.peerId.slice(0, 8))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold truncate">{p.displayName ?? "Peer"}</div>
                      <div className="text-[10px] font-mono text-muted-foreground truncate">{p.peerId.slice(0, 16)}…</div>
                    </div>
                    {blocked.has(p.peerId) && (
                      <span className="text-[9px] font-mono text-destructive shrink-0">blocked</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="px-4 py-2 border-t border-border flex items-center gap-2 text-[10px] font-mono text-muted-foreground">
            <Shield size={10} className="text-aegis-green shrink-0" />
            <span>Stored locally in IndexedDB</span>
          </div>
        </div>

        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {selectedPeer ? (
            <>
              <div className="px-5 py-3 border-b border-border shrink-0 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm font-semibold">{selectedPeer.displayName ?? "Peer"}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    WebRTC: <span className="text-foreground">{rtcConn}</span>
                    {outboxCount > 0 && <span className="ml-2 text-amber-500">{outboxCount} queued</span>}
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={locked} onClick={() => void toggleBlockPeer()}>
                    {blocked.has(selectedPeer.peerId) ? "Unblock" : "Block"}
                  </Button>
                  <Button size="sm" variant="destructive" className="h-8 text-xs" onClick={() => void removePeer()}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>

              <div className="px-5 py-3 border-b border-border space-y-3 shrink-0 max-h-[42%] overflow-y-auto">
                <div className="mono-label flex items-center gap-1">
                  <Link2 size={12} />
                  Out-of-band WebRTC (copy / paste)
                </div>
                <div className="grid gap-2 md:grid-cols-2 text-xs">
                  <div className="space-y-1">
                    <div className="text-muted-foreground font-mono text-[10px]">Initiator: create offer</div>
                    <Button size="sm" className="h-8 w-full" disabled={locked} onClick={() => void startInitiator()}>
                      Create offer
                    </Button>
                    {offerOut && (
                      <Textarea readOnly value={offerOut} rows={4} className="font-mono text-[10px] resize-none" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="text-muted-foreground font-mono text-[10px]">Initiator: paste answer</div>
                    <Textarea
                      value={answerIn}
                      onChange={(e) => setAnswerIn(e.target.value)}
                      rows={3}
                      placeholder="Answer JSON from peer…"
                      className="font-mono text-[10px] resize-none"
                    />
                    <Button size="sm" variant="secondary" className="h-8 w-full" disabled={locked} onClick={() => void completeInitiator()}>
                      Apply answer
                    </Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <div className="text-muted-foreground font-mono text-[10px]">Answerer: paste offer, then create answer</div>
                  <Textarea
                    value={offerIn}
                    onChange={(e) => setOfferIn(e.target.value)}
                    rows={2}
                    placeholder="Offer JSON from initiator…"
                    className="font-mono text-[10px] resize-none"
                  />
                  <Button size="sm" className="h-8" disabled={locked} onClick={() => void runAnswerer()}>
                    Create answer
                  </Button>
                  {answerOut && (
                    <Textarea readOnly value={answerOut} rows={4} className="font-mono text-[10px] resize-none" />
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
                {storedMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-xs font-mono">
                    <MessageSquare size={20} />
                    <p className="mt-2">No messages yet</p>
                  </div>
                ) : (
                  storedMessages.map((msg) => {
                    const isOwn = msg.direction === "out";
                    return (
                      <div key={msg.id} className={`flex gap-3 ${isOwn ? "flex-row-reverse" : ""}`}>
                        <div className="w-7 h-7 rounded-full bg-foreground/10 border border-border flex items-center justify-center shrink-0 mt-0.5 text-[9px] font-mono">
                          {isOwn ? "You" : initials(selectedPeer.displayName ?? "?")}
                        </div>
                        <div className={`max-w-[min(100%,28rem)] flex flex-col gap-1 ${isOwn ? "items-end" : "items-start"}`}>
                          <div
                            className={`px-3.5 py-2.5 rounded-xl text-xs leading-relaxed ${
                              isOwn
                                ? "bg-foreground text-background rounded-tr-sm"
                                : "bg-card border border-border rounded-tl-sm"
                            }`}
                          >
                            {msg.plaintext}
                          </div>
                          <span className="text-[10px] font-mono text-muted-foreground">{formatMessageTime(msg.ts)}</span>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-5 py-4 border-t border-border shrink-0">
                <div className="flex gap-3">
                  <textarea
                    value={compose}
                    onChange={(e) => setCompose(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={locked ? "Unlock keys to send…" : "Type a message…"}
                    disabled={locked}
                    rows={2}
                    className="flex-1 bg-input border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none transition-colors font-sans disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={!compose.trim() || locked}
                    className="flex items-center justify-center w-10 h-10 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 self-end"
                  >
                    <Send size={15} />
                  </button>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground mt-2">
                  STUN-only — restrictive NATs may fail without your own TURN relay.
                </p>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <p className="text-sm font-mono">Select a contact or add one</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
