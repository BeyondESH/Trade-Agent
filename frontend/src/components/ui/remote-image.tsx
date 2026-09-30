import type React from "react";
import { useState } from "react";
import { cn } from "../../lib/utils";

interface Props {
  src?: string | null;
  alt: string;
  className?: string;
  /** Shown in place of the image when it is absent or fails to load. */
  fallback?: React.ReactNode;
}

/**
 * Remote logo/icon with the failure semantics a terminal needs: decode off the
 * main thread, load lazily, and never leave a broken-image glyph behind.
 *
 * Exchange and chain logos come from third-party CDNs, which are not always
 * reachable from a given network. A failed load must degrade quietly - a broken
 * icon reads as a defect, and a hanging request is worse.
 */
export const RemoteImage: React.FC<Props> = ({ src, alt, className, fallback = null }) => {
  const [failed, setFailed] = useState(false);

  if (!src || failed) return <>{fallback}</>;

  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      className={cn(className)}
    />
  );
};
