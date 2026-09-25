/**
 * 修复因 max_tokens 被截断的模型 JSON 输出。
 *
 * 只处理"末尾被截断"这一种情况(由调用方用 finishReason === 'length' 或
 * "Unexpected end / Unterminated string" 类错误判定)。其它畸形 JSON 原样抛错,
 * 交给上层按 OCR 失败处理,不能把半份数据当成完整结果。
 *
 * 做法:一次前向扫描,记录每个"安全截断点"(逗号 / 闭括号 / 闭引号之后、
 * 且不在字符串内、不在数组元素对象内)处的括号栈;从后往前尝试补齐并解析。
 */

export class NotAnObjectError extends Error {
  constructor() {
    super('Model returned JSON that is not an object');
    this.name = 'NotAnObjectError';
  }
}

/** 取 ```json 围栏内的内容;没有围栏就从第一个 { 开始 */
export function stripJsonFence(text: string): string {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  let clean = (fenced ? fenced[1] : text).trim();
  const start = clean.indexOf('{');
  if (start > 0) clean = clean.slice(start);
  return clean;
}

/** 截断类错误:JSON 在末尾戛然而止 */
export function isTruncationError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /Unexpected end of JSON input|Unterminated string|Expected ',' or '}'|Expected ',' or ']'|Expected double-quoted property name/i.test(msg);
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

interface Boundary {
  /** 截断位置(head = clean.slice(0, index)) */
  index: number;
  /** 截断处未闭合的括号栈 */
  stack: string[];
}

/**
 * 前向扫描,收集安全截断点。
 * 跳过:字符串内部;数组元素对象内部(最外层 [ 之上还有 { ),避免留下半行明细。
 */
function collectBoundaries(text: string): Boundary[] {
  const out: Boundary[] = [];
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') {
        inString = false;
        pushIfSafe(i + 1);
      }
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') {
      stack.pop();
      pushIfSafe(i + 1);
    } else if (ch === ',') pushIfSafe(i + 1);
  }
  return out;

  function pushIfSafe(index: number) {
    if (stack.length === 0) return; // 根对象已闭合,无需修复
    const firstArray = stack.indexOf('[');
    const insideArrayElement = firstArray !== -1 && stack.slice(firstArray + 1).includes('{');
    if (insideArrayElement) return;
    out.push({ index, stack: [...stack] });
  }
}

function closeStack(head: string, stack: string[]): string {
  let out = head;
  for (let i = stack.length - 1; i >= 0; i--) out += stack[i] === '{' ? '}' : ']';
  return out;
}

export interface ParseOptions {
  /** 调用方已确认输出是被长度截断的(finishReason === 'length') */
  truncated?: boolean;
}

/**
 * 解析模型返回的 JSON。
 * - 正常 → { value, repaired: false }
 * - 末尾截断(options.truncated 或错误类型判定)→ 回退到最近的安全截断点补齐
 * - 其它畸形 / 非对象 → 抛错
 */
export function parseModelJson(text: string, options: ParseOptions = {}): { value: Record<string, unknown>; repaired: boolean } {
  const clean = stripJsonFence(text);

  let firstError: unknown;
  try {
    const value = JSON.parse(clean);
    if (!isPlainObject(value)) throw new NotAnObjectError();
    return { value, repaired: false };
  } catch (err) {
    if (err instanceof NotAnObjectError) throw err;
    firstError = err;
  }

  // 对象后面跟了一句多余的话("Note: ...")→ 截到最后一个 } 再试
  const lastBrace = clean.lastIndexOf('}');
  if (lastBrace > 0) {
    try {
      const value = JSON.parse(clean.slice(0, lastBrace + 1));
      if (isPlainObject(value)) return { value, repaired: false };
    } catch {
      // 继续
    }
  }

  if (!options.truncated && !isTruncationError(firstError)) throw firstError;

  const boundaries = collectBoundaries(clean);
  for (let b = boundaries.length - 1; b >= 0; b--) {
    const { index, stack } = boundaries[b];
    const head = clean.slice(0, index).replace(/,\s*$/, '');
    try {
      const value = JSON.parse(closeStack(head, stack));
      if (isPlainObject(value)) return { value, repaired: true };
    } catch {
      // 继续往前找
    }
  }
  throw firstError;
}
