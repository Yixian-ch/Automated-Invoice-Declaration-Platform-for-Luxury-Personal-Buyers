/** 注册问卷与「我的主页」共用的字段规则、证件定义 — 与 api/src/common/validation/profile-rules.ts 保持一致 */

import type { Gender, ProfileDocumentType, UserProfile } from './api';

export const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'FEMALE', label: '女 / Female' },
  { value: 'MALE', label: '男 / Male' },
  { value: 'OTHER', label: '其他 / Others' },
];

export const PASSWORD_PATTERN = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z])(?=.*[^A-Za-z0-9]).{8,}$/;
export const PASSWORD_RULE =
  '密码必须包含至少 8 个字符、1 个数字、1 个大写字母、1 个小写字母和 1 个特殊字符 / Your new password must contain 8 characters, including 1 number, 1 letter in lower case, 1 letter in upper case and a special character';

/** 去掉分隔符并把 00 国际前缀转成 +(0086… → +86…),与后端归一化一致 */
export function normalizePhone(value: string): string {
  const compact = value.replace(/[\s\-().]/g, '');
  return compact.startsWith('00') ? `+${compact.slice(2)}` : compact;
}

export function isValidPhone(value: string): boolean {
  return /^\+[1-9]\d{6,14}$/.test(normalizePhone(value));
}

export const ACCEPTED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024; // 10 MB

/** 返回错误信息;文件可用时返回 null */
export function checkDocumentFile(file: File): string | null {
  if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) return '仅支持 PDF、JPEG 或 PNG 格式';
  if (file.size > MAX_DOCUMENT_BYTES) return '文件超过 10 MB 限制';
  return null;
}

export type DocumentDefinition = {
  type: ProfileDocumentType;
  field: keyof UserProfile;
  title: string;
  hint: string;
};

export const PROFILE_DOCUMENTS: DocumentDefinition[] = [
  {
    type: 'passport',
    field: 'passportDocumentKey',
    title: '有效护照首页 / Passport First Page',
    hint: '必填。若签名与有效日期及其他身份信息在同一页,则只需上传这一页。',
  },
  {
    type: 'passport-signature',
    field: 'passportSignatureKey',
    title: '护照签名页 / Passport Signature Page',
    hint: '签名不在首页时上传签名页。',
  },
  {
    type: 'schengen-visa',
    field: 'schengenVisaKey',
    title: '有效申根签 / Valid Schengen Visa',
    hint: '如果您需要申根签证进入申根区,可以现在或结算佣金前上传有效的申根签证。 / If you need a Schengen visa to enter the Schengen area, you can upload it now or before settling your commission.',
  },
  {
    type: 'entry-stamp',
    field: 'entryStampKey',
    title: '申根区入境章 / Entry Stamp',
    hint: '如果您不需要申根签证进入申根区,请现在或结算佣金时上传您的入境章。 / If you do not need a Schengen visa, upload your entry stamp now or before settling your commission.',
  },
  {
    type: 'exit-stamp',
    field: 'exitStampKey',
    title: '申根区出境章 / Exit Stamp',
    hint: '如果您不需要申根签证进入申根区,请现在或结算佣金时上传您的出境章。 / If you do not need a Schengen visa, upload your exit stamp now or before settling your commission.',
  },
  {
    type: 'business-license',
    field: 'businessLicenseKey',
    title: '导游证 / 个体经营证明 / 营业执照',
    hint: '有效期内的导游证、个体经营证明或公司营业执照,任选其一,可以现在或结算佣金前上传。 / Valid Tourist Guide Card, Freelancer proof or Business License — upload any one now or before settling your commission.',
  },
];
