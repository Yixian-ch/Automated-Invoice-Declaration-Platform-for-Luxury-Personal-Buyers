-- 结算记录保存银行名称(与我的主页收款字段对齐)
ALTER TABLE "cashback_settlements" ADD COLUMN "bankName" TEXT;
