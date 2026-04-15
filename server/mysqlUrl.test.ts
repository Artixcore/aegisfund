import { describe, expect, it } from "vitest";
import { mysqlUrlToPoolOptions, normalizeMysqlDatabaseUrl } from "../shared/mysqlUrl";

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

describe("mysqlUrlToPoolOptions", () => {
  it("produces credentials from raw DATABASE_URL without uri (safe for passwords with %)", () => {
    const opts = mysqlUrlToPoolOptions("mysql://u:100%off@127.0.0.1:3306/mydb");
    expect(opts).toMatchObject({
      host: "127.0.0.1",
      port: 3306,
      user: "u",
      password: "100%off",
      database: "mydb",
    });
    expect(opts.uri).toBeUndefined();
  });

  it("strips IPv6 brackets for mysql2 host", () => {
    const canonical = "mysql://u:p@[::1]:3306/db";
    const opts = mysqlUrlToPoolOptions(canonical);
    expect(opts.host).toBe("::1");
    expect(opts.port).toBe(3306);
  });
});
