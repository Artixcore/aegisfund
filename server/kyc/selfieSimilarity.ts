import sharp from "sharp";
import { loadKycImageBytes } from "./localKycStorage";

/**
 * 8×8 average hash (64 bits) for coarse duplicate detection between selfie poses.
 */
export async function averageHashFromImageBuffer(buf: Buffer): Promise<bigint | null> {
  try {
    const { data } = await sharp(buf)
      .resize(8, 8, { fit: "fill" })
      .greyscale()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const pixels = data;
    let sum = 0;
    for (let i = 0; i < 64; i++) sum += pixels[i] ?? 0;
    const mean = sum / 64;
    let bits = 0n;
    for (let i = 0; i < 64; i++) {
      if ((pixels[i] ?? 0) >= mean) bits |= 1n << BigInt(i);
    }
    return bits;
  } catch {
    return null;
  }
}

export async function averageHashFromUrl(url: string): Promise<bigint | null> {
  try {
    const buf = await loadKycImageBytes(url);
    if (!buf || buf.length > 6 * 1024 * 1024) return null;
    return averageHashFromImageBuffer(buf);
  } catch {
    return null;
  }
}

export function hammingDistance64(a: bigint, b: bigint): number {
  let x = a ^ b;
  let c = 0;
  while (x !== 0n) {
    c++;
    x &= x - 1n;
  }
  return c;
}

/**
 * If any pair of selfies is perceptually too similar, returns a user-facing rejection reason.
 * @param maxHamming — lower = stricter (default 10 on a 64-bit hash).
 */
export async function checkSelfiePoseDiversity(
  urls: readonly [string, string, string],
  maxHamming = 10,
): Promise<string | null> {
  const hashes = await Promise.all(urls.map((u) => averageHashFromUrl(u.trim())));
  if (hashes.some((h) => h === null)) return null;
  const pairs: [number, number][] = [
    [0, 1],
    [0, 2],
    [1, 2],
  ];
  for (const [i, j] of pairs) {
    const hi = hashes[i]!;
    const hj = hashes[j]!;
    if (hammingDistance64(hi, hj) <= maxHamming) {
      return "Photos appear too similar—use three clearly different poses (neutral face, head turned, holding ID next to your face).";
    }
  }
  return null;
}
