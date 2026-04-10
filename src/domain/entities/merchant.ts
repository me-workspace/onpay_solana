/**
 * Merchant entity — represents a business that accepts payments via OnPay.
 *
 * A merchant is identified by their Solana wallet address. That wallet
 * address is also the settlement destination: payments land directly in the
 * merchant's own wallet, never a custodial account controlled by OnPay.
 */
import type { WalletAddress } from "../value-objects/wallet-address";

export type MerchantId = string & { readonly __brand: "MerchantId" };

export type Merchant = {
  readonly id: MerchantId;
  readonly walletAddress: WalletAddress;
  readonly businessName: string | null;
  /** Mint address (base58) of the SPL token the merchant wants to receive. Usually USDC. */
  readonly settlementMint: string;
  /** ISO language code ("en" | "id"). */
  readonly preferredLanguage: "en" | "id";
  readonly createdAt: Date;
  readonly updatedAt: Date;
};
