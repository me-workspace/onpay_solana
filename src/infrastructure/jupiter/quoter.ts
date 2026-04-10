/**
 * Jupiter v6 Swap API adapter — implementation of `SwapQuoter`.
 *
 * Wraps the Jupiter HTTPS API with:
 * - Zod validation of responses (never trust upstream JSON)
 * - Explicit timeouts
 * - Domain-level error mapping
 *
 * Two endpoints are wrapped:
 *   1. GET  /v6/quote               — find the best route for an exact-out swap
 *   2. POST /v6/swap-instructions   — get the on-chain instructions for that route
 *
 * Both responses are validated with narrow Zod schemas — only fields we
 * actually consume are required to be present, so Jupiter can ship new fields
 * without breaking us.
 */
import { z } from "zod";

import type {
  FetchInstructionsRequest,
  QuoteRequest,
  SerializedInstruction,
  SwapInstructions,
  SwapQuote,
  SwapQuoter,
} from "@/application/ports/swap-quoter";
import { serverEnv } from "@/config/env";
import { domainError, type DomainError } from "@/domain/errors";
import { err, ok, tryAsync, type Result } from "@/lib/result";

const QUOTE_TIMEOUT_MS = 6_000;
const SWAP_INSTRUCTIONS_TIMEOUT_MS = 8_000;

// ---------------------------------------------------------------------------
// Zod schemas — validate every field we consume.
// ---------------------------------------------------------------------------
const quoteResponseSchema = z
  .object({
    inAmount: z.string(),
    outAmount: z.string(),
    slippageBps: z.number().int(),
    routePlan: z.array(z.unknown()),
  })
  .passthrough();

const serializedInstructionSchema = z.object({
  programId: z.string(),
  accounts: z.array(
    z.object({
      pubkey: z.string(),
      isSigner: z.boolean(),
      isWritable: z.boolean(),
    }),
  ),
  data: z.string(),
});

const swapInstructionsResponseSchema = z.object({
  computeBudgetInstructions: z.array(serializedInstructionSchema).default([]),
  setupInstructions: z.array(serializedInstructionSchema).default([]),
  swapInstruction: serializedInstructionSchema,
  cleanupInstructions: z.array(serializedInstructionSchema).default([]),
  addressLookupTableAddresses: z.array(z.string()).default([]),
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function fetchWithTimeout(
  url: string,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Cast the validated swap-instructions Zod result to our domain type. */
function toSwapInstructions(
  parsed: z.infer<typeof swapInstructionsResponseSchema>,
): SwapInstructions {
  const map = (ix: z.infer<typeof serializedInstructionSchema>): SerializedInstruction => ({
    programId: ix.programId,
    accounts: ix.accounts.map((a) => ({
      pubkey: a.pubkey,
      isSigner: a.isSigner,
      isWritable: a.isWritable,
    })),
    data: ix.data,
  });
  return {
    computeBudgetInstructions: parsed.computeBudgetInstructions.map(map),
    setupInstructions: parsed.setupInstructions.map(map),
    swapInstruction: map(parsed.swapInstruction),
    cleanupInstructions: parsed.cleanupInstructions.map(map),
    addressLookupTableAddresses: parsed.addressLookupTableAddresses,
  };
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------
export function createJupiterQuoter(): SwapQuoter {
  return {
    async quoteExactOut(request: QuoteRequest): Promise<Result<SwapQuote, DomainError>> {
      // Hard slippage cap — never let the caller request more than configured.
      if (request.slippageBps > serverEnv.JUPITER_MAX_SLIPPAGE_BPS) {
        return err(
          domainError(
            "VALIDATION_FAILED",
            `Slippage ${String(request.slippageBps)} exceeds max ${String(
              serverEnv.JUPITER_MAX_SLIPPAGE_BPS,
            )} bps`,
          ),
        );
      }

      const url = new URL(`${serverEnv.JUPITER_API_URL}/quote`);
      url.searchParams.set("inputMint", request.inputMint);
      url.searchParams.set("outputMint", request.outputMint);
      url.searchParams.set("amount", request.outputAmount.toString());
      url.searchParams.set("swapMode", "ExactOut");
      url.searchParams.set("slippageBps", request.slippageBps.toString());
      url.searchParams.set("onlyDirectRoutes", "false");

      const responseResult = await tryAsync(
        fetchWithTimeout(
          url.toString(),
          { headers: { accept: "application/json" } },
          QUOTE_TIMEOUT_MS,
        ),
        (cause) => ({ cause }),
      );
      if (!responseResult.ok) {
        return err(
          domainError("UPSTREAM_FAILURE", "Jupiter quote request failed", {
            cause: responseResult.error.cause,
          }),
        );
      }

      const response = responseResult.value;
      if (!response.ok) {
        return err(
          domainError("UPSTREAM_FAILURE", `Jupiter quote returned HTTP ${String(response.status)}`),
        );
      }

      const jsonResult = await tryAsync(response.json() as Promise<unknown>, (cause) => ({
        cause,
      }));
      if (!jsonResult.ok) {
        return err(
          domainError("UPSTREAM_FAILURE", "Jupiter quote response was not valid JSON", {
            cause: jsonResult.error.cause,
          }),
        );
      }

      const parsed = quoteResponseSchema.safeParse(jsonResult.value);
      if (!parsed.success) {
        return err(
          domainError("UPSTREAM_FAILURE", "Jupiter quote response failed schema validation", {
            details: parsed.error.flatten(),
          }),
        );
      }

      // We pass the entire parsed quote object as `opaqueQuote` so the
      // swap-instructions endpoint can receive it back verbatim.
      return ok({
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        inputAmount: BigInt(parsed.data.inAmount),
        outputAmount: BigInt(parsed.data.outAmount),
        slippageBps: parsed.data.slippageBps,
        opaqueQuote: parsed.data,
      });
    },

    async fetchSwapInstructions(
      request: FetchInstructionsRequest,
    ): Promise<Result<SwapInstructions, DomainError>> {
      const url = `${serverEnv.JUPITER_API_URL}/swap-instructions`;
      const body: Record<string, unknown> = {
        userPublicKey: request.userPublicKey,
        quoteResponse: request.quote.opaqueQuote,
        wrapAndUnwrapSol: true,
        // We do NOT use the deprecated `feeAccount` field. Protocol fees in
        // Phase 2 will be a separate atomic instruction inside the same tx.
        useSharedAccounts: true,
        // Compute unit limit / price are configured per-tx by the builder,
        // not by Jupiter, so we leave these defaults alone.
      };
      if (request.destinationTokenAccount !== null) {
        body.destinationTokenAccount = request.destinationTokenAccount;
      }

      const responseResult = await tryAsync(
        fetchWithTimeout(
          url,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              accept: "application/json",
            },
            body: JSON.stringify(body),
          },
          SWAP_INSTRUCTIONS_TIMEOUT_MS,
        ),
        (cause) => ({ cause }),
      );
      if (!responseResult.ok) {
        return err(
          domainError("UPSTREAM_FAILURE", "Jupiter swap-instructions request failed", {
            cause: responseResult.error.cause,
          }),
        );
      }

      const response = responseResult.value;
      if (!response.ok) {
        return err(
          domainError(
            "UPSTREAM_FAILURE",
            `Jupiter swap-instructions returned HTTP ${String(response.status)}`,
          ),
        );
      }

      const jsonResult = await tryAsync(response.json() as Promise<unknown>, (cause) => ({
        cause,
      }));
      if (!jsonResult.ok) {
        return err(
          domainError("UPSTREAM_FAILURE", "Jupiter swap-instructions response was not JSON", {
            cause: jsonResult.error.cause,
          }),
        );
      }

      const parsed = swapInstructionsResponseSchema.safeParse(jsonResult.value);
      if (!parsed.success) {
        return err(
          domainError(
            "UPSTREAM_FAILURE",
            "Jupiter swap-instructions response failed schema validation",
            { details: parsed.error.flatten() },
          ),
        );
      }

      return ok(toSwapInstructions(parsed.data));
    },
  };
}
