import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  deleteBrokerConnection,
  getUserExecutionPrefsRow,
  insertAuditLog,
  listMaskedBrokerConnectionsForUser,
  saveBrokerConnectionEncrypted,
  upsertUserExecutionPrefs,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { brokerCoverageForMode, saveBrokerConnectionInputSchema } from "./brokerTypes";

export const tradingRouter = router({
  /** Masked connections + default execution mode + per-asset coverage for current mode. */
  listStatus: protectedProcedure.query(async ({ ctx }) => {
    const [connections, prefs] = await Promise.all([
      listMaskedBrokerConnectionsForUser(ctx.user.id),
      getUserExecutionPrefsRow(ctx.user.id),
    ]);
    const coverage = brokerCoverageForMode(prefs.defaultMode, connections);
    return { defaultMode: prefs.defaultMode, connections, coverage };
  }),

  saveConnection: protectedProcedure.input(saveBrokerConnectionInputSchema).mutation(async ({ ctx, input }) => {
    try {
      const { id } = await saveBrokerConnectionEncrypted(ctx.user.id, input);
      await insertAuditLog({
        actorUserId: ctx.user.id,
        action: input.id != null ? "broker_connection_update" : "broker_connection_create",
        resource: "broker_connection",
        resourceId: id,
        metadata: {
          assetClass: input.assetClass,
          venue: input.venue,
          environment: input.environment,
        },
      });
      return { success: true as const, id };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/duplicate|Duplicate|ER_DUP_ENTRY/i.test(msg)) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "A connection already exists for this asset class, venue, and environment. Remove it or edit the existing row.",
        });
      }
      if (msg === "Connection not found") {
        throw new TRPCError({ code: "NOT_FOUND", message: msg });
      }
      console.error("[trading.saveConnection]", e);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to save broker connection",
      });
    }
  }),

  deleteConnection: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const ok = await deleteBrokerConnection(ctx.user.id, input.id);
      if (!ok) throw new TRPCError({ code: "NOT_FOUND", message: "Connection not found" });
      await insertAuditLog({
        actorUserId: ctx.user.id,
        action: "broker_connection_delete",
        resource: "broker_connection",
        resourceId: input.id,
      });
      return { success: true as const };
    }),

  setExecutionMode: protectedProcedure
    .input(z.object({ defaultMode: z.enum(["backtest", "paper", "live"]) }))
    .mutation(async ({ ctx, input }) => {
      await upsertUserExecutionPrefs(ctx.user.id, input.defaultMode);
      await insertAuditLog({
        actorUserId: ctx.user.id,
        action: "execution_mode_set",
        resource: "user_execution_prefs",
        resourceId: ctx.user.id,
        metadata: { defaultMode: input.defaultMode },
      });
      return { success: true as const };
    }),
});
