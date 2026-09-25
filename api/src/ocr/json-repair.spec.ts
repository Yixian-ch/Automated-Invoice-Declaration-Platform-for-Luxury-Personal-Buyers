import { parseModelJson, stripJsonFence } from './json-repair';

describe('parseModelJson', () => {
  it('完整 JSON 直接解析', () => {
    expect(parseModelJson('{"a":1,"b":"x"}')).toEqual({ value: { a: 1, b: 'x' }, repaired: false });
  });

  it('去掉 ```json 围栏和前导说明文字', () => {
    expect(stripJsonFence('Here you go:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    expect(parseModelJson('```json\n{"a":1}\n```').value).toEqual({ a: 1 });
  });

  it('在长字符串中间被截断 → 丢掉该字段,保留前面的完整字段', () => {
    const truncated = '{"merchantName":"LA SAMARITAINE","grandTotalAmount":11360,"lineItems":[{"description":"GUCCI","amount_ttc":390}],"rawText":"BORDEREAU DE VENTE A L EXPORTATION Tax free form France cerfa N 15021';
    const { value, repaired } = parseModelJson(truncated);
    expect(repaired).toBe(true);
    expect(value.merchantName).toBe('LA SAMARITAINE');
    expect(value.grandTotalAmount).toBe(11360);
    expect(value.lineItems).toEqual([{ description: 'GUCCI', amount_ttc: 390 }]);
  });

  it('在数组元素中间被截断 → 保留已完整的元素', () => {
    const truncated = '{"lineItems":[{"description":"A","amount_ttc":1},{"description":"B","amount_tt';
    const { value } = parseModelJson(truncated);
    expect(value.lineItems).toEqual([{ description: 'A', amount_ttc: 1 }]);
  });

  it('截在 "key": 之后 → 去掉悬空 key', () => {
    const { value } = parseModelJson('{"a":1,"b":');
    expect(value).toEqual({ a: 1 });
  });

  it('字符串里含转义引号也能正确判断截断点', () => {
    const { value } = parseModelJson('{"a":"say \\"hi\\"","b":2,"c":"unfinis');
    expect(value).toEqual({ a: 'say "hi"', b: 2 });
  });

  it('完全不是 JSON → 抛出原始错误', () => {
    expect(() => parseModelJson('not json at all')).toThrow();
  });
});
