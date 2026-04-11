/**
 * OnPay brand logo.
 *
 * Two variants:
 *   - "wordmark" (default): the full rocket + "OnPay" wordmark, used in
 *     headers and the footer. Served from /public/logo.png via Next/Image
 *     so the client gets an optimized WebP/AVIF automatically.
 *   - "mark": just the rocket icon, used in tight spaces.
 *
 * Accessibility:
 *   - Always renders an <img> with a meaningful `alt`. When used as a nav
 *     link, callers should NOT wrap in another interactive element; the
 *     parent <a> or <Link> already carries the role.
 *   - `priority` defaults to false. Set `priority` on the hero/above-fold
 *     instance to give it LCP treatment.
 */
import Image from "next/image";

type LogoProps = {
  readonly variant?: "wordmark" | "mark";
  /** CSS pixel height on screen. Width is auto-computed from the aspect ratio. */
  readonly height?: number;
  /** Give the above-fold logo instance priority for LCP. */
  readonly priority?: boolean;
  readonly className?: string;
};

// Intrinsic dimensions of the source files. Updating these lets Next.js
// precompute the correct width for a given display height and avoid layout shift.
const WORDMARK = {
  src: "/logo.png",
  intrinsicWidth: 900,
  intrinsicHeight: 315,
  alt: "OnPay",
};

const MARK = {
  src: "/logo-mark.png",
  intrinsicWidth: 256,
  intrinsicHeight: 256,
  alt: "OnPay",
};

export function Logo({
  variant = "wordmark",
  height = 32,
  priority = false,
  className,
}: LogoProps): React.JSX.Element {
  const asset = variant === "mark" ? MARK : WORDMARK;
  const width = Math.round((asset.intrinsicWidth / asset.intrinsicHeight) * height);
  return (
    <Image
      src={asset.src}
      alt={asset.alt}
      width={width}
      height={height}
      priority={priority}
      className={className}
    />
  );
}
