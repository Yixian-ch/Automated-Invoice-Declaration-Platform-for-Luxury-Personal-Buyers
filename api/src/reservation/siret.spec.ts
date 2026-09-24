import { findSiretsInText, luhnValid, normalizeSiret } from './siret';

describe('luhnValid', () => {
  it('样票上的 LA SAMARITAINE SIRET 通过', () => {
    expect(luhnValid('53775858300059')).toBe(true);
  });
  it('改动一位后不通过', () => {
    expect(luhnValid('53775858300058')).toBe(false);
    expect(luhnValid('58775858300059')).toBe(false);
  });
  it('非数字不通过', () => {
    expect(luhnValid('5377585830005a')).toBe(false);
    expect(luhnValid('')).toBe(false);
  });
});

describe('normalizeSiret', () => {
  it('去掉空格/点/横线', () => {
    expect(normalizeSiret('537 758 583 00059')).toBe('53775858300059');
    expect(normalizeSiret('537.758.583.00059')).toBe('53775858300059');
    expect(normalizeSiret('537-758-583-00059')).toBe('53775858300059');
  });
  it('位数不对 → null', () => {
    expect(normalizeSiret('537758583')).toBeNull(); // SIREN 9 位
    expect(normalizeSiret('537758583000590')).toBeNull();
  });
  it('Luhn 不过 → null', () => {
    expect(normalizeSiret('53775858300058')).toBeNull();
  });
  it('空值 → null', () => {
    expect(normalizeSiret(null)).toBeNull();
    expect(normalizeSiret(undefined)).toBeNull();
    expect(normalizeSiret('')).toBeNull();
  });
});

describe('findSiretsInText', () => {
  it('在文本里找出 Luhn 通过的 14 位数字串', () => {
    const text = 'LA SAMARITAINE 19 rue de la Monnaie 75001 PARIS 53775858300059 tel 0102030405';
    expect(findSiretsInText(text)).toEqual(['53775858300059']);
  });
  it('允许数字间有空格', () => {
    expect(findSiretsInText('siret 537 758 583 00059 ok')).toEqual(['53775858300059']);
  });
  it('忽略校验不过的 14 位串,以及更长的数字串', () => {
    // 20 位条形码号不能被当成 SIRET 的一部分
    expect(findSiretsInText('25020582499619654442')).toEqual([]);
    expect(findSiretsInText('53775858300058')).toEqual([]);
  });
});
