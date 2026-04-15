import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes } from "./authRoutes";
import { getServerBuildInfo } from "./buildInfo";
import { appRouter, startBackgroundServices } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

/** Fail fast in dev if the in-memory router does not match source (avoids silent TRPC 404s). */
function assertAuthTrpcProceduresLoaded() {
  if (process.env.NODE_ENV !== "development") return;
  const procedures = appRouter._def.procedures as Record<string, unknown>;
  const required = ["auth.registrationGate", "auth.registerDapp"] as const;
  const missing = required.filter((p) => procedures[p] == null);
  if (missing.length > 0) {
    console.error(
      `[tRPC] Expected procedures are missing from appRouter: ${missing.join(", ")}. ` +
        "Restart the dev server after changing server/routers.ts."
    );
    process.exit(1);
  }
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  assertAuthTrpcProceduresLoaded();
  const app = express();
  app.set("trust proxy", 1);
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerAuthRoutes(app);

  const buildInfo = getServerBuildInfo();
  app.get("/api/version", (_req, res) => {
    res.setHeader("X-Aegis-App-Version", buildInfo.version);
    res.json(buildInfo);
  });

  // tRPC API
  app.use(
    "/api/trpc",
    (req, res, next) => {
      res.setHeader("X-Aegis-App-Version", buildInfo.version);
      next();
    },
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.warn(
      `Port ${preferredPort} is busy; serving on http://localhost:${port}/ instead.\n` +
        `Open that exact URL in the browser so /api/trpc hits this process (not another app on port ${preferredPort}).`
    );
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    startBackgroundServices();
  });
}

startServer().catch(console.error);
