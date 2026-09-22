import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden bg-surface text-ink">
      <div className="bg-texture-weave pointer-events-none absolute inset-0" />

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-6 sm:px-10">
        <div className="flex items-center gap-2">
          <Image
            src="/brand/ruichi-mark.png"
            alt="Ruichi"
            width={22}
            height={27}
            className="h-6 w-auto"
            priority
          />
          <span className="text-sm font-medium tracking-wide text-ink">Ruichi</span>
        </div>
        <nav className="hidden items-center gap-8 text-sm text-ink/70 sm:flex">
          <span>You will have</span>
          <span>Contact us</span>
          <Link href="/login" className="hover:text-ink transition-colors">
            Private Space
          </Link>
        </nav>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <div className="relative z-10 flex flex-1 items-center justify-center px-6 py-24">
        <div className="mx-auto max-w-xl text-center">
          <h1
            className="text-6xl font-light leading-none sm:text-7xl lg:text-8xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            Ruichi
          </h1>

          <div className="mt-8 space-y-3">
            <p className="text-base leading-relaxed text-ink/80">
              Ruichi 是一款百分之百数字化去中心化的对接应用，将世界各大精品与客人建立高效隐私通道。
            </p>
            <p className="text-sm italic leading-relaxed text-ink/50">
              Ruichi is a fully digital, decentralized platform connecting the world&rsquo;s
              finest maisons with their clients through an efficient, private channel.
            </p>
          </div>

          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link href="/login" className="btn-dark">
              进入 Private Space
            </Link>
            <button type="button" className="btn-outline-light">
              Reach Out
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Footer — liens légaux ──────────────────────────────── */}
      <footer className="relative z-10 px-6 pb-8 sm:px-10">
        <nav className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-ink/50">
          <Link href="/terms" className="transition-colors hover:text-ink">
            Terms of Use
          </Link>
          <Link href="/legal-notice" className="transition-colors hover:text-ink">
            Legal Notice
          </Link>
          <Link href="/data-protection" className="transition-colors hover:text-ink">
            Data Protection &amp; Confidentiality
          </Link>
          <Link href="/privacy" className="transition-colors hover:text-ink">
            Privacy Policy
          </Link>
        </nav>
      </footer>
    </main>
  );
}
