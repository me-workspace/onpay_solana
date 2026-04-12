/**
 * Unit test for the payment transaction builder — the Week 1 critical spike.
 *
 * We feed the use case fully fake ports (SwapQuoter + SolanaClient) and
 * verify that the resulting base64 transaction:
 *
 *   1. Decodes into a valid VersionedTransaction
 *   2. Contains the expected instructions (compute budget, ATA create, swap, memo)
 *   3. Fits inside Solana's 1232-byte transaction size limit
 *
 * No network. No real Jupiter. No real RPC.
 */
import { VersionedTransaction } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import type { AddressLookupTable, SolanaClient } from "@/application/ports/solana-client";
import type {
  FetchInstructionsRequest,
  QuoteRequest,
  SwapInstructions,
  SwapQuote,
  SwapQuoter,
} from "@/application/ports/swap-quoter";
import { buildPaymentTransaction } from "@/application/use-cases/build-payment-transaction";
import type { Invoice, InvoiceId } from "@/domain/entities/invoice";
import type { Merchant, MerchantId } from "@/domain/entities/merchant";
import type { Money } from "@/domain/value-objects/money";
import type { InvoiceReference } from "@/domain/value-objects/reference";
import type { WalletAddress } from "@/domain/value-objects/wallet-address";
import { isErr, isOk, ok, unwrap } from "@/lib/result";

// ---------------------------------------------------------------------------
// Real base58 pubkeys (32-byte) so web3.js doesn't reject them.
// These are well-known mainnet addresses; using them in tests is fine.
// ---------------------------------------------------------------------------
const BUYER_WALLET = "5UCFmJUu7c3DWj1xBrCv1AyGS3aXYPGS9LCWJfP9Q4qF";
const MERCHANT_WALLET = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const SOL_MINT = "So11111111111111111111111111111111111111112";
const FAKE_BLOCKHASH = "EkSnNWid2cvwEVnVx9aBqawnmiCNiDgp3gUdkDPTKN1N";
/** Real base58 pubkey used as a fake reference. Jupiter-style token account. */
const FAKE_REFERENCE = "BVNo8ftg2LkkssnWT4ZWdtoFaevnfD6ExYeramwM27pe";

// A made-up but well-formed program id for the fake "Jupiter swap" instruction.
const FAKE_JUPITER_PROGRAM = "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4";

// ---------------------------------------------------------------------------
// Domain fixtures
// ---------------------------------------------------------------------------
const fakeMerchant: Merchant = {
  id: "merch_1" as MerchantId,
  walletAddress: MERCHANT_WALLET as WalletAddress,
  businessName: "Kopi Canggu",
  settlementMint: USDC_MINT,
  preferredLanguage: "en",
  createdAt: new Date("2026-04-01T00:00:00Z"),
  updatedAt: new Date("2026-04-01T00:00:00Z"),
};

const usdcAmount: Money = { amount: 4_000_000n, currency: "USDC", decimals: 6 };

const fakeInvoice: Invoice = {
  id: "inv_1" as InvoiceId,
  merchantId: fakeMerchant.id,
  reference: FAKE_REFERENCE as InvoiceReference,
  amount: usdcAmount,
  label: "Iced Latte",
  memo: null,
  status: "pending",
  expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1h from now
  createdAt: new Date("2026-04-10T12:00:00Z"),
};

// ---------------------------------------------------------------------------
// Fake ports
// ---------------------------------------------------------------------------
function makeFakeSolanaClient(): SolanaClient {
  return {
    getLatestBlockhash: () =>
      Promise.resolve(
        ok({
          blockhash: FAKE_BLOCKHASH,
          lastValidBlockHeight: 123_456,
        }),
      ),
    getAddressLookupTables: (pubkeys: readonly string[]) => {
      const tables: AddressLookupTable[] = pubkeys.map((p) => ({
        pubkey: p,
        addresses: [],
      }));
      return Promise.resolve(ok(tables));
    },
    findSignaturesForReference: () => Promise.resolve(ok([])),
    checkHealth: () => Promise.resolve(ok(true as const)),
    getFeePagerBalance: () => Promise.resolve(ok(500_000_000)),
  };
}

/**
 * Builds a fake Jupiter quote+instructions pair. The "swap instruction" is
 * a no-op against a made-up program ID — the test only cares that the
 * builder composes it into the transaction correctly, not that it would
 * execute on-chain.
 */
function makeFakeSwapQuoter(): SwapQuoter {
  return {
    quoteExactOut: (request: QuoteRequest) => {
      const quote: SwapQuote = {
        inputMint: request.inputMint,
        outputMint: request.outputMint,
        // Buyer would need ~0.04 SOL to get 4 USDC (illustrative).
        inputAmount: 40_000_000n,
        outputAmount: request.outputAmount,
        slippageBps: request.slippageBps,
        opaqueQuote: { fake: true },
      };
      return Promise.resolve(ok(quote));
    },
    fetchSwapInstructions: (_request: FetchInstructionsRequest) => {
      const instructions: SwapInstructions = {
        computeBudgetInstructions: [],
        setupInstructions: [],
        // Minimal valid instruction shape: 1 program, 0 accounts, empty data.
        swapInstruction: {
          programId: FAKE_JUPITER_PROGRAM,
          accounts: [],
          data: "",
        },
        cleanupInstructions: [],
        addressLookupTableAddresses: [],
      };
      return Promise.resolve(ok(instructions));
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("buildPaymentTransaction (critical spike)", () => {
  it("returns a base64-encoded VersionedTransaction within Solana's 1232-byte limit", async () => {
    const result = await buildPaymentTransaction(
      {
        invoice: fakeInvoice,
        merchant: fakeMerchant,
        buyerWallet: BUYER_WALLET,
        inputMint: SOL_MINT,
        slippageBps: 100,
      },
      {
        solana: makeFakeSolanaClient(),
        swap: makeFakeSwapQuoter(),
      },
    );

    expect(isOk(result)).toBe(true);
    const output = unwrap(result);

    // Decode the base64 back into a VersionedTransaction.
    const buffer = Buffer.from(output.transactionBase64, "base64");
    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.length).toBeLessThanOrEqual(1232);

    const tx = VersionedTransaction.deserialize(buffer);
    expect(tx.version).toBe(0);
    expect(tx.message.recentBlockhash).toBe(FAKE_BLOCKHASH);

    // The composed instructions: 2 compute budget + 1 ATA create + 1 swap + 1 memo = 5
    expect(tx.message.compiledInstructions.length).toBe(5);

    // Output amount should match the invoice amount.
    expect(output.outputAmount).toBe(fakeInvoice.amount.amount);
  });

  it("rejects an expired invoice", async () => {
    const expired: Invoice = {
      ...fakeInvoice,
      expiresAt: new Date(Date.now() - 1000),
    };
    const result = await buildPaymentTransaction(
      {
        invoice: expired,
        merchant: fakeMerchant,
        buyerWallet: BUYER_WALLET,
        inputMint: SOL_MINT,
        slippageBps: 100,
      },
      { solana: makeFakeSolanaClient(), swap: makeFakeSwapQuoter() },
    );
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.kind).toBe("EXPIRED");
    }
  });

  it("rejects a non-pending invoice", async () => {
    const paid: Invoice = { ...fakeInvoice, status: "paid" };
    const result = await buildPaymentTransaction(
      {
        invoice: paid,
        merchant: fakeMerchant,
        buyerWallet: BUYER_WALLET,
        inputMint: SOL_MINT,
        slippageBps: 100,
      },
      { solana: makeFakeSolanaClient(), swap: makeFakeSwapQuoter() },
    );
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.kind).toBe("CONFLICT");
    }
  });

  it("rejects an invalid buyer pubkey", async () => {
    const result = await buildPaymentTransaction(
      {
        invoice: fakeInvoice,
        merchant: fakeMerchant,
        buyerWallet: "not-a-real-pubkey",
        inputMint: SOL_MINT,
        slippageBps: 100,
      },
      { solana: makeFakeSolanaClient(), swap: makeFakeSwapQuoter() },
    );
    expect(isErr(result)).toBe(true);
    if (!result.ok) {
      expect(result.error.kind).toBe("VALIDATION_FAILED");
    }
  });
});
