import { useAuth } from "@/_core/hooks/useAuth";
import {
  applyInboundGroupInvite,
  bumpOutboxAttempt,
  buildOutgoingChat,
  clearP2pStores,
  createEphemeralX25519,
  createFullIdentity,
  decryptGroupPayload,
  decryptIncomingChat,
  deleteOutbox,
  deletePeer,
  deriveDmSessionMessageKeyMaterial,
  encryptFileToBlob,
  encryptGroupPayload,
  exportIdentityEncrypted,
  getBlockedPeerIds,
  getGroup,
  getIdentity,
  getMutedPeerIds,
  getP2pRtcConfiguration,
  getPeer,
  identityToInvite,
  importIdentityEncrypted,
  listGroupMessages,
  listGroups,
  listMessagesForPeer,
  listOutboxForPeer,
  listPeers,
  openP2pDb,
  parseInvite,
  parseP2pChannelFrame,
  patchMessage,
  peerRecordFromInvite,
  P2pRelayClient,
  putGroup,
  putGroupMember,
  putGroupMessage,
  putIdentity,
  putMessage,
  putOutbox,
  putPeer,
  randomGroupKeyB64,
  ReplayGuard,
  setBlockedPeerIds,
  setMutedPeerIds,
  SlidingWindowRateLimiter,
  unwrapIdentitySecrets,
  uploadBlobToPinningApi,
  wrapAesKeyForDmPeer,
  wrapGroupKeyForPeer,
  wrapIdentitySecrets,
  type P2pChannelFrame,
  type P2pGroupRecord,
  type P2pGroupStoredMessage,
  type P2pHandshakeFrameV1,
  type P2pIdentityExportV1,
  type P2pIdentityRecord,
  type P2pPeerRecord,
  type P2pPlainPayload,
  type P2pStoredMessage,
  P2pRtcSession,
  parsePlaintextPayload,
  type WalletInfoV1,
} from "@/p2p";
import { addressesForSettings, getWalletSettings, openChainWalletDb, walletSessionGetMnemonic } from "@/wallet";
import { isAddress } from "viem/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Copy,
  Download,
  KeyRound,
  Link2,
  Loader2,
  Lock,
  MessageSquare,
  Radio,
  Send,
  Shield,
  Trash2,
  Upload,
  UserPlus,
  Users,
  Wallet,
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

function displayPlaintextForUi(raw: string): string {
  const p = parsePlaintextPayload(raw);
  if (p.kind === "text") return p.text;
  if (p.kind === "file") return `File: ${p.name} · ${p.cid.slice(0, 10)}…`;
  if (p.kind === "groupInvite") return `Group invite: ${p.name}`;
  return raw;
}

function btcAddrLooksValid(s: string): boolean {
  return /^(bc1|tb1)[a-z0-9]{8,90}$/i.test(s.trim());
}

function DmMessageBody({ msg }: { msg: P2pStoredMessage }) {
  if (msg.narrativeKind === "wallet_info" && msg.walletInfoPayload) {
    const w = msg.walletInfoPayload;
    return (
      <div className="space-y-2 text-[11px] font-mono">
        <div className="text-muted-foreground uppercase tracking-wide">Wallet addresses</div>
        {w.chains.ethereum && (
          <div className="break-all">
            <span className="text-muted-foreground">ETH </span>
            {w.chains.ethereum}
          </div>
        )}
        {w.chains.bitcoin && (
          <div className="break-all">
            <span className="text-muted-foreground">BTC </span>
            {w.chains.bitcoin}
          </div>
        )}
      </div>
    );
  }
  if (msg.narrativeKind === "payment_ack" && msg.paymentAckPayload) {
    const p = msg.paymentAckPayload;
    return (
      <div className="text-[11px] font-mono space-y-1">
        <div className="text-muted-foreground">Payment ({p.chain})</div>
        <div className="break-all">{p.txHash}</div>
      </div>
    );
  }
  return <>{displayPlaintextForUi(msg.plaintext)}</>;
}

const RELAY_WS_URL = String(import.meta.env.VITE_P2P_RELAY_URL ?? "").trim();
const RELAY_SECRET = String(import.meta.env.VITE_P2P_RELAY_SECRET ?? "").trim();
const IPFS_UPLOAD_URL = String(import.meta.env.VITE_P2P_IPFS_UPLOAD_URL ?? "").trim();
const IPFS_TOKEN = String(import.meta.env.VITE_P2P_IPFS_TOKEN ?? "").trim();

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
  const [rtcConn, setRtcConn] = useState<string>("new");
  const rtcRef = useRef<P2pRtcSession | null>(null);
  const replayRef = useRef(new ReplayGuard());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const sessionKeyMaterialRef = useRef(new Map<string, Uint8Array>());
  const pendingInitEphRef = useRef(new Map<string, { ephSecretB64: string; ephPubB64: string }>());
  const relayRef = useRef<P2pRelayClient | null>(null);
  const inboundLimiterRef = useRef(new SlidingWindowRateLimiter(120));
  const outboundLimiterRef = useRef(new SlidingWindowRateLimiter(60));
  const [muted, setMuted] = useState<Set<string>>(new Set());
  const [panel, setPanel] = useState<"dm" | "groups">("dm");
  const [relaySessionId, setRelaySessionId] = useState("");
  const [groups, setGroups] = useState<P2pGroupRecord[]>([]);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupMessages, setGroupMessages] = useState<P2pGroupStoredMessage[]>([]);
  const [groupCompose, setGroupCompose] = useState("");
  const [exportPw, setExportPw] = useState("");
  const [importBundle, setImportBundle] = useState("");
  const [importPw, setImportPw] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [typingRemote, setTypingRemote] = useState(false);
  const typingHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
        setMuted(await getMutedPeerIds(database));
        setGroups(await listGroups(database));
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
    if (!db || !selectedGroupId) {
      setGroupMessages([]);
      return;
    }
    void (async () => {
      setGroupMessages(await listGroupMessages(db, selectedGroupId));
    })();
  }, [db, selectedGroupId]);

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
    sessionKeyMaterialRef.current.clear();
    pendingInitEphRef.current.clear();
    rtcRef.current?.close();
    rtcRef.current = null;
    setRtcConn("new");
  };

  useEffect(() => {
    return () => closeRtc();
  }, []);

  const utf8ToB64 = (s: string) => btoa(unescape(encodeURIComponent(s)));
  const b64ToUtf8 = (s: string) => decodeURIComponent(escape(atob(s)));

  const sendDmControl = (obj: object) => {
    try {
      rtcRef.current?.sendJson(obj);
    } catch {
      /* */
    }
  };

  const handleInboundFrame = async (text: string, peer: P2pPeerRecord) => {
    if (!db || !identity || !isUnlocked(identity)) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text) as unknown;
    } catch {
      return;
    }
    const frame = parseP2pChannelFrame(parsed);
    if (!frame) return;
    if (blocked.has(peer.peerId)) return;

    if (frame.type === "handshake") {
      const h = frame as P2pHandshakeFrameV1;
      if (h.role === "init") {
        const ours = createEphemeralX25519();
        const mat = await deriveDmSessionMessageKeyMaterial({
          myLongTermSecretB64: identity.x25519SecretB64,
          peerLongTermPubB64: peer.x25519PubB64,
          myEphSecretB64: ours.ephSecretB64,
          peerEphPubB64: h.ephPubB64,
        });
        sessionKeyMaterialRef.current.set(peer.peerId, mat);
        sendDmControl({ type: "handshake", v: 1, role: "resp", ephPubB64: ours.ephPubB64 });
        return;
      }
      if (h.role === "resp") {
        const pending = pendingInitEphRef.current.get(peer.peerId);
        if (!pending) return;
        const mat = await deriveDmSessionMessageKeyMaterial({
          myLongTermSecretB64: identity.x25519SecretB64,
          peerLongTermPubB64: peer.x25519PubB64,
          myEphSecretB64: pending.ephSecretB64,
          peerEphPubB64: h.ephPubB64,
        });
        sessionKeyMaterialRef.current.set(peer.peerId, mat);
        pendingInitEphRef.current.delete(peer.peerId);
        return;
      }
    }

    if (frame.type === "typing") {
      if (frame.peerUserId !== peer.peerId) return;
      setTypingRemote(frame.active);
      if (typingHideTimerRef.current) clearTimeout(typingHideTimerRef.current);
      if (frame.active) {
        typingHideTimerRef.current = setTimeout(() => setTypingRemote(false), 2500);
      }
      return;
    }

    if (frame.type === "ack") {
      await patchMessage(db, frame.messageId, { deliveredAt: Date.now() });
      await refreshMessages(db, peer.peerId);
      return;
    }

    if (frame.type === "delivered") {
      await patchMessage(db, frame.messageId, { seenAt: Date.now() });
      await refreshMessages(db, peer.peerId);
      return;
    }

    if (frame.type === "ephemeral") {
      await patchMessage(db, frame.messageId, { expiresAt: Date.now() + frame.deleteAfterMs });
      await refreshMessages(db, peer.peerId);
      return;
    }

    if (frame.type === "wallet_info") {
      const w = frame.payload;
      const next: Partial<{ ethereum: string; bitcoin: string }> = { ...peer.chainAddresses };
      if (w.chains.ethereum && isAddress(w.chains.ethereum)) next.ethereum = w.chains.ethereum;
      if (w.chains.bitcoin && btcAddrLooksValid(w.chains.bitcoin)) next.bitcoin = w.chains.bitcoin;
      await putPeer(db, { ...peer, chainAddresses: next });
      const id = crypto.randomUUID();
      await putMessage(db, {
        id,
        peerId: peer.peerId,
        direction: "in",
        ts: Date.now(),
        plaintext: "Wallet addresses (structured)",
        narrativeKind: "wallet_info",
        walletInfoPayload: w,
      });
      await refreshPeers(db);
      await refreshMessages(db, peer.peerId);
      return;
    }

    if (frame.type === "payment_ack") {
      const p = frame.payload;
      await putMessage(db, {
        id: crypto.randomUUID(),
        peerId: peer.peerId,
        direction: "in",
        ts: Date.now(),
        plaintext: `Payment ${p.chain}: ${p.txHash}`,
        narrativeKind: "payment_ack",
        paymentAckPayload: { chain: p.chain, txHash: p.txHash },
      });
      await refreshMessages(db, peer.peerId);
      return;
    }

    if (frame.type !== "chat") return;
    if (muted.has(peer.peerId)) return;
    if (peer.inboundChatEnabled === false) return;
    if (!inboundLimiterRef.current.allow(peer.peerId)) return;

    const msg = frame.payload;
    const r = replayRef.current.checkAndRecord(msg.fromUserId, msg.id, msg.ts, msg.nonce);
    if (r !== "ok") return;
    const sk = sessionKeyMaterialRef.current.get(peer.peerId);
    try {
      const inner = await decryptIncomingChat(msg, identity, peer, { sessionKeyMaterial32: sk ?? null });
      const parsedInner = parsePlaintextPayload(inner);
      if (parsedInner.kind === "groupInvite") {
        await applyInboundGroupInvite(db, identity, peer, parsedInner);
        await putMessage(db, {
          id: msg.id,
          peerId: peer.peerId,
          direction: "in",
          plaintext: inner,
          ts: msg.ts,
        });
        setGroups(await listGroups(db));
      } else {
        await putMessage(db, {
          id: msg.id,
          peerId: peer.peerId,
          direction: "in",
          plaintext: inner,
          ts: msg.ts,
        });
      }
      sendDmControl({ type: "ack", v: 1, messageId: msg.id });
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
        await bumpOutboxAttempt(db, row.id);
        break;
      }
    }
    await refreshMessages(db, peerId);
  };

  const beginRtcSession = (isInitiator: boolean, peer: P2pPeerRecord, peerId: string) => {
    const rtcCfg = getP2pRtcConfiguration();
    return new P2pRtcSession({
      isInitiator,
      rtcConfig: rtcCfg,
      onMessage: (t) => void handleInboundFrame(t, peer),
      onChannelOpen: () => {
        const s = rtcRef.current;
        if (isInitiator && s) {
          const eph = createEphemeralX25519();
          pendingInitEphRef.current.set(peerId, eph);
          try {
            s.sendJson({ type: "handshake", v: 1, role: "init", ephPubB64: eph.ephPubB64 });
          } catch {
            /* */
          }
        }
        if (s) void drainOutbox(s, peerId);
        toast.success("P2P channel open");
      },
      onConnectionState: (s) => setRtcConn(s),
    });
  };

  const startInitiator = async () => {
    if (!selectedPeer || !identity || !isUnlocked(identity)) return;
    const peerId = selectedPeer.peerId;
    closeRtc();
    setOfferOut("");
    setAnswerIn("");
    try {
      const session = beginRtcSession(true, selectedPeer, peerId);
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
    const peerId = selectedPeer.peerId;
    if (!offerIn.trim()) {
      toast.error("Paste offer JSON from initiator");
      return;
    }
    closeRtc();
    setAnswerOut("");
    try {
      const session = beginRtcSession(false, selectedPeer, peerId);
      rtcRef.current = session;
      const ans = await session.acceptOffer(offerIn.trim());
      setAnswerOut(ans);
      toast.success("Answer ready — send back to initiator");
    } catch (e) {
      console.error(e);
      toast.error("Failed to answer offer");
    }
  };

  function relayWsUrlToWs(url: string) {
    const u = url.trim();
    if (u.startsWith("ws://") || u.startsWith("wss://")) return u;
    if (u.startsWith("http://")) return `ws://${u.slice("http://".length)}`;
    if (u.startsWith("https://")) return `wss://${u.slice("https://".length)}`;
    return u;
  }

  const onRelayGroupPayload = async (groupId: string, payloadB64: string) => {
    if (!db || !identity) return;
    const g = await getGroup(db, groupId);
    if (!g) return;
    try {
      const sealedJson = b64ToUtf8(payloadB64);
      const inner = await decryptGroupPayload(g.groupKeyB64, sealedJson);
      if (inner.kind !== "text") return;
      if (inner.fromUserId === identity.userId) return;
      await putGroupMessage(db, {
        id: inner.id,
        groupId,
        fromUserId: inner.fromUserId,
        direction: "in",
        plaintext: JSON.stringify({ kind: "text", text: inner.text }),
        ts: inner.ts,
      });
      if (selectedGroupId === groupId) {
        setGroupMessages(await listGroupMessages(db, groupId));
      }
    } catch {
      /* ignore */
    }
  };

  const onRelayMailboxBlob = async (blobB64: string) => {
    if (!db || !identity || !isUnlocked(identity)) return;
    try {
      const frameJson = b64ToUtf8(blobB64);
      const frame = parseP2pChannelFrame(JSON.parse(frameJson));
      if (!frame || frame.type !== "chat") return;
      const msg = frame.payload;
      const peer = await getPeer(db, msg.fromUserId);
      if (!peer) return;
      await handleInboundFrame(frameJson, peer);
    } catch {
      /* ignore */
    }
  };

  const ensureRelay = async () => {
    if (!RELAY_WS_URL) throw new Error("Set VITE_P2P_RELAY_URL");
    if (relayRef.current?.connected) return relayRef.current;
    relayRef.current?.close();
    const relay = new P2pRelayClient(relayWsUrlToWs(RELAY_WS_URL));
    await relay.connect({
      onGroup: (gid, b64) => void onRelayGroupPayload(gid, b64),
      onMailbox: (b64) => void onRelayMailboxBlob(b64),
    });
    relayRef.current = relay;
    const gs = db ? await listGroups(db) : [];
    for (const g of gs) relay.joinGroup(g.groupId);
    if (identity?.userId) relay.fetchMailbox(identity.userId, RELAY_SECRET || undefined);
    return relay;
  };

  const handleRelayConnect = async () => {
    try {
      await ensureRelay();
      toast.success("Relay connected");
    } catch (e) {
      console.error(e);
      toast.error("Relay connect failed");
    }
  };

  const startInitiatorRelay = async () => {
    if (!selectedPeer || !identity || !isUnlocked(identity) || !RELAY_WS_URL) return;
    const peerId = selectedPeer.peerId;
    const sid = relaySessionId.trim() || crypto.randomUUID();
    setRelaySessionId(sid);
    closeRtc();
    try {
      const relay = await ensureRelay();
      relay.joinRtcSession(sid, "init", identity.userId);
      const session = beginRtcSession(true, selectedPeer, peerId);
      rtcRef.current = session;
      const offer = await session.createOfferPackage();
      relay.sendRtc(sid, offer);
      const answer = await relay.waitRtcPayload(sid);
      await session.completeWithAnswer(answer);
      toast.success("Relay signaling complete");
    } catch (e) {
      console.error(e);
      toast.error("Relay initiator failed (answerer must join same session id)");
    }
  };

  const runAnswererRelay = async () => {
    if (!selectedPeer || !identity || !isUnlocked(identity) || !RELAY_WS_URL) return;
    const peerId = selectedPeer.peerId;
    const sid = relaySessionId.trim();
    if (!sid) {
      toast.error("Paste relay session id from initiator");
      return;
    }
    closeRtc();
    try {
      const relay = await ensureRelay();
      relay.joinRtcSession(sid, "ans", identity.userId);
      const offer = await relay.waitRtcPayload(sid);
      const session = beginRtcSession(false, selectedPeer, peerId);
      rtcRef.current = session;
      const answer = await session.acceptOffer(offer);
      relay.sendRtc(sid, answer);
      toast.success("Relay signaling complete");
    } catch (e) {
      console.error(e);
      toast.error("Relay answerer failed");
    }
  };

  const handleCreateGroup = async () => {
    if (!db || !identity || !isUnlocked(identity) || !newGroupName.trim()) return;
    const groupId = crypto.randomUUID();
    const groupKeyB64 = randomGroupKeyB64();
    await putGroup(db, {
      groupId,
      name: newGroupName.trim(),
      createdAt: Date.now(),
      createdByUserId: identity.userId,
      groupKeyB64,
      keyVersion: 1,
      isPublic: false,
    });
    await putGroupMember(db, {
      groupId,
      userId: identity.userId,
      signingPubB64: identity.signingPubB64,
      x25519PubB64: identity.x25519PubB64,
      role: "admin",
      addedAt: Date.now(),
    });
    for (const p of peers) {
      if (p.peerId === identity.userId) continue;
      await putGroupMember(db, {
        groupId,
        userId: p.peerId,
        signingPubB64: p.signingPubB64,
        x25519PubB64: p.x25519PubB64,
        role: "member",
        addedAt: Date.now(),
      });
      const wrap = await wrapGroupKeyForPeer({
        groupKeyB64,
        myX25519SecretB64: identity.x25519SecretB64,
        peerX25519PubB64: p.x25519PubB64,
      });
      const invite: P2pPlainPayload = {
        kind: "groupInvite",
        groupId,
        name: newGroupName.trim(),
        wrappedGroupKeyJson: wrap,
        role: "member",
      };
      const sk = sessionKeyMaterialRef.current.get(p.peerId);
      const wire = await buildOutgoingChat(identity, p, invite, { sessionKeyMaterial32: sk ?? null });
      const frame: P2pChannelFrame = { type: "chat", payload: wire };
      const frameJson = JSON.stringify(frame);
      await putOutbox(db, {
        id: crypto.randomUUID(),
        peerId: p.peerId,
        frameJson,
        createdAt: Date.now(),
        attempts: 0,
      });
    }
    setNewGroupName("");
    setGroups(await listGroups(db));
    try {
      const relay = await ensureRelay();
      relay.joinGroup(groupId);
    } catch {
      /* optional */
    }
    toast.success("Group created — invites queued per contact");
  };

  const handleSendGroup = async () => {
    if (!db || !identity || !isUnlocked(identity) || !selectedGroupId || !groupCompose.trim()) return;
    const g = await getGroup(db, selectedGroupId);
    if (!g) return;
    const id = crypto.randomUUID();
    const ts = Date.now();
    const payload = { kind: "text" as const, text: groupCompose.trim(), fromUserId: identity.userId, id, ts };
    const sealed = await encryptGroupPayload(g.groupKeyB64, payload);
    try {
      const relay = await ensureRelay();
      relay.joinGroup(selectedGroupId);
      relay.broadcastGroup(selectedGroupId, utf8ToB64(sealed));
    } catch (e) {
      console.error(e);
      toast.error("Relay required for group fan-out");
      return;
    }
    await putGroupMessage(db, {
      id,
      groupId: selectedGroupId,
      fromUserId: identity.userId,
      direction: "out",
      plaintext: JSON.stringify({ kind: "text", text: groupCompose.trim() }),
      ts,
    });
    setGroupCompose("");
    setGroupMessages(await listGroupMessages(db, selectedGroupId));
  };

  const handleExportIdentity = async () => {
    if (!identity || !isUnlocked(identity) || !exportPw.trim()) {
      toast.error("Unlock keys and set an export password");
      return;
    }
    try {
      const bundle = await exportIdentityEncrypted(identity, exportPw.trim());
      const blob = new Blob([JSON.stringify(bundle)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `aegis-p2p-identity-${identity.userId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExportPw("");
      toast.success("Encrypted export downloaded");
    } catch {
      toast.error("Export failed");
    }
  };

  const handleImportIdentity = async () => {
    if (!db || !importBundle.trim() || !importPw.trim()) return;
    try {
      const rec = await importIdentityEncrypted(JSON.parse(importBundle.trim()) as P2pIdentityExportV1, importPw.trim());
      await putIdentity(db, rec);
      setIdentity(rec);
      setImportBundle("");
      setImportPw("");
      await refreshPeers(db);
      setGroups(await listGroups(db));
      toast.success("Identity imported");
    } catch {
      toast.error("Import failed");
    }
  };

  const handleRotateIdentity = async () => {
    if (!db) return;
    if (!globalThis.confirm("Replace P2P identity? Local contacts and messages will be wiped.")) return;
    closeRtc();
    relayRef.current?.close();
    relayRef.current = null;
    await clearP2pStores(db);
    const nid = await createFullIdentity();
    await putIdentity(db, nid);
    setIdentity(nid);
    setMuted(new Set());
    await refreshPeers(db);
    setGroups([]);
    setSelectedPeerId(null);
    setSelectedGroupId(null);
    toast.success("New identity created");
  };

  const handleFileAttach = async (file: File | null) => {
    if (!file || !db || !selectedPeer || !identity || !isUnlocked(identity)) return;
    if (!IPFS_UPLOAD_URL) {
      toast.error("Set VITE_P2P_IPFS_UPLOAD_URL (multipart → {cid})");
      return;
    }
    try {
      const { blob, aesKeyB64 } = await encryptFileToBlob(file);
      const { cid } = await uploadBlobToPinningApi({
        blob,
        filename: `${file.name}.enc`,
        apiUrl: IPFS_UPLOAD_URL,
        bearerToken: IPFS_TOKEN || undefined,
      });
      const fileKeyWrapJson = await wrapAesKeyForDmPeer(aesKeyB64, identity, selectedPeer);
      const sk = sessionKeyMaterialRef.current.get(selectedPeer.peerId);
      const plain: P2pPlainPayload = {
        kind: "file",
        name: file.name,
        mime: file.type || "application/octet-stream",
        size: file.size,
        cid,
        fileKeyWrapJson,
      };
      const wire = await buildOutgoingChat(identity, selectedPeer, plain, { sessionKeyMaterial32: sk ?? null });
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
        toast.message("File message queued for P2P");
      }
      await putMessage(db, {
        id: wire.id,
        peerId: selectedPeer.peerId,
        direction: "out",
        plaintext: JSON.stringify(plain),
        ts: wire.ts,
      });
      await refreshMessages(db, selectedPeer.peerId);
      toast.success("File attached");
    } catch (e) {
      console.error(e);
      toast.error("File attach failed");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSend = async () => {
    if (!compose.trim() || !db || !selectedPeer || !identity || !isUnlocked(identity)) return;
    if (!outboundLimiterRef.current.allow(selectedPeer.peerId)) {
      toast.error("Slow down — rate limit");
      return;
    }
    const text = compose.trim();
    try {
      const sk = sessionKeyMaterialRef.current.get(selectedPeer.peerId);
      const wire = await buildOutgoingChat(identity, selectedPeer, text, { sessionKeyMaterial32: sk ?? null });
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
        if (relayRef.current?.connected && RELAY_WS_URL) {
          try {
            relayRef.current.putMailbox(
              selectedPeer.peerId,
              utf8ToB64(frameJson),
              3600,
              RELAY_SECRET || undefined,
            );
            toast.message("Queued + mailbox drop (relay)");
          } catch {
            toast.message("Queued — will send when P2P connects");
          }
        } else {
          toast.message("Queued — will send when P2P connects");
        }
      }
      await putMessage(db, {
        id: wire.id,
        peerId: selectedPeer.peerId,
        direction: "out",
        plaintext: JSON.stringify({ kind: "text", text } satisfies P2pPlainPayload),
        ts: wire.ts,
      });
      setCompose("");
      await refreshMessages(db, selectedPeer.peerId);
    } catch {
      toast.error("Send failed");
    }
  };

  const handleShareWalletAddresses = async () => {
    if (!db || !selectedPeer || !identity || !isUnlocked(identity)) return;
    const m = walletSessionGetMnemonic();
    if (!m) {
      toast.error("Unlock your local wallet on the Wallets tab first");
      return;
    }
    try {
      const wdb = await openChainWalletDb();
      const st = await getWalletSettings(wdb);
      const addrs = await addressesForSettings(m, st);
      const payload: WalletInfoV1 = {
        v: 1,
        type: "wallet_info",
        chains: { ethereum: addrs.ethereum, bitcoin: addrs.bitcoin },
      };
      const frame: P2pChannelFrame = { type: "wallet_info", payload };
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
        if (relayRef.current?.connected && RELAY_WS_URL) {
          try {
            relayRef.current.putMailbox(
              selectedPeer.peerId,
              utf8ToB64(frameJson),
              3600,
              RELAY_SECRET || undefined,
            );
            toast.message("Wallet info queued + mailbox");
          } catch {
            toast.message("Wallet info queued for P2P");
          }
        } else {
          toast.message("Wallet info queued for P2P");
        }
      }
      await putMessage(db, {
        id: crypto.randomUUID(),
        peerId: selectedPeer.peerId,
        direction: "out",
        ts: Date.now(),
        plaintext: "Wallet addresses (structured)",
        narrativeKind: "wallet_info",
        walletInfoPayload: payload,
      });
      await refreshMessages(db, selectedPeer.peerId);
      toast.success("Shared wallet addresses");
    } catch (e) {
      console.error(e);
      toast.error("Could not share addresses");
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
    await setBlockedPeerIds(db, Array.from(next));
    setBlocked(next);
    toast.success(next.has(selectedPeerId) ? "Peer blocked" : "Peer unblocked");
  };

  const toggleMutePeer = async () => {
    if (!db || !selectedPeerId) return;
    const next = new Set(muted);
    if (next.has(selectedPeerId)) next.delete(selectedPeerId);
    else next.add(selectedPeerId);
    await setMutedPeerIds(db, Array.from(next));
    setMuted(next);
    toast.success(next.has(selectedPeerId) ? "Muted inbound" : "Unmuted inbound");
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
              Decentralized P2P · optional relay · {user?.name ? `Signed in as ${user.name}` : "Local keys"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="encryption-badge">
              <Radio size={11} />
              P2P + E2E
            </div>
            <div className="flex rounded-md border border-border overflow-hidden text-[10px] font-mono">
              <button
                type="button"
                className={`px-2 py-1 ${panel === "dm" ? "bg-accent" : "bg-background"}`}
                onClick={() => setPanel("dm")}
              >
                Direct
              </button>
              <button
                type="button"
                className={`px-2 py-1 ${panel === "groups" ? "bg-accent" : "bg-background"}`}
                onClick={() => setPanel("groups")}
              >
                Groups
              </button>
            </div>
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

          {!locked && (
            <div className="px-4 py-2 border-b border-border space-y-2">
              <div className="mono-label flex items-center gap-1">
                <Download size={12} />
                Backup / rotate
              </div>
              <div className="flex gap-1">
                <Input
                  type="password"
                  placeholder="Export password"
                  value={exportPw}
                  onChange={(e) => setExportPw(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button size="sm" variant="outline" className="h-8 shrink-0" onClick={() => void handleExportIdentity()}>
                  <Download size={14} />
                </Button>
              </div>
              <Textarea
                value={importBundle}
                onChange={(e) => setImportBundle(e.target.value)}
                placeholder="Paste encrypted export JSON…"
                rows={2}
                className="text-[10px] font-mono resize-none min-h-[40px]"
              />
              <div className="flex gap-1">
                <Input
                  type="password"
                  placeholder="Import password"
                  value={importPw}
                  onChange={(e) => setImportPw(e.target.value)}
                  className="h-8 text-xs"
                />
                <Button size="sm" variant="secondary" className="h-8 shrink-0" onClick={() => void handleImportIdentity()}>
                  <Upload size={14} />
                </Button>
              </div>
              <Button size="sm" variant="destructive" className="w-full h-8 text-xs" onClick={() => void handleRotateIdentity()}>
                New identity (wipes local P2P data)
              </Button>
            </div>
          )}

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
                  onClick={() => {
                    setPanel("dm");
                    setSelectedPeerId(p.peerId);
                  }}
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
                    {muted.has(p.peerId) && (
                      <span className="text-[9px] font-mono text-muted-foreground shrink-0">muted</span>
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
          {panel === "groups" ? (
            <div className="flex flex-col flex-1 min-h-0">
              <div className="px-5 py-3 border-b border-border space-y-2 shrink-0">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Users size={16} />
                  Groups
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    placeholder="New group name"
                    className="h-8 text-xs"
                    disabled={locked}
                  />
                  <Button size="sm" className="h-8 shrink-0" disabled={locked} onClick={() => void handleCreateGroup()}>
                    Create
                  </Button>
                </div>
                {RELAY_WS_URL ? (
                  <Button size="sm" variant="outline" className="h-8 text-xs w-full" disabled={locked} onClick={() => void handleRelayConnect()}>
                    Connect relay (groups + mailbox)
                  </Button>
                ) : (
                  <p className="text-[10px] font-mono text-muted-foreground">Set VITE_P2P_RELAY_URL for live group fan-out.</p>
                )}
              </div>
              <div className="flex flex-1 min-h-0">
                <div className="w-48 border-r border-border overflow-y-auto shrink-0">
                  {groups.length === 0 ? (
                    <p className="text-[10px] font-mono text-muted-foreground p-3">No groups</p>
                  ) : (
                    groups.map((g) => (
                      <button
                        key={g.groupId}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-xs border-b border-border/50 ${selectedGroupId === g.groupId ? "bg-accent" : ""}`}
                        onClick={() => setSelectedGroupId(g.groupId)}
                      >
                        {g.name}
                      </button>
                    ))
                  )}
                </div>
                <div className="flex-1 flex flex-col min-w-0 min-h-0">
                  {selectedGroupId ? (
                    <>
                      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
                        {groupMessages.map((m) => (
                          <div key={m.id} className="text-xs font-mono border-b border-border/40 pb-2">
                            <span className="text-muted-foreground">{m.fromUserId.slice(0, 8)}…</span>{" "}
                            {displayPlaintextForUi(m.plaintext)}
                          </div>
                        ))}
                      </div>
                      <div className="p-3 border-t border-border flex gap-2 shrink-0">
                        <Input
                          value={groupCompose}
                          onChange={(e) => setGroupCompose(e.target.value)}
                          placeholder="Group message…"
                          className="h-9 text-xs"
                          disabled={locked}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") void handleSendGroup();
                          }}
                        />
                        <Button size="sm" className="h-9 shrink-0" disabled={locked} onClick={() => void handleSendGroup()}>
                          <Send size={14} />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground text-xs font-mono">
                      Select a group
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : selectedPeer ? (
            <>
              <div className="px-5 py-3 border-b border-border shrink-0 flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="text-sm font-semibold">{selectedPeer.displayName ?? "Peer"}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">
                    WebRTC: <span className="text-foreground">{rtcConn}</span>
                    {outboxCount > 0 && <span className="ml-2 text-amber-500">{outboxCount} queued</span>}
                    {typingRemote && <span className="ml-2 text-sky-500">typing…</span>}
                  </div>
                  {(selectedPeer.chainAddresses?.ethereum || selectedPeer.chainAddresses?.bitcoin) && (
                    <div className="text-[10px] font-mono text-muted-foreground mt-1 space-y-0.5 max-w-xl">
                      {selectedPeer.chainAddresses.ethereum && (
                        <div className="break-all">
                          <span className="text-foreground/70">Their ETH:</span> {selectedPeer.chainAddresses.ethereum}
                        </div>
                      )}
                      {selectedPeer.chainAddresses.bitcoin && (
                        <div className="break-all">
                          <span className="text-foreground/70">Their BTC:</span> {selectedPeer.chainAddresses.bitcoin}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={locked} onClick={() => void handleShareWalletAddresses()}>
                    <Wallet size={14} className="mr-1" />
                    Share my addresses
                  </Button>
                  <Button size="sm" variant="outline" className="h-8 text-xs" disabled={locked} onClick={() => void toggleMutePeer()}>
                    {muted.has(selectedPeer.peerId) ? "Unmute" : "Mute in"}
                  </Button>
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

              {RELAY_WS_URL && (
                <div className="px-5 py-3 border-b border-border space-y-2 shrink-0">
                  <div className="mono-label">Optional relay signaling</div>
                  <Input
                    value={relaySessionId}
                    onChange={(e) => setRelaySessionId(e.target.value)}
                    placeholder="Session id (answerer pastes initiator’s)"
                    className="h-8 text-[10px] font-mono"
                    disabled={locked}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" className="h-8 text-xs" disabled={locked} onClick={() => void handleRelayConnect()}>
                      Connect relay
                    </Button>
                    <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={locked} onClick={() => void startInitiatorRelay()}>
                      Initiator (relay)
                    </Button>
                    <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={locked} onClick={() => void runAnswererRelay()}>
                      Answerer (relay)
                    </Button>
                  </div>
                </div>
              )}

              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(e) => void handleFileAttach(e.target.files?.[0] ?? null)}
              />

              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 min-h-0">
                {storedMessages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-muted-foreground text-xs font-mono">
                    <MessageSquare size={20} />
                    <p className="mt-2">No messages yet</p>
                  </div>
                ) : (
                  <>
                    {storedMessages
                      .filter((msg) => !msg.expiresAt || msg.expiresAt > Date.now())
                      .map((msg) => {
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
                                <DmMessageBody msg={msg} />
                              </div>
                              <span className="text-[10px] font-mono text-muted-foreground">
                                {formatMessageTime(msg.ts)}
                                {msg.deliveredAt ? " · delivered" : ""}
                                {msg.seenAt ? " · seen" : ""}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </>
                )}
                <div ref={messagesEndRef} />
              </div>

              <div className="px-5 py-4 border-t border-border shrink-0">
                <div className="flex gap-3">
                  <textarea
                    value={compose}
                    onChange={(e) => {
                      setCompose(e.target.value);
                      if (identity && selectedPeer && rtcRef.current?.dc?.readyState === "open") {
                        sendDmControl({
                          type: "typing",
                          v: 1,
                          chat: "dm",
                          peerUserId: identity.userId,
                          active: e.target.value.length > 0,
                        });
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      locked ? "Unlock keys to send…" : blocked.has(selectedPeer.peerId) ? "Unblock peer to send…" : "Type a message…"
                    }
                    disabled={locked || blocked.has(selectedPeer.peerId) || muted.has(selectedPeer.peerId)}
                    rows={2}
                    className="flex-1 bg-input border border-border rounded-lg px-3.5 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none transition-colors font-sans disabled:opacity-50"
                  />
                  <button
                    type="button"
                    disabled={locked || !IPFS_UPLOAD_URL}
                    title={IPFS_UPLOAD_URL ? "Attach encrypted file" : "Set VITE_P2P_IPFS_UPLOAD_URL"}
                    className="flex items-center justify-center w-10 h-10 rounded-lg border border-border hover:bg-accent transition-all disabled:opacity-40 shrink-0 self-end"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSend()}
                    disabled={
                      !compose.trim() || locked || blocked.has(selectedPeer.peerId) || muted.has(selectedPeer.peerId)
                    }
                    className="flex items-center justify-center w-10 h-10 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 self-end"
                  >
                    <Send size={15} />
                  </button>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground mt-2">
                  ICE servers: set <span className="text-foreground">VITE_P2P_ICE_SERVERS</span> JSON (STUN/TURN). Ephemeral
                  session keys mix X25519 handshake on each data channel open.
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
