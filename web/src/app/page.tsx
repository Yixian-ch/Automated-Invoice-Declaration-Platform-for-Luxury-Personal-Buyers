import Link from "next/link";

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-lg">
        <p className="text-xs tracking-[0.3em] uppercase text-muted">
          奢侈品买手报税平台
        </p>
        <h1 className="text-5xl font-light" style={{ fontFamily: "var(--font-serif)" }}>
          LIDP
        </h1>
        <div className="w-12 h-px bg-gold mx-auto" />
        <p className="text-muted text-sm leading-relaxed">
          专业买手的安全小票申报与返点管理平台。
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link href="/login" className="btn-primary">
            登录
          </Link>
          <Link href="/register" className="btn-ghost">
            使用邀请码注册
          </Link>
        </div>
      </div>
    </main>
  );
}
