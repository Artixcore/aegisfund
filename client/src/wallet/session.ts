/** In-memory session only; cleared on lock. Never persisted. */

let sessionMnemonic: string | null = null;

export function walletSessionSetMnemonic(mnemonic: string | null): void {
  sessionMnemonic = mnemonic;
}

export function walletSessionGetMnemonic(): string | null {
  return sessionMnemonic;
}

export function walletSessionClear(): void {
  sessionMnemonic = null;
}
