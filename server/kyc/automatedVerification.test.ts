import { describe, expect, it } from "vitest";
import {
  documentTypeRequiresDocumentBack,
  parseLlmVerificationJson,
  runRulesVerification,
  validateKycCompleteness,
} from "./automatedVerification";

describe("parseLlmVerificationJson", () => {
  it("parses bare JSON", () => {
    expect(parseLlmVerificationJson('{"approved":true,"rejectionReason":null}')).toEqual({
      approved: true,
      rejectionReason: null,
    });
  });

  it("extracts JSON from surrounding text", () => {
    expect(
      parseLlmVerificationJson('Here is the result:\n{"approved":false,"rejectionReason":"No match"}\n'),
    ).toEqual({ approved: false, rejectionReason: "No match" });
  });

  it("returns null on invalid input", () => {
    expect(parseLlmVerificationJson("not json")).toBeNull();
  });
});

describe("documentTypeRequiresDocumentBack", () => {
  it("is false for passport", () => {
    expect(documentTypeRequiresDocumentBack("Passport")).toBe(false);
  });
  it("is true for other types", () => {
    expect(documentTypeRequiresDocumentBack("National ID Card")).toBe(true);
  });
});

describe("validateKycCompleteness / runRulesVerification", () => {
  const base = {
    id: 1,
    userId: 1,
    status: "pending" as const,
    tier: "none" as const,
    fullName: "Jane Doe",
    dateOfBirth: "1990-01-15",
    nationality: "United States",
    countryOfResidence: "United States",
    documentType: "Passport",
    documentNumber: "AB1234567",
    documentFrontUrl: "https://example.com/front.jpg",
    documentBackUrl: null,
    selfieUrl: null,
    selfieUrl1: "https://example.com/s1.jpg",
    selfieUrl2: "https://example.com/s2.jpg",
    selfieUrl3: "https://example.com/s3.jpg",
    rejectionReason: null,
    submittedAt: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  it("approves when all required fields are present (passport)", () => {
    expect(runRulesVerification(base).status).toBe("approved");
  });

  it("rejects when a selfie is missing", () => {
    expect(validateKycCompleteness({ ...base, selfieUrl2: null })).toMatch(/complete/i);
    expect(runRulesVerification({ ...base, selfieUrl2: null }).status).toBe("rejected");
  });

  it("requires document back for non-passport", () => {
    const idCard = { ...base, documentType: "National ID Card", documentBackUrl: null };
    expect(validateKycCompleteness(idCard)).toMatch(/back/i);
    const idCardOk = {
      ...idCard,
      documentBackUrl: "https://example.com/back.jpg",
    };
    expect(validateKycCompleteness(idCardOk)).toBeNull();
  });
});
