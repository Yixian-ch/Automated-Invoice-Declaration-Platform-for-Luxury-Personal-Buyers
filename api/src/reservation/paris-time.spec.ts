import { compareYmd, isYmd, parisDayEnd, parisDayStart, toParisDateString, todayInParis } from './paris-time';

describe('paris-time', () => {
  it('夏令时(UTC+2):巴黎 7月14日 00:00 = 7月13日 22:00Z', () => {
    expect(parisDayStart('2026-07-14').toISOString()).toBe('2026-07-13T22:00:00.000Z');
    expect(parisDayEnd('2026-07-14').toISOString()).toBe('2026-07-14T21:59:59.999Z');
  });

  it('冬令时(UTC+1):巴黎 1月2日 00:00 = 1月1日 23:00Z', () => {
    expect(parisDayStart('2026-01-02').toISOString()).toBe('2026-01-01T23:00:00.000Z');
    expect(parisDayEnd('2026-01-02').toISOString()).toBe('2026-01-02T22:59:59.999Z');
  });

  it('夏令时切换日(2026-03-29)当天首尾正确', () => {
    // 切换前 UTC+1,切换后 UTC+2
    expect(parisDayStart('2026-03-29').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(parisDayEnd('2026-03-29').toISOString()).toBe('2026-03-29T21:59:59.999Z');
  });

  it('toParisDateString:UTC 时刻换算成巴黎日期', () => {
    expect(toParisDateString(new Date('2026-07-13T22:00:00Z'))).toBe('2026-07-14');
    expect(toParisDateString(new Date('2026-07-13T21:59:59Z'))).toBe('2026-07-13');
    // OCR 的 "YYYY-MM-DD" → UTC 午夜 → 巴黎同一天(巴黎恒为 UTC+1/+2)
    expect(toParisDateString(new Date('2025-09-21'))).toBe('2025-09-21');
    expect(toParisDateString(new Date('2025-12-21'))).toBe('2025-12-21');
  });

  it('parisDayStart / parisDayEnd 与 toParisDateString 互逆', () => {
    for (const d of ['2026-01-01', '2026-03-29', '2026-10-25', '2026-12-31']) {
      expect(toParisDateString(parisDayStart(d))).toBe(d);
      expect(toParisDateString(parisDayEnd(d))).toBe(d);
    }
  });

  it('isYmd 校验格式和日期合法性', () => {
    expect(isYmd('2026-02-28')).toBe(true);
    expect(isYmd('2026-02-30')).toBe(false);
    expect(isYmd('2026-13-01')).toBe(false);
    expect(isYmd('26-01-01')).toBe(false);
    expect(isYmd('2026/01/01')).toBe(false);
  });

  it('todayInParis 用巴黎日期', () => {
    expect(todayInParis(new Date('2026-07-13T22:30:00Z'))).toBe('2026-07-14');
  });

  it('compareYmd', () => {
    expect(compareYmd('2026-01-01', '2026-01-02')).toBeLessThan(0);
    expect(compareYmd('2026-01-02', '2026-01-02')).toBe(0);
    expect(compareYmd('2026-01-03', '2026-01-02')).toBeGreaterThan(0);
  });
});
