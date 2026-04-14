/** Short-lived server challenges for wallet-signed messaging enrollment (relay identity). */

type Entry = { message: string; expiresAt: number };

const store = new Map<number, Entry>();

export function setMessagingChallenge(userId: number, message: string, ttlMs = 5 * 60 * 1000): void {
  store.set(userId, { message, expiresAt: Date.now() + ttlMs });
}

export function validateMessagingChallenge(userId: number, signedMessage: string): boolean {
  const e = store.get(userId);
  if (!e) return false;
  if (Date.now() > e.expiresAt) {
    store.delete(userId);
    return false;
  }
  return e.message === signedMessage;
}

export function clearMessagingChallenge(userId: number): void {
  store.delete(userId);
}
