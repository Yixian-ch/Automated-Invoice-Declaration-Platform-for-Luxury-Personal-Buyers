import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-lg">
        <p className="text-xs tracking-[0.3em] uppercase text-muted">
          Luxury Invoice Declaration Platform
        </p>
        <h1 className="text-5xl font-light" style={{ fontFamily: "var(--font-serif)" }}>
          LIDP
        </h1>
        <div className="w-12 h-px bg-gold mx-auto" />
        <p className="text-muted text-sm leading-relaxed">
          Secure invoice declaration and cashback management for professional luxury resellers.
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link href="/login" className="btn-primary">
            Sign In
          </Link>
          <Link href="/register" className="btn-ghost">
            Register with invite code
          </Link>
        </div>
      </div>
    </main>
  );
}
