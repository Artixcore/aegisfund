export async function verifyEthPersonalSign(params: {
  address: string;
  message: string;
  signatureHex: string;
}): Promise<boolean> {
  const sig = params.signatureHex.trim();
  if (!sig.startsWith("0x")) return false;
  try {
    const { isAddress, verifyMessage } = await import("viem");
    if (!isAddress(params.address)) return false;
    return verifyMessage({
      address: params.address,
      message: params.message,
      signature: sig as `0x${string}`,
    });
  } catch (err) {
    console.warn("[Messaging] viem not available or verify failed:", err);
    return false;
  }
}
