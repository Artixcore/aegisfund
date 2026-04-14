import * as ed25519 from "@noble/ed25519";
import {
  bytesToHex,
  ed25519KeyHex64Schema,
  hexToBytes,
} from "@shared/dappAuth";

export async function generateEd25519KeypairHex(): Promise<{
  publicKeyHex: string;
  privateKeyHex: string;
}> {
  const privateKey = ed25519.utils.randomPrivateKey();
  const publicKey = await ed25519.getPublicKeyAsync(privateKey);
  return {
    publicKeyHex: bytesToHex(publicKey),
    privateKeyHex: bytesToHex(privateKey),
  };
}

export async function publicKeyMatchesPrivateKeyHex(
  publicKeyHex: string,
  privateKeyHex: string
): Promise<boolean> {
  const pubParsed = ed25519KeyHex64Schema.safeParse(publicKeyHex);
  const privParsed = ed25519KeyHex64Schema.safeParse(privateKeyHex);
  if (!pubParsed.success || !privParsed.success) return false;
  const priv = hexToBytes(privParsed.data);
  const expectedPub = await ed25519.getPublicKeyAsync(priv);
  const actual = hexToBytes(pubParsed.data);
  if (expectedPub.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedPub.length; i++) {
    diff |= expectedPub[i]! ^ actual[i]!;
  }
  return diff === 0;
}

export async function signUtf8MessageHex(
  message: string,
  privateKeyHex: string
): Promise<string> {
  const priv = ed25519KeyHex64Schema.parse(privateKeyHex);
  const sk = hexToBytes(priv);
  const msg = new TextEncoder().encode(message);
  const sig = await ed25519.signAsync(msg, sk);
  return bytesToHex(sig);
}
