import { getGroup, putGroup, putGroupMember } from "./db";
import { unwrapGroupKeyFromPeer } from "./groupCrypto";
import type { P2pGroupRole, P2pIdentityRecord, P2pPeerRecord } from "./types";

export async function applyInboundGroupInvite(
  db: IDBDatabase,
  self: P2pIdentityRecord,
  fromPeer: P2pPeerRecord,
  inv: { kind: "groupInvite"; groupId: string; name: string; wrappedGroupKeyJson: string; role: P2pGroupRole },
): Promise<void> {
  const existing = await getGroup(db, inv.groupId);
  if (existing) return;
  const groupKeyB64 = await unwrapGroupKeyFromPeer({
    wrapJson: inv.wrappedGroupKeyJson,
    myX25519SecretB64: self.x25519SecretB64,
    peerX25519PubB64: fromPeer.x25519PubB64,
  });
  await putGroup(db, {
    groupId: inv.groupId,
    name: inv.name,
    createdAt: Date.now(),
    createdByUserId: fromPeer.peerId,
    groupKeyB64,
    keyVersion: 1,
    isPublic: false,
  });
  await putGroupMember(db, {
    groupId: inv.groupId,
    userId: self.userId,
    signingPubB64: self.signingPubB64,
    x25519PubB64: self.x25519PubB64,
    role: inv.role,
    addedAt: Date.now(),
  });
  await putGroupMember(db, {
    groupId: inv.groupId,
    userId: fromPeer.peerId,
    signingPubB64: fromPeer.signingPubB64,
    x25519PubB64: fromPeer.x25519PubB64,
    role: "admin",
    addedAt: Date.now(),
  });
}
