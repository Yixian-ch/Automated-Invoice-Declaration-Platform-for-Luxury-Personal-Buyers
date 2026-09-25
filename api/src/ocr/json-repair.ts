/**
 * 修复被截断 / 轻微畸形的模型 JSON 输出。
 *
 * 模型偶尔会在 max_tokens 处被截断,或在长字符串里夹带未转义字符,
 * 直接 JSON.parse 会整个失败、OCR 任务报错。这里尽量从截断处往前回退,
 * 补齐未闭合的字符串/括号,拿回已经完整输出的字段。
 */

/** 去掉 ```json 围栏,截取第一个 { 到最后一个 } */
export function stripJsonFence(text: string): string {
  let clean = text.trim();
  // 前后的 ``` 围栏(前面可能还有一句说明文字)
  clean = clean.replace(/^[\s\S]*?```(?:json)?\s*/i, (m) => (m.includes('{') ? m : '')).replace(/\s*```\s*$/, '').trim();
  const start = clean.indexOf('{');
  if (start > 0) clean = clean.slice(start);
  return clean;
}

/** 扫描到 text 末尾时的状态:未闭合的括号栈、是否停在字符串里 */
function scanState(text: string): { stack: string[]; inString: boolean } {
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
  }
  return { stack, inString };
}

function closeOpen(text: string): string {
  const { stack, inString } = scanState(text);
  let out = text;
  if (inString) out += '"';
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']';
  return out;
}

/**
 * 解析模型返回的 JSON;失败时从末尾往前找可用的截断点补齐再试。
 * 返回 { value, repaired };完全救不回来抛出原始解析错误。
 */
export function parseModelJson(text: string): { value: Record<string, unknown>; repaired: boolean } {
  const clean = stripJsonFence(text);
  try {
    return { value: JSON.parse(clean), repaired: false };
  } catch (firstError) {
    // 只在值/成员边界处尝试截断:逗号、闭括号、闭引号之后
    const minCut = Math.max(1, clean.length - 4000);
    for (let i = clean.length; i >= minCut; i--) {
      const prev = clean[i - 1];
      if (prev !== ',' && prev !== '}' && prev !== ']' && prev !== '"') continue;
      let head = clean.slice(0, i).replace(/,\s*$/, '');
      // 截在 "key": 之后(值还没开始)→ 把这个悬空的 key 一起去掉
      head = head.replace(/,?\s*"[^"\\]*(?:\\.[^"\\]*)*"\s*:\s*$/, '');
      const state = scanState(head);
      // 停在字符串中间:值被截断了,不能把半截字符串当成完整值,继续往前找
      if (state.inString) continue;
      // 停在数组元素对象的中间:半个明细行没有意义,继续往前找到上一个完整元素
      const depth = state.stack.length;
      if (depth >= 2 && state.stack[depth - 1] === '{' && state.stack[depth - 2] === '[') continue;
      try {
        const value = JSON.parse(closeOpen(head));
        if (value && typeof value === 'object') return { value, repaired: true };
      } catch {
        // 继续往前找
      }
    }
    throw firstError;
  }
}
