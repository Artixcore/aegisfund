/**
 * Uploads an opaque blob to a self-hosted pinning HTTP endpoint.
 * Server must accept multipart field `file` and respond JSON `{ "cid": "..." }`.
 */
export async function uploadBlobToPinningApi(opts: {
  blob: Blob;
  filename: string;
  apiUrl: string;
  bearerToken?: string;
}): Promise<{ cid: string }> {
  const fd = new FormData();
  fd.append("file", opts.blob, opts.filename);
  const headers: HeadersInit = {};
  if (opts.bearerToken) headers.Authorization = `Bearer ${opts.bearerToken}`;
  const res = await fetch(opts.apiUrl, { method: "POST", body: fd, headers });
  if (!res.ok) throw new Error(`Pinning upload failed: ${res.status}`);
  const j = (await res.json()) as { cid?: string };
  if (!j.cid || typeof j.cid !== "string") throw new Error("Pinning response missing cid");
  return { cid: j.cid };
}

export function getIpfsGatewayUrl(cid: string, gatewayBase: string): string {
  const base = gatewayBase.replace(/\/$/, "");
  return `${base}/ipfs/${cid}`;
}
