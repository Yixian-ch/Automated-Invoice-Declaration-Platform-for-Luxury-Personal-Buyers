'use client';

import { useAuth } from '@/lib/auth-context';

/**
 * Tiled, low-opacity background watermark showing the signed-in user's name.
 * Sits behind page content (fixed, non-interactive) as a light anti-leak mark.
 */
export function NameWatermark() {
  const { user } = useAuth();
  if (!user) return null;

  const name = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;
  const tiles = Array.from({ length: 60 });

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
    >
      <div
        className="flex flex-wrap gap-x-16 gap-y-20 opacity-[0.05]"
        style={{ transform: "rotate(-30deg) scale(1.5)" }}
      >
        {tiles.map((_, i) => (
          <span
            key={i}
            className="whitespace-nowrap text-sm tracking-wider text-ink"
          >
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
