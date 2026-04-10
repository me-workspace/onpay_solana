/**
 * Jupiter v6 Swap API adapter — implementation of `SwapQuoter`.
 *
 * Wraps the Jupiter HTTPS API with:
 * - Zod validation of responses (never trust upstream JSON)
 * - Explicit timeouts
 * - Domain-level error mapping
 *
 * We only implement `quoteExactOut` for now, which is what the payment flow
 * needs: "how much of token X do we need to swap to receive exactly $Y of USDC?"
 * Quote IDs are preserved so the transaction builder can call
 * `/swap-instructions` with the same route in a follow-up call.
 */
import { z } from "zod";

import type { QuoteRequest, SwapQuote, SwapQuoter } from "@/application/ports/swap-quoter";
import { serverEnv } from "@/config/env";
import { domainError, type DomainError } from "@/domain/errors";
import { err, ok, tryAsync, type Result } from "@/lib/result";

const QUOTE_TIMEOUT_MS = 6_000;

/** Minimal Zod schema for the Jupiter /quote response. We only validate fields we use. */
const quoteResponseSchema = z.object({
  inAmount: z.string(),
  outAmount: z.string(),
  slippageBps: z.number().int(),
  // Full route plan is opaque to us — pass it along to the swap-instructions endpoint.
  routePlan: z.array(z.unknown()),
});

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, QUOTE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function createJupiterQuoter(): SwapQuoter {
  return {
    async quoteExactOut(request: QuoteRequest): Promise<Result<SwapQuote, DomainError>> {
      // Hard slippage cap — never let the caller request more than the configured limit.
      if (request.slippageBps > serverEnv.JUPITER_MAX_SLIPPAGE_BPS) {
        return err(
          domainError(
            "VALIDATION_FAILED",
            `Slippage ${String(request.slippageBps)} exceeds max ${String(serverEnv.JUPITER_MAX_SLIPPAGE_BPS)} bps`,
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
        fetchWithTimeout(url.toString(), { headers: { accept: "application/json" } }),
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

      // We intentionally keep the quote id opaque. The swap-instructions endpoint
      // accepts the raw quote response object; at this stage we only need a
      // placeholder. A follow-up task will serialize the full quote for use
      // by the transaction builder.
      return ok({
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        inputAmount: BigInt(parsed.data.inAmount),
        outputAmount: BigInt(parsed.data.outAmount),
        slippageBps: parsed.data.slippageBps,
        quoteId: JSON.stringify(parsed.data),
      });
    },
  };
}
