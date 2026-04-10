import { describe, expect, it } from "vitest";

import type {
  MerchantRepository,
  UpsertMerchantInput as RepoInput,
} from "@/application/ports/merchant-repo";
import { upsertMerchant } from "@/application/use-cases/upsert-merchant";
import type { Merchant, MerchantId } from "@/domain/entities/merchant";
import { domainError } from "@/domain/errors";
import { err, isErr, isOk, ok, unwrap } from "@/lib/result";

const VALID_WALLET = "5UCFmJUu7c3DWj1xBrCv1AyGS3aXYPGS9LCWJfP9Q4qF";
const VALID_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

function makeFakeRepo(): {
  repo: MerchantRepository;
  lastUpsert: { input?: RepoInput };
} {
  const state: { input?: RepoInput } = {};
  const repo: MerchantRepository = {
    findById: () => Promise.resolve(ok(null)),
    findByWallet: () => Promise.resolve(ok(null)),
    upsert: (input) => {
      state.input = input;
      const merchant: Merchant = {
        id: "merch_1" as MerchantId,
        walletAddress: input.walletAddress,
        businessName: input.businessName,
        settlementMint: input.settlementMint,
        preferredLanguage: input.preferredLanguage,
        createdAt: new Date("2026-04-10T12:00:00Z"),
        updatedAt: new Date("2026-04-10T12:00:00Z"),
      };
      return Promise.resolve(ok(merchant));
    },
  };
  return { repo, lastUpsert: state };
}

describe("upsertMerchant use case", () => {
  it("creates a merchant with valid input", async () => {
    const { repo, lastUpsert } = makeFakeRepo();
    const result = await upsertMerchant(
      {
        walletAddress: VALID_WALLET,
        businessName: "Kopi Canggu",
        settlementMint: VALID_MINT,
        preferredLanguage: "en",
      },
      { merchants: repo },
    );
    expect(isOk(result)).toBe(true);
    const merchant = unwrap(result);
    expect(merchant.businessName).toBe("Kopi Canggu");
    expect(lastUpsert.input?.walletAddress).toBe(VALID_WALLET);
  });

  it("rejects invalid wallet shape", async () => {
    const { repo } = makeFakeRepo();
    const result = await upsertMerchant(
      {
        walletAddress: "not-a-real-wallet",
        businessName: null,
        settlementMint: VALID_MINT,
        preferredLanguage: "en",
      },
      { merchants: repo },
    );
    expect(isErr(result)).toBe(true);
  });

  it("rejects oversized business name", async () => {
    const { repo } = makeFakeRepo();
    const result = await upsertMerchant(
      {
        walletAddress: VALID_WALLET,
        businessName: "x".repeat(201),
        settlementMint: VALID_MINT,
        preferredLanguage: "en",
      },
      { merchants: repo },
    );
    expect(isErr(result)).toBe(true);
  });

  it("rejects malformed settlement mint", async () => {
    const { repo } = makeFakeRepo();
    const result = await upsertMerchant(
      {
        walletAddress: VALID_WALLET,
        businessName: null,
        settlementMint: "too-short",
        preferredLanguage: "en",
      },
      { merchants: repo },
    );
    expect(isErr(result)).toBe(true);
  });

  it("propagates repository errors", async () => {
    const failingRepo: MerchantRepository = {
      findById: () => Promise.resolve(ok(null)),
      findByWallet: () => Promise.resolve(ok(null)),
      upsert: () => Promise.resolve(err(domainError("UPSTREAM_FAILURE", "db down"))),
    };
    const result = await upsertMerchant(
      {
        walletAddress: VALID_WALLET,
        businessName: null,
        settlementMint: VALID_MINT,
        preferredLanguage: "en",
      },
      { merchants: failingRepo },
    );
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.kind).toBe("UPSTREAM_FAILURE");
    }
  });
});
