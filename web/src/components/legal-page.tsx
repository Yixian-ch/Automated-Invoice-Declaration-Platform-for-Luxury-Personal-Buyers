import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** Shared shell for the legal pages linked from the homepage footer */
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="relative min-h-screen bg-surface text-ink">
      <div className="bg-texture-weave pointer-events-none absolute inset-0" />

      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/brand/ruichi-mark.png"
            alt="Ruichi"
            width={22}
            height={27}
            className="h-6 w-auto"
          />
          <span className="text-sm font-medium tracking-wide text-ink">Ruichi</span>
        </Link>
        <Link href="/" className="text-sm text-ink/70 transition-colors hover:text-ink">
          ← Home
        </Link>
      </header>

      <article className="relative z-10 mx-auto max-w-3xl px-6 pb-24 pt-10 sm:px-10">
        <h1
          className="text-3xl font-light leading-tight sm:text-4xl"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          {title}
        </h1>
        <div className="mt-3 h-px w-10 bg-gold" />
        <div className="mt-10 space-y-4 text-sm leading-relaxed text-ink/80">{children}</div>
      </article>
    </main>
  );
}

export function LegalH2({ children }: { children: ReactNode }) {
  return (
    <h2
      className="pt-6 text-lg font-medium text-ink first:pt-0"
      style={{ fontFamily: "var(--font-serif)" }}
    >
      {children}
    </h2>
  );
}

/** Emphasised callout for the data-confidentiality warning clause */
export function LegalWarning({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 rounded border-l-2 border-gold bg-gold/5 px-4 py-3 text-ink/90">
      {children}
    </div>
  );
}
