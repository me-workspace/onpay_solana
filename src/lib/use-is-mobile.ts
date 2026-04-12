"use client";

/**
 * Detect whether the current browser is a mobile device.
 *
 * Uses `navigator.userAgent` — imperfect but it's the standard approach
 * for this class of problem (adapting UI for wallet-extension vs deep-link
 * flows, where CSS media queries don't help because the distinction is
 * about capability, not viewport width).
 *
 * Returns `false` during SSR and the first hydration pass to avoid
 * mismatches. Flips after the first client-side effect tick.
 */
import { useEffect, useState } from "react";

const MOBILE_UA_REGEX = /Android|iPhone|iPad|iPod|webOS|BlackBerry|Opera Mini|IEMobile/i;

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setIsMobile(MOBILE_UA_REGEX.test(navigator.userAgent));
  }, []);

  return isMobile;
}
