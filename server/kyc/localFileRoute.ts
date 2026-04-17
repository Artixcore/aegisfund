import type { Express, Request, Response } from "express";
import fs from "node:fs/promises";
import { sdk } from "../_core/sdk";
import {
  absolutePathForLocalKyc,
  mimeFromFileName,
} from "./localKycStorage";

export function registerKycLocalFileRoute(app: Express): void {
  app.get(
    "/api/kyc/file/:userId/:fileName",
    async (req: Request, res: Response) => {
      const userId = parseInt(String(req.params.userId), 10);
      const rawName = req.params.fileName;
      const fileName =
        typeof rawName === "string" ? decodeURIComponent(rawName) : "";

      if (!Number.isFinite(userId) || userId < 1 || !fileName) {
        res.status(400).end();
        return;
      }

      let sessionUser;
      try {
        sessionUser = await sdk.authenticateRequest(req);
      } catch {
        res.status(401).end();
        return;
      }

      if (sessionUser.id !== userId && sessionUser.role !== "admin") {
        res.status(403).end();
        return;
      }

      const abs = absolutePathForLocalKyc(userId, fileName);
      if (!abs) {
        res.status(404).end();
        return;
      }

      try {
        const buf = await fs.readFile(abs);
        res.setHeader("Content-Type", mimeFromFileName(fileName));
        res.setHeader("Content-Disposition", "inline");
        res.send(buf);
      } catch {
        res.status(404).end();
      }
    }
  );
}
