import { createConnection } from "mysql2/promise";
import { readFileSync } from "fs";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required");

const conn = await createConnection(url);

// 신규 테이블만 생성 (기존 테이블은 건너뜀)
const newTables = [
  "evaluationDimensions",
  "learnerSocraticProfiles",
  "learningModules",
  "moduleEvaluations",
  "questionEvaluations",
  "questionTypeDimensionWeights",
  "questionTypes",
  "questions",
  "socraticEvaluationPolicies",
];

// 기존 테이블에 컬럼 추가
const alterStatements = [
  // learningSessions에 moduleId 추가
  `ALTER TABLE learningSessions ADD COLUMN IF NOT EXISTS moduleId int`,
  // sessionMessages에 socraticQuestionId, questionTypeName 추가
  `ALTER TABLE sessionMessages ADD COLUMN IF NOT EXISTS socraticQuestionId int`,
  `ALTER TABLE sessionMessages ADD COLUMN IF NOT EXISTS questionTypeName varchar(64)`,
  // users role enum 확장 (instructor 추가)
  `ALTER TABLE users MODIFY COLUMN role enum('user','admin','instructor') NOT NULL DEFAULT 'user'`,
];

// 신규 테이블 SQL 파싱
const sql = readFileSync("./drizzle/0004_brown_wrecker.sql", "utf-8");
const statements = sql.split("--> statement-breakpoint").map(s => s.trim()).filter(Boolean);

console.log(`Found ${statements.length} statements in migration file`);

for (const stmt of statements) {
  // 테이블명 추출
  const match = stmt.match(/CREATE TABLE `([^`]+)`/);
  if (match) {
    const tableName = match[1];
    if (!newTables.includes(tableName)) {
      console.log(`⏭ Skipping existing table: ${tableName}`);
      continue;
    }
    try {
      await conn.execute(stmt);
      console.log(`✅ Created table: ${tableName}`);
    } catch (e) {
      if (e.code === "ER_TABLE_EXISTS_ERROR") {
        console.log(`⏭ Table already exists: ${tableName}`);
      } else {
        console.error(`❌ Error creating ${tableName}:`, e.message);
      }
    }
  }
}

// ALTER 문 실행
for (const stmt of alterStatements) {
  try {
    await conn.execute(stmt);
    console.log(`✅ Executed: ${stmt.substring(0, 60)}...`);
  } catch (e) {
    // MySQL doesn't support IF NOT EXISTS for ADD COLUMN in older versions
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log(`⏭ Column already exists (skipped)`);
    } else {
      console.error(`❌ Error:`, e.message);
    }
  }
}

await conn.end();
console.log("\n✅ Migration complete!");
