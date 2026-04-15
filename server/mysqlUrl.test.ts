import { describe, expect, it } from "vitest";
import { normalizeMysqlDatabaseUrl } from "../shared/mysqlUrl";

describe("normalizeMysqlDatabaseUrl", () => {
  it("re-encodes passwords with raw percent signs so mysql2 can parse the URL", () => {
    const out = normalizeMysqlDatabaseUrl("mysql://u:100%off@127.0.0.1:3306/aegis_fund");
    expect(out).toBe("mysql://u:100%25off@127.0.0.1:3306/aegis_fund");
  });

  it("preserves query string", () => {
    const out = normalizeMysqlDatabaseUrl(
      "mysql://a:b@h:3306/db?sslaccept=strict",
    );
    expect(out).toContain("?sslaccept=strict");
  });

  it("round-trips a typical local dev URL", () => {
    const raw = "mysql://aegis:aegis_local@127.0.0.1:3306/aegis_fund";
    expect(normalizeMysqlDatabaseUrl(raw)).toBe(raw);
  });
});
