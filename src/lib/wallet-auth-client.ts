/**
 * Client-side wallet sign-in flow.
 *
 * Wraps the nonce → sign → verify round-trip into a single function so the
 * dashboard component doesn't need to know the details. Accepts the wallet
 * context's `signMessage` callback (not the whole context, to keep this
 * helper testable without a React tree).
 */
import { requestNonceApi, verifyAuthApi } from "./api-client";

export type SignMessageFn = (message: Uint8Array) => Promise<Uint8Array>;

/**
 * Run the full sign-in flow for a wallet:
 *   1. POST /api/auth/nonce → get challenge JWT and human-readable message.
 *   2. Ask the wallet to sign the message bytes via Wallet Standard signMessage.
 *   3. POST /api/auth/verify → server sets the httpOnly session cookie on success.
 */
export async function signInWithWallet(
  walletAddress: string,
  signMessage: SignMessageFn,
): Promise<void> {
  // 1. Request a challenge from the server.
  const { message, challenge } = await requestNonceApi(walletAddress);

  // 2. Ask the wallet to sign the UTF-8 bytes of the message.
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = await signMessage(messageBytes);

  if (signatureBytes.length !== 64) {
    throw new Error(
      `Wallet returned a ${String(signatureBytes.length)}-byte signature; expected 64 (ed25519)`,
    );
  }

  // 3. Encode the raw signature bytes as base64 so we can safely ship them
  //    over JSON, then hand them to the verify endpoint.
  const signatureBase64 = toBase64(signatureBytes);
  await verifyAuthApi({
    walletAddress,
    challenge,
    signature: signatureBase64,
  });
}

/** Encode a Uint8Array to base64 in a browser-safe way. */
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
