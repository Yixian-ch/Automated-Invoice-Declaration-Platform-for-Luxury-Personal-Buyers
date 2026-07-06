import Image from "next/image";
import Link from "next/link";
import {
  Users,
  Store,
  ShieldCheck,
  Sparkles,
  FileText,
  CalendarCheck,
  ClipboardList,
  Receipt,
  Gem,
  BadgeCheck,
  ArrowRight,
} from "lucide-react";

const partnerPoints = [
  { icon: Users, text: "领队、个人买手、直播间等多元合作伙伴" },
  { icon: Store, text: "覆盖各大品牌与精品店的专属特权" },
  { icon: Sparkles, text: "高端咨询服务，一对一响应需求" },
  { icon: Receipt, text: "发票与佣金的行政管理，全流程线上化" },
];

const boutiquePoints = [
  { icon: Users, text: "触达超过 5,000 名商务合作伙伴" },
  { icon: Gem, text: "对接 300 万+ 购买力强劲的国际客户" },
  { icon: ShieldCheck, text: "简单且安全的销售流程" },
  { icon: Receipt, text: "发票与佣金的行政管理，全流程线上化" },
];

const features = [
  {
    icon: FileText,
    title: "信息与店家直接对接",
    desc: "实时获取品牌与精品店的资讯，直接建立联系。",
  },
  {
    icon: CalendarCheck,
    title: "到访预约管理",
    desc: "在线制定客户的进店到访计划，提前锁定接待安排。",
  },
  {
    icon: ClipboardList,
    title: "游客名单管理",
    desc: "统一管理 Rooming List，团队协作更高效。",
  },
  {
    icon: Receipt,
    title: "发票与佣金管理",
    desc: "自动统计佣金、管理发票凭证，告别人工对账。",
  },
  {
    icon: Sparkles,
    title: "专属咨询与定制服务",
    desc: "提供专业咨询，协助寻找客户心仪的特殊款式。",
  },
  {
    icon: BadgeCheck,
    title: "统一凭证认证管理",
    desc: "所有交易凭证集中存档，审核与追溯一目了然。",
  },
];

const stats = [
  { value: "5,000+", label: "商务合作伙伴" },
  { value: "300万+", label: "国际化高购买力客户" },
  { value: "2024.02", label: "平台正式上线" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-surface text-ink">
      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Image
              src="/brand/feeluxe-mark.png"
              alt="FeeLuxe"
              width={22}
              height={27}
              className="h-6 w-auto"
              priority
            />
            <Image
              src="/brand/feeluxe-wordmark.png"
              alt="FEELUXE"
              width={428}
              height={72}
              className="h-4 w-auto"
              priority
            />
          </div>
          <nav className="hidden items-center gap-8 text-xs uppercase tracking-widest text-muted md:flex">
            <a href="#about" className="hover:text-ink transition-colors">关于我们</a>
            <a href="#model" className="hover:text-ink transition-colors">合作模式</a>
            <a href="#features" className="hover:text-ink transition-colors">服务功能</a>
          </nav>
          <Link href="/login" className="btn-primary text-xs px-5 py-2.5">
            返点平台
          </Link>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────────────────── */}
      <section id="about" className="relative overflow-hidden bg-ink text-white">
        <div className="pointer-events-none absolute inset-0 opacity-[0.06]">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-gold blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-gold blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 py-28 text-center">
          <p className="text-xs tracking-[0.35em] uppercase text-gold">
            FeeLuxe · 高端零售数字化平台
          </p>
          <h1
            className="mt-6 text-4xl leading-tight font-light sm:text-5xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            连接高端精品店与商务合作伙伴的数字化平台
          </h1>
          <p className="mt-4 text-sm italic text-white/50">
            La plateforme qui connecte Boutique de Luxe et Apporteurs d&rsquo;Affaire
          </p>
          <div className="mx-auto mt-8 h-px w-12 bg-gold" />
          <p className="mx-auto mt-8 max-w-xl text-sm leading-relaxed text-white/70">
            FeeLuxe 是一款百分之百数字化的对接应用，将品牌精品店与领队、个人买手、
            直播间等商务合作伙伴连接在一起，提供从客户引荐到发票、佣金结算的完整闭环。
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/login"
              className="btn-gold inline-flex items-center gap-2"
            >
              进入返点平台
              <ArrowRight className="h-4 w-4" />
            </Link>
            <a
              href="#model"
              className="text-sm text-white/60 underline-offset-4 hover:text-white hover:underline transition-colors"
            >
              了解合作模式
            </a>
          </div>
        </div>

        {/* Stats band */}
        <div className="relative border-t border-white/10">
          <div className="mx-auto grid max-w-4xl grid-cols-1 divide-y divide-white/10 sm:grid-cols-3 sm:divide-y-0 sm:divide-x">
            {stats.map((s) => (
              <div key={s.label} className="px-6 py-8 text-center">
                <div
                  className="text-2xl font-light text-gold sm:text-3xl"
                  style={{ fontFamily: "var(--font-serif)" }}
                >
                  {s.value}
                </div>
                <div className="mt-1 text-xs uppercase tracking-widest text-white/50">
                  {s.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 合作模式 ───────────────────────────────────────────── */}
      <section id="model" className="mx-auto max-w-6xl px-6 py-24">
        <div className="text-center">
          <p className="text-xs tracking-[0.3em] uppercase text-gold">合作模式</p>
          <h2
            className="mt-3 text-3xl font-light"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            百分之百的数字化对接
          </h2>
          <div className="mx-auto mt-6 h-px w-12 bg-gold" />
        </div>

        <div className="mt-16 grid gap-8 md:grid-cols-2">
          <div className="card-luxury">
            <p className="text-xs uppercase tracking-widest text-gold">
              Apporteurs d&rsquo;Affaires
            </p>
            <h3
              className="mt-2 text-2xl font-light"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              商务合作伙伴
            </h3>
            <ul className="mt-6 space-y-4">
              {partnerPoints.map((p) => (
                <li key={p.text} className="flex items-start gap-3 text-sm text-ink/80">
                  <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="card-luxury">
            <p className="text-xs uppercase tracking-widest text-gold">Boutiques</p>
            <h3
              className="mt-2 text-2xl font-light"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              奢侈品店家
            </h3>
            <ul className="mt-6 space-y-4">
              {boutiquePoints.map((p) => (
                <li key={p.text} className="flex items-start gap-3 text-sm text-ink/80">
                  <p.icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                  <span>{p.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── 服务功能 ───────────────────────────────────────────── */}
      <section id="features" className="border-t border-border bg-white py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center">
            <p className="text-xs tracking-[0.3em] uppercase text-gold">服务功能</p>
            <h2
              className="mt-3 text-3xl font-light"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              为商务合作伙伴提供的服务功能
            </h2>
            <div className="mx-auto mt-6 h-px w-12 bg-gold" />
          </div>

          <div className="mt-16 grid gap-px overflow-hidden border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div key={f.title} className="bg-white p-8">
                <f.icon className="h-5 w-5 text-gold" />
                <h3 className="mt-4 text-base font-medium">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 返点平台 CTA ───────────────────────────────────────── */}
      <section className="mx-auto max-w-6xl px-6 py-24">
        <div className="flex flex-col items-center justify-between gap-8 border border-border bg-ink px-8 py-14 text-center text-white sm:px-16">
          <p className="text-xs tracking-[0.3em] uppercase text-gold">
            发票申报 · 佣金结算
          </p>
          <h2
            className="max-w-xl text-2xl font-light sm:text-3xl"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            返点平台 — 商务合作伙伴的发票与返点管理系统
          </h2>
          <p className="max-w-lg text-sm leading-relaxed text-white/70">
            上传购物小票，系统自动识别核对信息并计算返点，安全合规地管理每一笔佣金收益。
          </p>
          <Link
            href="/login"
            className="btn-gold inline-flex items-center gap-2"
          >
            登录返点平台
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-6 text-center">
          <Image
            src="/brand/feeluxe-wordmark.png"
            alt="FEELUXE"
            width={428}
            height={72}
            className="h-4 w-auto opacity-80"
          />
          <p className="text-xs text-muted">
            连接高端精品店与商务合作伙伴的数字化平台
          </p>
          <p className="text-xs text-muted">www.feeluxe.com</p>
          <p className="text-[11px] text-muted/70">
            © {new Date().getFullYear()} FeeLuxe. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}
