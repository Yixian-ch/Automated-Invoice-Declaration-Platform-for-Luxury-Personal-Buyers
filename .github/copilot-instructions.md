# LIDP Platform — Copilot Instructions

## 开发规范
- 每个新功能开一个新分支，命名格式：`feature/功能名`
- 完成后合并回 main
- 每次改动后必须先 `cd api && npm run build`，`cd web && npm run build`，确认编译无报错再 commit
- commit message 用英文描述改动内容
- Use uv to manage the venv and intall python packages and scripts in venv
## 项目结构
├── api/          # NestJS 后端，端口 3001
├── web/          # Next.js 前端，端口 3000
├── ocr-service/  # Python FastAPI OCR 服务，端口 8001（Docker）
└── docker-compose.yml  # 管理 postgres/redis/ocr-service
## 启动方式
- `docker compose up ocr-service` — OCR服务（必须先启动）
- `cd api && npm start` — 后端
- `cd web && npm run dev` — 前端
- postgres:5432, redis:6379 通过 docker compose 启动

## 关键环境变量（api/.env）
- `BYPASS_S3=true` — 开发环境跳过S3，图片存本地
- `BYPASS_OCR=false` — 使用真实OCR
- `BYPASS_KYC=true` — 跳过身份验证
- `BYPASS_EMAIL_VERIFICATION=true` — 跳过邮件验证
- `OCR_SERVICE_URL=http://localhost:8001`

## 后端模块（api/src/）

| 模块 | 路径 | 说明 |
|------|------|------|
| invoice | `invoice/invoice.service.ts` | 核心：上传、审核、返点计算 |
| ocr | `ocr/ocr.service.ts` | 调用OCR微服务，映射返回字段 |
| ocr processor | `ocr/ocr.processor.ts` | Bull队列处理器，OCR完成后更新DB |
| auth | `auth/` | 注册、登录、JWT |
| kyc | `kyc/` | 护照上传，人工审核 |
| storage | `storage/` | 本地/S3文件存储 |
| prisma | `prisma/` | 数据库schema和迁移 |

## 数据库关键表（postgres）
- `users` — 买手信息，含 `cashbackRate`、`kycStatus`、`kybStatus`
- `invoices` — 小票，含 `status`(PENDING/APPROVED/REJECTED)、`lineItems`(JSON)、`needsReview`、`reviewReasons`
- `organizations` — 买手公司
- `merchant_bills` — 商场账单数据（Bill Check用）

## 小票状态机
上传 → PENDING → APPROVED / REJECTED
- OCR在后台自动跑，不改状态
- `needsReview=true` 时在后台显示红色"需人工介入"标签
- 状态只有三个：PENDING / APPROVED / REJECTED

## 返点计算逻辑
- `invoice.service.ts` → `approve()` 方法
- 取用户 `cashbackRate`，若无则取organization的 `cashbackRate`
- `cashbackAmount = grandTotalAmount × cashbackRate`
- 每次调用approve都重新计算

## 前端页面（web/src/app/）

| 路径 | 说明 |
|------|------|
| `/` | 首页 |
| `/register` | 注册，支持Individual/Company |
| `/login` | 登录，admin自动跳转/admin |
| `/dashboard` | 买手主页，小票列表 |
| `/dashboard/invoices/[id]` | 买手小票详情，含图片和OCR结果 |
| `/admin` | 后台入口 |
| `/admin/invoice-review` | 小票审核工作台 |
| `/admin/data-table` | 所有小票数据表 |
| `/admin/bill-check` | 商场对账（Bill Check） |
| `/admin/cashback-rates` | 返点比率配置 |

## OCR服务（ocr-service/main.py）
- 基于 PaddleOCR
- 专门针对法国退税单（BVE）优化
- `_is_bve()` — 检测是否为退税单
- `_extract_bve()` — 按X坐标区分列提取字段：门店名、日期、总金额、明细行
- 核心字段置信度 < 0.6 → `needsReview=true`
- 算术校验：Σ(lineItems.amount_ttc) 必须等于 grandTotalAmount，否则 `needsReview=true`
- 返回字段：`merchant_name`、`purchase_date`、`grand_total_amount`、`line_items`、`buyer_name`、`arithmetic_check`、`needs_review`、`review_reasons`

## Bill Check逻辑
- 商场通过Excel上传账单（支持.xlsx/.xls/.csv）
- 前端解析Excel，字段映射后提交到后端
- 按商场名+日期匹配买手小票汇总金额
- Status：Match（误差0）/ Mismatch

## 注意事项
- ocr-service是Docker容器，改了代码必须 `docker compose up --build ocr-service` 重新build
- api和web是本地npm进程，改代码后重启即可
- 删除 `version` 字段警告可忽略（docker-compose.yml里的obsolete属性）
- 图片本地存储路径在StorageService里，开发环境BYPASS_S3=true时生效
