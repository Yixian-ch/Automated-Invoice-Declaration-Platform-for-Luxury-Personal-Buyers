'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/auth-context';
import { adminApi, MerchantCashbackConfig, BrandCashbackRule } from '@/lib/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pct(rate: string | number) {
  return `${(Number(rate) * 100).toFixed(1)}%`;
}

function rateFromPct(pctStr: string): number {
  return parseFloat(pctStr) / 100;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type EditableRule = {
  id?: string;
  displayLabel: string;
  brands: string; // comma-separated for the input
  rate: string;   // percentage string e.g. "12"
  condition: string;
  sortOrder: number;
  _dirty?: boolean;
};

type MerchantState = {
  config: MerchantCashbackConfig;
  defaultRateInput: string;
  notesInput: string;
  rules: EditableRule[];
  saving: boolean;
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function RuleRow({
  rule,
  index,
  onChange,
  onDelete,
}: {
  rule: EditableRule;
  index: number;
  onChange: (index: number, field: keyof EditableRule, value: string) => void;
  onDelete: (index: number) => void;
}) {
  return (
    <tr className="border-b border-stone-100 group">
      <td className="py-2 pr-2 align-top">
        <input
          value={rule.displayLabel}
          onChange={(e) => onChange(index, 'displayLabel', e.target.value)}
          placeholder="品牌标签（显示用）"
          className="w-full text-xs border border-stone-200 rounded px-2 py-1.5 focus:outline-none focus:border-[#B8966E]"
        />
      </td>
      <td className="py-2 pr-2 align-top">
        <input
          value={rule.brands}
          onChange={(e) => onChange(index, 'brands', e.target.value)}
          placeholder="匹配关键词，逗号分隔"
          className="w-full text-xs border border-stone-200 rounded px-2 py-1.5 focus:outline-none focus:border-[#B8966E] font-mono"
        />
      </td>
      <td className="py-2 pr-2 align-top w-24">
        <div className="relative">
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={rule.rate}
            onChange={(e) => onChange(index, 'rate', e.target.value)}
            className="w-full text-xs border border-stone-200 rounded px-2 py-1.5 pr-5 focus:outline-none focus:border-[#B8966E] text-right"
          />
          <span className="absolute right-2 top-1.5 text-xs text-stone-400">%</span>
        </div>
      </td>
      <td className="py-2 pr-2 align-top">
        <input
          value={rule.condition}
          onChange={(e) => onChange(index, 'condition', e.target.value)}
          placeholder="可选备注"
          className="w-full text-xs border border-stone-200 rounded px-2 py-1.5 focus:outline-none focus:border-[#B8966E]"
        />
      </td>
      <td className="py-2 align-top">
        <button
          onClick={() => onDelete(index)}
          className="text-stone-300 hover:text-red-500 text-sm transition-colors px-1"
          title="删除此规则"
        >
          ✕
        </button>
      </td>
    </tr>
  );
}

function MerchantCard({
  state,
  onDefaultRateChange,
  onNotesChange,
  onRuleChange,
  onRuleDelete,
  onAddRule,
  onSave,
}: {
  state: MerchantState;
  onDefaultRateChange: (v: string) => void;
  onNotesChange: (v: string) => void;
  onRuleChange: (i: number, field: keyof EditableRule, v: string) => void;
  onRuleDelete: (i: number) => void;
  onAddRule: () => void;
  onSave: () => void;
}) {
  const { config, defaultRateInput, notesInput, rules, saving } = state;

  return (
    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-4 border-b border-stone-100 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-stone-800">{config.displayName}</h2>
          <p className="text-xs text-stone-400 mt-0.5">
            关键词: {config.matchKeywords.join(', ')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-stone-500 whitespace-nowrap">默认返点</span>
            <div className="relative">
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                value={defaultRateInput}
                onChange={(e) => onDefaultRateChange(e.target.value)}
                className="w-20 text-sm border border-stone-200 rounded px-2 py-1.5 pr-5 font-medium text-[#B8966E] focus:outline-none focus:border-[#B8966E] text-right"
              />
              <span className="absolute right-2 top-1.5 text-xs text-stone-400">%</span>
            </div>
          </div>
          <button
            onClick={onSave}
            disabled={saving}
            className="px-4 py-1.5 rounded-lg bg-[#B8966E] text-white text-xs font-medium hover:bg-[#a07d5a] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>

      {/* Notes */}
      <div className="px-5 pt-3 pb-0">
        <label className="block text-xs text-stone-400 mb-1">备注说明</label>
        <textarea
          value={notesInput}
          onChange={(e) => onNotesChange(e.target.value)}
          rows={2}
          placeholder="例如退税条件、特殊说明等"
          className="w-full text-xs border border-stone-200 rounded px-2.5 py-2 focus:outline-none focus:border-[#B8966E] resize-none text-stone-600"
        />
      </div>

      {/* Brand rules table */}
      <div className="px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-stone-500 uppercase tracking-wide">
            特殊品牌规则
            <span className="ml-2 text-stone-300 font-normal normal-case">
              （从上到下优先匹配，未匹配则用默认返点）
            </span>
          </span>
          <button
            onClick={onAddRule}
            className="text-xs text-[#B8966E] hover:underline"
          >
            + 添加规则
          </button>
        </div>

        {rules.length === 0 ? (
          <p className="text-xs text-stone-400 italic py-2">暂无特殊品牌规则，所有商品按默认返点计算。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-stone-200 text-stone-400">
                  <th className="text-left py-1.5 pr-2 font-medium w-1/4">品牌标签</th>
                  <th className="text-left py-1.5 pr-2 font-medium w-1/3">匹配关键词（逗号分隔）</th>
                  <th className="text-right py-1.5 pr-2 font-medium w-20">返点</th>
                  <th className="text-left py-1.5 pr-2 font-medium">条件备注</th>
                  <th className="w-6" />
                </tr>
              </thead>
              <tbody>
                {rules.map((rule, i) => (
                  <RuleRow
                    key={i}
                    rule={rule}
                    index={i}
                    onChange={onRuleChange}
                    onDelete={onRuleDelete}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CashbackRulesPage() {
  const { accessToken } = useAuth();
  const [merchants, setMerchants] = useState<MerchantState[]>([]);
  const [loading, setLoading] = useState(true);

  const toEditableRules = (rules: BrandCashbackRule[]): EditableRule[] =>
    rules.map((r) => ({
      id: r.id,
      displayLabel: r.displayLabel,
      brands: r.brands.join(', '),
      rate: (Number(r.rate) * 100).toFixed(1),
      condition: r.condition ?? '',
      sortOrder: r.sortOrder,
    }));

  const load = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      const configs = await adminApi.getCashbackConfigs(accessToken);
      setMerchants(
        configs.map((c) => ({
          config: c,
          defaultRateInput: (Number(c.defaultRate) * 100).toFixed(1),
          notesInput: c.notes ?? '',
          rules: toEditableRules(c.brandRules),
          saving: false,
        })),
      );
    } catch {
      toast.error('加载返点规则失败');
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { load(); }, [load]);

  const update = (idx: number, partial: Partial<MerchantState>) =>
    setMerchants((prev) => prev.map((m, i) => (i === idx ? { ...m, ...partial } : m)));

  const handleRuleChange = (
    mIdx: number,
    rIdx: number,
    field: keyof EditableRule,
    value: string,
  ) =>
    setMerchants((prev) =>
      prev.map((m, i) => {
        if (i !== mIdx) return m;
        const rules = [...m.rules];
        rules[rIdx] = { ...rules[rIdx], [field]: value };
        return { ...m, rules };
      }),
    );

  const handleRuleDelete = (mIdx: number, rIdx: number) =>
    setMerchants((prev) =>
      prev.map((m, i) => {
        if (i !== mIdx) return m;
        return { ...m, rules: m.rules.filter((_, j) => j !== rIdx) };
      }),
    );

  const handleAddRule = (mIdx: number) =>
    setMerchants((prev) =>
      prev.map((m, i) => {
        if (i !== mIdx) return m;
        return {
          ...m,
          rules: [
            ...m.rules,
            { displayLabel: '', brands: '', rate: '0', condition: '', sortOrder: m.rules.length },
          ],
        };
      }),
    );

  const handleSave = async (mIdx: number) => {
    if (!accessToken) return;
    const m = merchants[mIdx];
    const merchantId = m.config.id;

    const defaultRate = rateFromPct(m.defaultRateInput);
    if (isNaN(defaultRate) || defaultRate < 0 || defaultRate > 1) {
      toast.error('默认返点必须在 0%–100% 之间');
      return;
    }

    update(mIdx, { saving: true });
    try {
      // 1. Update merchant default rate & notes
      await adminApi.updateMerchantConfig(accessToken, merchantId, {
        defaultRate,
        notes: m.notesInput,
      });

      // 2. Replace brand rules
      const rules = m.rules
        .filter((r) => r.displayLabel.trim())
        .map((r, i) => ({
          displayLabel: r.displayLabel.trim(),
          brands: r.brands
            .split(',')
            .map((b) => b.trim().toLowerCase())
            .filter(Boolean),
          rate: rateFromPct(r.rate),
          condition: r.condition.trim() || undefined,
          sortOrder: i,
        }));

      await adminApi.replaceBrandRules(accessToken, merchantId, rules);

      toast.success(`${m.config.displayName} 已保存`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? '保存失败');
    } finally {
      update(mIdx, { saving: false });
    }
  };

  return (
    <div className="space-y-5 max-w-5xl">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-stone-800">返点算法配置</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            按商家管理品牌返点比例。规则从上到下优先匹配，未命中则使用商家默认返点。
          </p>
        </div>
        <span className="text-xs text-stone-400 bg-stone-100 rounded px-2 py-1">
          公式：TTC × 渠道系数 × 品牌返点
        </span>
      </div>

      {/* GL special note */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
        <strong>老佛爷渠道系数规则（代码内置，不可在此修改）：</strong>
        &nbsp;退税金额 / TTC ≤ 12% → ×0.88；&nbsp;&gt; 12% → ×0.833。其他商家统一 ×0.833。
      </div>

      {/* Merchant cards */}
      {loading ? (
        <div className="text-sm text-stone-400 text-center py-16">加载中…</div>
      ) : merchants.length === 0 ? (
        <div className="text-sm text-stone-400 text-center py-16">
          暂无商家配置，请先运行 seed 脚本初始化数据。
        </div>
      ) : (
        <div className="space-y-4">
          {merchants.map((m, mIdx) => (
            <MerchantCard
              key={m.config.id}
              state={m}
              onDefaultRateChange={(v) => update(mIdx, { defaultRateInput: v })}
              onNotesChange={(v) => update(mIdx, { notesInput: v })}
              onRuleChange={(rIdx, field, v) => handleRuleChange(mIdx, rIdx, field, v)}
              onRuleDelete={(rIdx) => handleRuleDelete(mIdx, rIdx)}
              onAddRule={() => handleAddRule(mIdx)}
              onSave={() => handleSave(mIdx)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
