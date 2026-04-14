/** WebRTC data channel with out-of-band SDP + ICE (no signaling server). STUN only. */

export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
};

export type SignalingPackageV1 =
  | { v: 1; kind: "offer"; sdp: string; ice: RTCIceCandidateInit[] }
  | { v: 1; kind: "answer"; sdp: string; ice: RTCIceCandidateInit[] };

function parseSignal(json: string): SignalingPackageV1 {
  const o = JSON.parse(json) as SignalingPackageV1;
  if (o.v !== 1 || (o.kind !== "offer" && o.kind !== "answer") || typeof o.sdp !== "string" || !Array.isArray(o.ice)) {
    throw new Error("Invalid signaling package");
  }
  return o;
}

async function gatherAllIce(pc: RTCPeerConnection, bucket: RTCIceCandidateInit[]): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      pc.removeEventListener("icegatheringstatechange", onIce);
      resolve();
    };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) bucket.push(ev.candidate.toJSON());
    };
    const onIce = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    pc.addEventListener("icegatheringstatechange", onIce);
    globalThis.setTimeout(finish, 12_000);
    if (pc.iceGatheringState === "complete") finish();
  });
}

async function applyRemotePackage(pc: RTCPeerConnection, pkg: SignalingPackageV1) {
  const type = pkg.kind === "offer" ? "offer" : "answer";
  await pc.setRemoteDescription({ type, sdp: pkg.sdp });
  for (const c of pkg.ice) {
    try {
      await pc.addIceCandidate(c);
    } catch {
      /* ignore bad candidate */
    }
  }
}

export class P2pRtcSession {
  readonly pc: RTCPeerConnection;
  dc: RTCDataChannel | null = null;
  private readonly isInitiator: boolean;
  private readonly onMessage?: (text: string) => void;
  private readonly onChannelOpen?: () => void;
  private iceBucket: RTCIceCandidateInit[] = [];

  constructor(opts: {
    isInitiator: boolean;
    onMessage?: (text: string) => void;
    onChannelOpen?: () => void;
    onConnectionState?: (s: RTCPeerConnectionState) => void;
    rtcConfig?: RTCConfiguration;
  }) {
    this.isInitiator = opts.isInitiator;
    this.onMessage = opts.onMessage;
    this.onChannelOpen = opts.onChannelOpen;
    this.pc = new RTCPeerConnection(opts.rtcConfig ?? DEFAULT_RTC_CONFIG);
    this.pc.onconnectionstatechange = () => opts.onConnectionState?.(this.pc.connectionState);

    if (opts.isInitiator) {
      const ch = this.pc.createDataChannel("aegis-p2p", { ordered: true });
      this.attachDc(ch);
    } else {
      this.pc.ondatachannel = (ev) => {
        this.attachDc(ev.channel);
      };
    }
  }

  private attachDc(ch: RTCDataChannel) {
    this.dc = ch;
    ch.binaryType = "arraybuffer";
    ch.onmessage = (ev) => {
      if (typeof ev.data === "string") this.onMessage?.(ev.data);
    };
    ch.onopen = () => this.onChannelOpen?.();
  }

  /** Initiator: produce JSON blob to send to peer out-of-band. */
  async createOfferPackage(): Promise<string> {
    if (!this.isInitiator) throw new Error("Only initiator creates offer");
    this.iceBucket = [];
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    await gatherAllIce(this.pc, this.iceBucket);
    const pkg: SignalingPackageV1 = { v: 1, kind: "offer", sdp: this.pc.localDescription!.sdp!, ice: this.iceBucket };
    return JSON.stringify(pkg);
  }

  /** Answerer: consume offer blob, return answer blob. */
  async acceptOffer(offerJson: string): Promise<string> {
    if (this.isInitiator) throw new Error("Initiator must use completeWithAnswer");
    const offer = parseSignal(offerJson);
    if (offer.kind !== "offer") throw new Error("Expected offer package");
    await applyRemotePackage(this.pc, offer);
    this.iceBucket = [];
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    await gatherAllIce(this.pc, this.iceBucket);
    const pkg: SignalingPackageV1 = { v: 1, kind: "answer", sdp: this.pc.localDescription!.sdp!, ice: this.iceBucket };
    return JSON.stringify(pkg);
  }

  /** Initiator: consume answer blob from peer. */
  async completeWithAnswer(answerJson: string): Promise<void> {
    if (!this.isInitiator) throw new Error("Only initiator completes with answer");
    const answer = parseSignal(answerJson);
    if (answer.kind !== "answer") throw new Error("Expected answer package");
    await applyRemotePackage(this.pc, answer);
  }

  sendJson(obj: unknown) {
    const ch = this.dc;
    if (!ch || ch.readyState !== "open") throw new Error("Data channel not open");
    ch.send(JSON.stringify(obj));
  }

  close() {
    try {
      this.dc?.close();
    } catch {
      /* */
    }
    this.pc.close();
  }
}
