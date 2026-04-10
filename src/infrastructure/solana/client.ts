/**
 * Solana RPC client — infrastructure implementation of `SolanaClient`.
 *
 * Wraps `@solana/web3.js` Connection with:
 * - timeouts on every call (RPC endpoints can hang indefinitely otherwise)
 * - Result-based error handling (no unhandled rejections)
 * - optional fallback URL (primary→fallback retry on transport failure)
 * - health check for the `/api/health` endpoint
 */
import { Connection, PublicKey } from "@solana/web3.js";

import type { AddressLookupTable, SolanaClient } from "@/application/ports/solana-client";
import { serverEnv } from "@/config/env.server";
import { domainError } from "@/domain/errors";
import { err, ok, tryAsync, type Result } from "@/lib/result";

const RPC_TIMEOUT_MS = 8_000;

/**
 * Race a promise against a timeout. If the timeout fires first, the returned
 * promise rejects with a clear error.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${String(ms)}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (cause: unknown) => {
        clearTimeout(timer);
        reject(cause instanceof Error ? cause : new Error(String(cause)));
      },
    );
  });
}

function createConnection(url: string): Connection {
  return new Connection(url, {
    commitment: "confirmed",
    disableRetryOnRateLimit: false,
  });
}

export function createSolanaClient(): SolanaClient {
  const primary = createConnection(serverEnv.SOLANA_RPC_URL);
  const fallbackUrl = serverEnv.SOLANA_RPC_FALLBACK_URL;
  const fallback =
    fallbackUrl !== undefined && fallbackUrl.length > 0 ? createConnection(fallbackUrl) : null;

  /** Run an RPC call against the primary, fall back to secondary on failure. */
  async function runWithFallback<T>(
    label: string,
    call: (conn: Connection) => Promise<T>,
  ): Promise<Result<T, ReturnType<typeof domainError>>> {
    const primaryResult = await tryAsync(
      withTimeout(call(primary), RPC_TIMEOUT_MS, label),
      (cause) => ({ cause }),
    );
    if (primaryResult.ok) return ok(primaryResult.value);

    if (fallback === null) {
      return err(
        domainError("UPSTREAM_FAILURE", `Solana RPC failed: ${label}`, {
          cause: primaryResult.error.cause,
        }),
      );
    }

    const fallbackResult = await tryAsync(
      withTimeout(call(fallback), RPC_TIMEOUT_MS, `${label} (fallback)`),
      (cause) => ({ cause }),
    );
    if (fallbackResult.ok) return ok(fallbackResult.value);

    return err(
      domainError("UPSTREAM_FAILURE", `Solana RPC failed (both endpoints): ${label}`, {
        cause: fallbackResult.error.cause,
      }),
    );
  }

  return {
    async getLatestBlockhash() {
      return runWithFallback("getLatestBlockhash", (conn) => conn.getLatestBlockhash("finalized"));
    },

    async getAddressLookupTables(pubkeys) {
      if (pubkeys.length === 0) return ok([]);
      const result = await runWithFallback("getAddressLookupTables", async (conn) => {
        const keys = pubkeys.map((p) => new PublicKey(p));
        const accounts = await Promise.all(
          keys.map((key) => conn.getAddressLookupTable(key).then((res) => res.value)),
        );
        const tables: AddressLookupTable[] = [];
        accounts.forEach((account, i) => {
          if (account === null) return;
          tables.push({
            pubkey: pubkeys[i] ?? "",
            addresses: account.state.addresses.map((a) => a.toBase58()),
          });
        });
        return tables;
      });
      return result;
    },

    async checkHealth() {
      const result = await runWithFallback("getVersion", (conn) => conn.getVersion());
      return result.ok ? ok(true as const) : err(result.error);
    },
  };
}
