import mysql from "mysql2/promise";

// Load env from process (injected by the platform)
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const conn = await mysql.createConnection(DATABASE_URL);

const migrations = [
  // documents 테이블에 selectedStructure, structureLocked 추가
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS selectedStructure ENUM('tree','conceptMap','learningPath') NULL`,
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS structureLocked INT NOT NULL DEFAULT 0`,
  // learningSessions 테이블에 evaluationEnabled, evaluationPolicyId, selectedStructure 추가
  `ALTER TABLE learningSessions ADD COLUMN IF NOT EXISTS evaluationEnabled INT NOT NULL DEFAULT 0`,
  `ALTER TABLE learningSessions ADD COLUMN IF NOT EXISTS evaluationPolicyId INT NULL`,
  `ALTER TABLE learningSessions ADD COLUMN IF NOT EXISTS selectedStructure ENUM('tree','conceptMap','learningPath') NULL`,
];

for (const sql of migrations) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.substring(0, 60) + "...");
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME") {
      console.log("SKIP (already exists):", sql.substring(0, 60) + "...");
    } else {
      console.error("ERROR:", e.message, "\nSQL:", sql);
    }
  }
}

await conn.end();
console.log("Migration complete");
