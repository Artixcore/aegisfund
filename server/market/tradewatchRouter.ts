import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { ENV } from "../_core/env";
import { publicProcedure, router } from "../_core/trpc";
import { TradeWatchHttpError } from "../tradewatch/client";
import { getMarketDataProvider } from "./marketDataService";
import { MARKET_CATEGORY_INFO, MARKET_CATEGORIES } from "./types";

const marketCategorySchema = z.enum(MARKET_CATEGORIES);

const historicalResolutionSchema = z.enum([
  "5",
  "10",
  "30",
  "60",
  "120",
  "240",
  "480",
  "600",
  "1800",
  "3600",
  "7200",
  "14400",
  "21600",
  "43200",
  "86400",
  "172800",
]);

function requireTradewatchConfigured() {
  if (!ENV.tradewatchApiKey.trim()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: "TradeWatch is not configured. Set TRADEWATCH_API_KEY in the environment.",
    });
  }
}

function toTrpcError(err: unknown): TRPCError {
  if (err instanceof TRPCError) return err;
  if (err instanceof TradeWatchHttpError) {
    const detail = err.responseBody ?? err.message;
    if (err.status === 401) {
      return new TRPCError({ code: "UNAUTHORIZED", message: "TradeWatch rejected the API key." });
    }
    if (err.status === 403) {
      return new TRPCError({ code: "FORBIDDEN", message: "TradeWatch denied access for this request." });
    }
    if (err.status === 404) {
      return new TRPCError({ code: "NOT_FOUND", message: "TradeWatch returned not found for this resource." });
    }
    if (err.status === 422) {
      return new TRPCError({
        code: "BAD_REQUEST",
        message: `TradeWatch validation error: ${detail}`,
      });
    }
    if (err.status === 429) {
      return new TRPCError({ code: "TOO_MANY_REQUESTS", message: "TradeWatch rate limit exceeded. Try again later." });
    }
    if (err.status >= 500) {
      return new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "TradeWatch service error. Please try again later.",
      });
    }
    return new TRPCError({
      code: "BAD_REQUEST",
      message: `TradeWatch request failed: ${detail}`,
    });
  }
  console.error("[TradeWatch] Unexpected error:", err);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: err instanceof Error ? err.message : "Unexpected error calling TradeWatch",
  });
}

export const tradewatchRouter = router({
  listCategories: publicProcedure.query(() => ({
    categories: MARKET_CATEGORY_INFO,
  })),

  getQuote: publicProcedure
    .input(
      z.object({
        category: marketCategorySchema,
        symbol: z.string().min(1).max(128),
        precision: z.number().int().min(0).max(18).optional(),
      }),
    )
    .query(async ({ input }) => {
      requireTradewatchConfigured();
      try {
        return await getMarketDataProvider().getLastQuote(input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  getQuotes: publicProcedure
    .input(
      z
        .object({
          category: marketCategorySchema,
          symbols: z.array(z.string().min(1).max(64)).min(1).max(40),
          precision: z.number().int().min(0).max(18).optional(),
        })
        .refine((v) => v.symbols.join(",").length <= 50, {
          message: "Combined symbols (comma-separated) must be at most 50 characters per TradeWatch API limits.",
        }),
    )
    .query(async ({ input }) => {
      requireTradewatchConfigured();
      try {
        return await getMarketDataProvider().getLastQuotes(input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  getHistoricalOhlc: publicProcedure
    .input(
      z
        .object({
          category: marketCategorySchema,
          symbol: z.string().min(1).max(128),
          resolution: historicalResolutionSchema,
          start: z.number().int().positive(),
          end: z.number().int().positive(),
        })
        .refine((v) => v.end > v.start, { message: "`end` must be greater than `start` (Unix seconds)." }),
    )
    .query(async ({ input }) => {
      requireTradewatchConfigured();
      try {
        return await getMarketDataProvider().getHistoricalOhlc(input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),

  listSymbols: publicProcedure
    .input(
      z.object({
        category: marketCategorySchema,
        size: z.number().int().min(0).max(500).optional(),
        cursor: z.string().max(2048).optional(),
        mode: z.string().max(64).optional(),
        type: z.string().max(64).optional(),
        country: z.string().max(8).optional(),
        filter: z.string().max(128).optional(),
      }),
    )
    .query(async ({ input }) => {
      requireTradewatchConfigured();
      try {
        return await getMarketDataProvider().listSymbols(input);
      } catch (e) {
        throw toTrpcError(e);
      }
    }),
});
