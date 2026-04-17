import type { KycProfile } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getKycProfile, upsertKycProfile } from "../db";
import { getLlmManager } from "../llm/manager";
import type { InvokeParams, InvokeResult, Message } from "../llm/types";
import { checkSelfiePoseDiversity } from "./selfieSimilarity";

export type AutomatedKycOutcome = {
  status: "approved" | "rejected";
  rejectionReason?: string | null;
};

type VerificationMode = "auto" | "llm" | "rules";

function resolveMode(): VerificationMode {
  const raw = ENV.kycVerificationMode;
  if (raw === "llm" || raw === "rules" || raw === "auto") return raw;
  return "auto";
}

/** Avoid probing LLM at module load — check keys/env instead. */
function hasLikelyLlmForVision(): boolean {
  return Boolean(
    ENV.llmApiKey?.trim() ||
      ENV.openaiApiKey?.trim() ||
      ENV.geminiApiKey?.trim() ||
      ENV.xaiApiKey?.trim() ||
      ENV.deepseekApiKey?.trim(),
  );
}

function textFromInvokeResult(result: InvokeResult): string {
  const raw = result?.choices?.[0]?.message?.content;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    return raw
      .filter((p): p is { type: "text"; text: string } => p.type === "text")
      .map((p) => p.text)
      .join("");
  }
  return "";
}

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

async function fetchAsDataUrl(url: string): Promise<{ dataUrl: string; mime: string } | null> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > MAX_IMAGE_BYTES) return null;
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/jpeg";
  if (!mime.startsWith("image/")) return null;
  const b64 = buf.toString("base64");
  return { dataUrl: `data:${mime};base64,${b64}`, mime };
}

function isProbablyPdfUrl(url: string): boolean {
  return /\.pdf($|\?)/i.test(url);
}

/** Non-passport types need a back image for MRZ / address / barcode consistency. */
export function documentTypeRequiresDocumentBack(documentType: string | null | undefined): boolean {
  return (documentType ?? "").trim().toLowerCase() !== "passport";
}

export function validateKycCompleteness(p: KycProfile | null): string | null {
  if (!p) return "No KYC profile found.";
  const need = [
    ["fullName", p.fullName],
    ["dateOfBirth", p.dateOfBirth],
    ["nationality", p.nationality],
    ["countryOfResidence", p.countryOfResidence],
    ["documentType", p.documentType],
    ["documentNumber", p.documentNumber],
    ["documentFrontUrl", p.documentFrontUrl],
    ["selfieUrl1", p.selfieUrl1],
    ["selfieUrl2", p.selfieUrl2],
    ["selfieUrl3", p.selfieUrl3],
  ] as const;
  for (const [, v] of need) {
    if (v == null || String(v).trim().length === 0) {
      return "Please complete all steps before submitting.";
    }
  }
  if (String(p.documentNumber).trim().length < 4) {
    return "Document number appears invalid.";
  }
  if (documentTypeRequiresDocumentBack(p.documentType)) {
    const back = p.documentBackUrl;
    if (back == null || String(back).trim().length === 0) {
      return "Please upload the back of your document for this ID type.";
    }
  }
  return null;
}

export function runRulesVerification(p: KycProfile): AutomatedKycOutcome {
  const err = validateKycCompleteness(p);
  if (err) {
    return { status: "rejected", rejectionReason: err };
  }
  return { status: "approved" };
}

type LlmParsed = {
  approved?: boolean;
  rejectionReason?: string | null;
};

export function parseLlmVerificationJson(raw: string): LlmParsed | null {
  const trimmed = raw.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    return JSON.parse(jsonMatch[0]) as LlmParsed;
  } catch {
    return null;
  }
}

async function runSelfiePoseDiversityCheck(p: KycProfile): Promise<string | null> {
  const max = ENV.kycSelfiePoseMaxHamming;
  if (max === null) return null;
  const u1 = p.selfieUrl1?.trim();
  const u2 = p.selfieUrl2?.trim();
  const u3 = p.selfieUrl3?.trim();
  if (!u1 || !u2 || !u3) return null;
  return checkSelfiePoseDiversity([u1, u2, u3], max);
}

async function runLlmVerification(p: KycProfile): Promise<AutomatedKycOutcome> {
  const baseErr = validateKycCompleteness(p);
  if (baseErr) {
    return { status: "rejected", rejectionReason: baseErr };
  }

  const frontUrl = p.documentFrontUrl!.trim();
  const s1 = p.selfieUrl1!.trim();
  const s2 = p.selfieUrl2!.trim();
  const s3 = p.selfieUrl3!.trim();

  if (isProbablyPdfUrl(frontUrl)) {
    return {
      status: "rejected",
      rejectionReason:
        "Automated verification needs a photo (JPG or PNG) of your ID, not a PDF. Please upload a clear image of the document.",
    };
  }

  const backUrl = p.documentBackUrl?.trim();
  const backFetch =
    backUrl && !isProbablyPdfUrl(backUrl) ? fetchAsDataUrl(backUrl) : Promise.resolve(null);
  const [front, b, selfie1, selfie2, selfie3] = await Promise.all([
    fetchAsDataUrl(frontUrl),
    backFetch,
    fetchAsDataUrl(s1),
    fetchAsDataUrl(s2),
    fetchAsDataUrl(s3),
  ]);

  if (!front || !selfie1 || !selfie2 || !selfie3) {
    return {
      status: "rejected",
      rejectionReason: "Could not load your document or selfie images. Check that uploads completed and try again.",
    };
  }

  if (documentTypeRequiresDocumentBack(p.documentType) && backUrl && !b) {
    return {
      status: "rejected",
      rejectionReason: "Could not load the back of your document. Upload a JPG or PNG (not PDF) for the back side.",
    };
  }

  const declared = {
    fullName: p.fullName,
    dateOfBirth: p.dateOfBirth,
    nationality: p.nationality,
    countryOfResidence: p.countryOfResidence,
    documentType: p.documentType,
    documentNumber: p.documentNumber,
  };

  const system = `You are an automated identity verification engine for a financial application.
You will see: identity document image(s), and THREE separate user selfies in fixed roles.

Evaluate strictly:
1) Document: Must be a plausible government-issued ID (passport, national ID, driver's license, or residence permit). Reject screenshots, obvious forgeries, or non-ID documents.
2) Declared JSON vs document: Names, date of birth, and document number on the ID must match the declared fields (allow minor formatting: spaces, name order, date formats). The visible document number must match the declared documentNumber.
3) Jurisdiction coherence: Issuing country, authority, or language on the ID should be consistent with declared nationality and country of residence where inferable. Flag clear mismatches (e.g. wrong country's template).
4) Same person: The face in ALL three selfies must be the same real person as the ID portrait (or the same person if the ID has no photo). Reject if any selfie looks like a different person, a printed photo of a face, or a screen replay.
5) Pose protocol: Selfie 1 should be a neutral frontal face; selfie 2 should show a visibly different head angle than selfie 1; selfie 3 should show the user holding the ID next to their face. Reject if poses are not meaningfully different or if selfie 3 does not show the document with the user.
6) If a document back image is provided, use it to support authenticity (MRZ, barcode, address) when visible.

Respond with ONLY valid JSON (no markdown), shape:
{"approved":boolean,"rejectionReason":string|null}
Use a short, user-facing rejectionReason when approved is false.`;

  const userContent: Message["content"] = [
    { type: "text", text: `Declared data (JSON):\n${JSON.stringify(declared, null, 2)}` },
    { type: "text", text: "Identity document (front):" },
    { type: "image_url", image_url: { url: front.dataUrl, detail: "high" } },
  ];

  if (b) {
    userContent.push(
      { type: "text", text: "Identity document (back):" },
      { type: "image_url", image_url: { url: b.dataUrl, detail: "high" } },
    );
  }

  userContent.push(
    { type: "text", text: "Selfie 1 — neutral, face visible:" },
    { type: "image_url", image_url: { url: selfie1.dataUrl, detail: "high" } },
    { type: "text", text: "Selfie 2 — different head angle:" },
    { type: "image_url", image_url: { url: selfie2.dataUrl, detail: "high" } },
    { type: "text", text: "Selfie 3 — holding ID next to face:" },
    { type: "image_url", image_url: { url: selfie3.dataUrl, detail: "high" } },
  );

  const messages: Message[] = [
    { role: "system", content: system },
    { role: "user", content: userContent },
  ];

  const params: InvokeParams = {
    messages,
    maxTokens: 900,
    llm: ENV.kycLlmModel.trim()
      ? { model: ENV.kycLlmModel.trim() }
      : undefined,
  };

  let result: InvokeResult;
  try {
    result = await getLlmManager().invoke(params);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[KYC] LLM verification failed:", msg);
    return {
      status: "rejected",
      rejectionReason: "Automated verification is temporarily unavailable. Please try again in a few minutes.",
    };
  }

  const text = textFromInvokeResult(result);
  const parsed = parseLlmVerificationJson(text);
  if (!parsed || typeof parsed.approved !== "boolean") {
    return {
      status: "rejected",
      rejectionReason: "Could not complete automated document analysis. Please retake photos with better lighting and try again.",
    };
  }

  if (parsed.approved) {
    return { status: "approved" };
  }
  return {
    status: "rejected",
    rejectionReason: parsed.rejectionReason?.trim() || "Verification did not pass automated checks.",
  };
}

function resolveEffectiveMode(): "llm" | "rules" {
  const mode = resolveMode();
  if (mode === "rules") return "rules";
  if (mode === "llm") {
    if (!hasLikelyLlmForVision()) {
      throw new Error(
        "KYC_VERIFICATION_MODE=llm but no LLM API key is configured. Set LLM_API_KEY or OPENAI_API_KEY (or another provider key), or use KYC_VERIFICATION_MODE=rules or auto.",
      );
    }
    return "llm";
  }
  return hasLikelyLlmForVision() ? "llm" : "rules";
}

/**
 * Runs automated KYC (rules-only or vision LLM) and persists outcome on the profile.
 */
export async function runAutomatedKycVerification(userId: number): Promise<AutomatedKycOutcome> {
  const profile = await getKycProfile(userId);
  if (!profile) {
    const o: AutomatedKycOutcome = { status: "rejected", rejectionReason: "No KYC profile found." };
    await upsertKycProfile(userId, {
      status: "rejected",
      rejectionReason: o.rejectionReason ?? undefined,
      reviewedAt: new Date(),
    });
    return o;
  }

  const completeErr = validateKycCompleteness(profile);
  if (completeErr) {
    const reviewedAt = new Date();
    await upsertKycProfile(userId, {
      status: "rejected",
      rejectionReason: completeErr,
      reviewedAt,
    });
    return { status: "rejected", rejectionReason: completeErr };
  }

  const poseDupReason = await runSelfiePoseDiversityCheck(profile);
  if (poseDupReason) {
    const o: AutomatedKycOutcome = { status: "rejected", rejectionReason: poseDupReason };
    const reviewedAt = new Date();
    await upsertKycProfile(userId, {
      status: "rejected",
      rejectionReason: poseDupReason,
      reviewedAt,
    });
    return o;
  }

  const effective = resolveEffectiveMode();
  let outcome: AutomatedKycOutcome;
  if (effective === "llm") {
    outcome = await runLlmVerification(profile);
  } else {
    outcome = runRulesVerification(profile);
  }

  const reviewedAt = new Date();
  if (outcome.status === "approved") {
    await upsertKycProfile(userId, {
      status: "approved",
      rejectionReason: null,
      reviewedAt,
    });
  } else {
    await upsertKycProfile(userId, {
      status: "rejected",
      rejectionReason: outcome.rejectionReason ?? "Verification failed.",
      reviewedAt,
    });
  }

  return outcome;
}
