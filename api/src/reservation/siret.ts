/**
 * 法国 SIRET(14 位数字)工具。
 *
 * SIRET = 9 位 SIREN + 5 位 NIC,最后一位是 Luhn 校验位。
 * OCR 把某一位数字看错时 Luhn 大概率通不过,可用来过滤误读。
 */

export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * 把 OCR 返回的税号字段规范化为 14 位 SIRET。
 * 去掉空格/点/横线;不是 14 位数字或 Luhn 不通过 → null。
 */
export function normalizeSiret(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[\s.\-]/g, '');
  if (!/^\d{14}$/.test(digits)) return null;
  return luhnValid(digits) ? digits : null;
}

/**
 * 从一段文本里找出所有 Luhn 通过的 14 位数字串(允许数字间有空格)。
 * 用作 OCR 结构化字段缺失时的兜底。
 */
export function findSiretsInText(text: string): string[] {
  const found: string[] = [];
  const re = /(?<!\d)(\d[ \t]?){13}\d(?!\d)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const digits = m[0].replace(/[ \t]/g, '');
    if (digits.length === 14 && luhnValid(digits) && !found.includes(digits)) {
      found.push(digits);
    }
  }
  return found;
}
