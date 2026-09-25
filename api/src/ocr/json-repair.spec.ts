import { NotAnObjectError, isTruncationError, parseModelJson, stripJsonFence } from './json-repair';

describe('stripJsonFence', () => {
  it('取围栏内容;前面有说明文字也不受影响', () => {
    expect(stripJsonFence('Result {see below}:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(stripJsonFence('Here you go:\n```\n{"a":1}\n```')).toBe('{"a":1}');
  });
  it('没有围栏就从第一个 { 开始', () => {
    expect(stripJsonFence('sure: {"a":1}')).toBe('{"a":1}');
  });
});

describe('parseModelJson', () => {
  it('完整 JSON 直接解析', () => {
    expect(parseModelJson('{"a":1,"b":"x"}')).toEqual({ value: { a: 1, b: 'x' }, repaired: false });
  });

  it('对象后面跟了多余的话 → 截到最后一个 },不算修复', () => {
    expect(parseModelJson('{"a":1}\nNote: extracted.')).toEqual({ value: { a: 1 }, repaired: false });
  });

  it('非对象(null / 数组 / 数字)→ 抛 NotAnObjectError', () => {
    expect(() => parseModelJson('null')).toThrow(NotAnObjectError);
    expect(() => parseModelJson('[1,2]')).toThrow(NotAnObjectError);
    expect(() => parseModelJson('42')).toThrow(NotAnObjectError);
  });

  it('在长字符串(rawText,放在最后)中间被截断 → 丢掉该字段,保留前面的完整字段', () => {
    const truncated = '{"merchantName":"LA SAMARITAINE","grandTotalAmount":11360,"lineItems":[{"description":"GUCCI","amount_ttc":390}],"needsReview":false,"rawText":"BORDEREAU DE VENTE A L EXPORTATION Tax free form France cerfa N 15021';
    const { value, repaired } = parseModelJson(truncated, { truncated: true });
    expect(repaired).toBe(true);
    expect(value).toEqual({
      merchantName: 'LA SAMARITAINE',
      grandTotalAmount: 11360,
      lineItems: [{ description: 'GUCCI', amount_ttc: 390 }],
      needsReview: false,
    });
  });

  it('在数组元素中间被截断 → 只保留已完整的元素', () => {
    const { value } = parseModelJson('{"lineItems":[{"description":"A","amount_ttc":1},{"description":"B","amount_tt', { truncated: true });
    expect(value.lineItems).toEqual([{ description: 'A', amount_ttc: 1 }]);
  });

  it('元素里有嵌套数组时同样不留半个元素', () => {
    const { value } = parseModelJson('{"lineItems":[{"description":"A","tags":["x"]},{"description":"B","tags":["x","y', { truncated: true });
    expect(value.lineItems).toEqual([{ description: 'A', tags: ['x'] }]);
  });

  it('截在 "key": 之后 → 去掉悬空 key', () => {
    expect(parseModelJson('{"a":1,"b":', { truncated: true }).value).toEqual({ a: 1 });
  });

  it('字符串里含转义引号也能正确判断截断点', () => {
    expect(parseModelJson('{"a":"say \\"hi\\"","b":2,"c":"unfinis', { truncated: true }).value).toEqual({ a: 'say "hi"', b: 2 });
  });

  it('没有固定回看窗口:超长的半截字符串也能回退到前面的完整字段', () => {
    const long = 'x'.repeat(9000);
    const { value } = parseModelJson(`{"merchantName":"X","total":5,"rawText":"${long}`, { truncated: true });
    expect(value).toEqual({ merchantName: 'X', total: 5 });
  });

  it('未标记截断时,靠错误类型识别"末尾戛然而止"', () => {
    const { value, repaired } = parseModelJson('{"a":1,"b":"unfinis');
    expect(repaired).toBe(true);
    expect(value).toEqual({ a: 1 });
    expect(isTruncationError(new SyntaxError('Unterminated string in JSON at position 12'))).toBe(true);
  });

  it('中间有非法字符(不是截断)→ 不做修复,原样抛错', () => {
    const bad = '{"merchantName":"X","buyerName":"A\nB","grandTotalAmount":1000,"needsReview":false}';
    expect(() => parseModelJson(bad)).toThrow(SyntaxError);
  });

  it('完全不是 JSON → 抛出原始错误', () => {
    expect(() => parseModelJson('not json at all')).toThrow();
  });
});
