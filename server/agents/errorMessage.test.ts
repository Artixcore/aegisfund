import { describe, expect, it } from "vitest";
import { AGENT_ERROR_MESSAGE_MAX_LEN, toAgentErrorMessage } from "./errorMessage";

describe("toAgentErrorMessage", () => {
  it("uses Error.message for Error instances", () => {
    expect(toAgentErrorMessage(new Error("LLM timeout"))).toBe("LLM timeout");
  });

  it("stringifies non-Error values", () => {
    expect(toAgentErrorMessage("plain")).toBe("plain");
    expect(toAgentErrorMessage(42)).toBe("42");
  });

  it("truncates long messages", () => {
    const long = "x".repeat(AGENT_ERROR_MESSAGE_MAX_LEN + 100);
    const out = toAgentErrorMessage(new Error(long));
    expect(out.length).toBe(AGENT_ERROR_MESSAGE_MAX_LEN);
    expect(out).toBe("x".repeat(AGENT_ERROR_MESSAGE_MAX_LEN));
  });
});
