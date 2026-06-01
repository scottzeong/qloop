/**
 * DB 초기화: 모든 테이블 삭제 후 재생성
 * 실행: node reset-db.mjs
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const connection = await mysql.createConnection(process.env.DATABASE_URL);

const tables = [
  "moduleEvaluations", "learnerSocraticProfiles", "questionEvaluations",
  "questions", "questionTypeDimensionWeights", "socraticEvaluationPolicies",
  "evaluationDimensions", "questionTypes", "sessionMessages",
  "learningSessions", "knowledgeLibrary", "learningModules",
  "aiConnections", "documents", "documentGroups", "users",
  "__drizzle_migrations"
];

await connection.execute("SET FOREIGN_KEY_CHECKS = 0");
for (const table of tables) {
  try {
    await connection.execute(`DROP TABLE IF EXISTS \`${table}\``);
    console.log(`✓ dropped ${table}`);
  } catch (e) {
    console.log(`  skipped ${table}: ${e.message}`);
  }
}
await connection.execute("SET FOREIGN_KEY_CHECKS = 1");
await connection.end();
console.log("\n✅ 완료. 이제 pnpm db:push 실행하세요.");
