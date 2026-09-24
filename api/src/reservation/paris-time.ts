/**
 * Europe/Paris 时区工具。
 *
 * 数据库统一存 UTC;预约时间的选择/展示、发票日期的解析与区间比对,
 * 统一按 Europe/Paris 解释。精度到天:一个"巴黎日期"对应
 * [巴黎 00:00:00.000, 巴黎 23:59:59.999] 这段 UTC 区间。
 *
 * 不依赖第三方库,用 Intl 取时区偏移。
 */

export const PARIS_TZ = 'Europe/Paris';

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS_TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

/** 某一 UTC 时刻在巴黎的本地时间各分量 */
function parisParts(date: Date) {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = parseInt(p.value, 10);
  }
  return {
    year: out.year,
    month: out.month,
    day: out.day,
    hour: out.hour % 24,
    minute: out.minute,
    second: out.second,
  };
}

/** 巴黎时区在某一时刻相对 UTC 的偏移(毫秒,夏令时 +2h,冬令时 +1h) */
function parisOffsetMs(date: Date): number {
  const p = parisParts(date);
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const truncated = Math.floor(date.getTime() / 1000) * 1000;
  return asIfUtc - truncated;
}

/** 把"巴黎本地时间"换算成 UTC 时刻 */
function parisLocalToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  ms: number,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second, ms);
  const guess = naive - parisOffsetMs(new Date(naive));
  // 夏令时切换日附近偏移可能变化,用第一次结果再校正一次
  const corrected = naive - parisOffsetMs(new Date(guess));
  return new Date(corrected);
}

export function isYmd(value: string): boolean {
  if (!YMD_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === m - 1 && probe.getUTCDate() === d;
}

function splitYmd(ymd: string): [number, number, number] {
  if (!isYmd(ymd)) throw new Error(`Invalid date string: ${ymd}`);
  const [y, m, d] = ymd.split('-').map(Number);
  return [y, m, d];
}

/** UTC 时刻 → 巴黎日历日期 "YYYY-MM-DD" */
export function toParisDateString(date: Date): string {
  const p = parisParts(date);
  const mm = String(p.month).padStart(2, '0');
  const dd = String(p.day).padStart(2, '0');
  return `${p.year}-${mm}-${dd}`;
}

/** 巴黎日期当天 00:00:00.000 对应的 UTC 时刻 */
export function parisDayStart(ymd: string): Date {
  const [y, m, d] = splitYmd(ymd);
  return parisLocalToUtc(y, m, d, 0, 0, 0, 0);
}

/** 巴黎日期当天 23:59:59.999 对应的 UTC 时刻 */
export function parisDayEnd(ymd: string): Date {
  const [y, m, d] = splitYmd(ymd);
  return parisLocalToUtc(y, m, d, 23, 59, 59, 999);
}

/** 巴黎的"今天" */
export function todayInParis(now: Date = new Date()): string {
  return toParisDateString(now);
}

/** 比较两个 "YYYY-MM-DD"(字典序即时间序) */
export function compareYmd(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
