import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { resolveMysqlDatabaseUrl } from "./shared/mysqlUrl";

const connectionString = resolveMysqlDatabaseUrl();

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle",
  dialect: "mysql",
  dbCredentials: {
    url: connectionString,
  },
});
