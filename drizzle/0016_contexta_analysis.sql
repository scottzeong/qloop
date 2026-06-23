-- CONTEXTA 자료 분석 컬럼 추가
ALTER TABLE `documents`
  ADD COLUMN `contextaStatus` ENUM('pending','analyzing','done','error','skipped') NULL AFTER `analysisError`,
  ADD COLUMN `contextaStep` ENUM('content','structure','logic','concept','understanding','critical','done','error') NULL AFTER `contextaStatus`,
  ADD COLUMN `contextaAnalysis` JSON NULL AFTER `contextaStep`;
