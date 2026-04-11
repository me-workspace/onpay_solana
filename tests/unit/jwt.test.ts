/**
 * Unit tests for the JWT sign/verify helpers.
 *
 * We set JWT_SECRET on process.env BEFORE importing the module so the
 * env validator sees a valid secret at load time. This is a deliberate
 * exception to the "no side effects in test files" rule — jwt.ts reads
 * the secret eagerly via `env.server.ts` on first import.
 */
import { beforeAll, describe, expect, it } from "vitest";

import type * as JwtModule from "@/lib/jwt";

// Set up env before importing any server modules. `process.env` is typed
// as read-only for NODE_ENV in some Node type defs, so we mutate via the
// bracket form which bypasses that specific narrowing.
const testEnv = process.env as Record<string, string>;
testEnv.JWT_SECRET = "test-secret-that-is-at-least-32-characters-long-for-zod-validation";
testEnv.SESSION_TTL_SECONDS = "3600";
testEnv.DATABASE_URL = "postgres://test:test@localhost:5432/test";
testEnv.SOLANA_RPC_URL = "https://api.devnet.solana.com";
testEnv.DEFAULT_SETTLEMENT_MINT = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
testEnv.NODE_ENV = "test";

describe("JWT helpers", () => {
  let jwt: typeof JwtModule;

  beforeAll(async () => {
    jwt = await import("@/lib/jwt");
  });

  describe("challenge tokens", () => {
    it("round-trips a challenge successfully", async () => {
      const token = await jwt.signChallenge({
        wallet: "8XJ8AbcDefGhiJkmNopQrsTuvWxyzAbcDefGhiJkFYXC",
        nonce: "random-nonce-123",
      });
      expect(typeof token).toBe("string");
      expect(token.split(".").length).toBe(3); // JWT header.payload.signature

      const verified = await jwt.verifyChallenge(token);
      expect(verified.wallet).toBe("8XJ8AbcDefGhiJkmNopQrsTuvWxyzAbcDefGhiJkFYXC");
      expect(verified.nonce).toBe("random-nonce-123");
    });

    it("rejects a tampered challenge", async () => {
      const token = await jwt.signChallenge({ wallet: "wallet1", nonce: "nonce1" });
      // Flip the last few chars of the signature segment.
      const tampered = `${token.slice(0, -4)}XXXX`;
      await expect(jwt.verifyChallenge(tampered)).rejects.toThrow();
    });

    it("rejects a session token passed as a challenge", async () => {
      const sessionToken = await jwt.signSession({ wallet: "w" });
      await expect(jwt.verifyChallenge(sessionToken)).rejects.toThrow(/challenge/i);
    });
  });

  describe("session tokens", () => {
    it("round-trips a session successfully", async () => {
      const token = await jwt.signSession({ wallet: "wallet_a" });
      const verified = await jwt.verifySession(token);
      expect(verified).not.toBeNull();
      expect(verified?.wallet).toBe("wallet_a");
    });

    it("returns null on a tampered session (never throws)", async () => {
      const token = await jwt.signSession({ wallet: "w" });
      const tampered = `${token.slice(0, -4)}XXXX`;
      const verified = await jwt.verifySession(tampered);
      expect(verified).toBeNull();
    });

    it("returns null on a challenge token passed as a session", async () => {
      const challengeToken = await jwt.signChallenge({ wallet: "w", nonce: "n" });
      const verified = await jwt.verifySession(challengeToken);
      expect(verified).toBeNull();
    });

    it("returns null on complete garbage input", async () => {
      const verified = await jwt.verifySession("not-a-token");
      expect(verified).toBeNull();
    });
  });
});
