import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const sqls = [
  // documents에 openQloopEnabled 추가
  `ALTER TABLE documents ADD COLUMN IF NOT EXISTS openQloopEnabled INT NOT NULL DEFAULT 0`,
  // learningSessions에 openQloopMode 추가
  `ALTER TABLE learningSessions ADD COLUMN IF NOT EXISTS openQloopMode INT NOT NULL DEFAULT 0`,
  // knowledgeLibrary 테이블 생성
  `CREATE TABLE IF NOT EXISTS knowledgeLibrary (
    id INT AUTO_INCREMENT PRIMARY KEY,
    documentId INT NOT NULL,
    addedBy INT NOT NULL,
    title VARCHAR(512) NOT NULL,
    description TEXT,
    tags VARCHAR(512),
    isPublic INT NOT NULL DEFAULT 1,
    downloadCount INT NOT NULL DEFAULT 0,
    createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
];

for (const sql of sqls) {
  try {
    await conn.execute(sql);
    console.log("OK:", sql.slice(0, 60));
  } catch (e) {
    if (e.code === "ER_DUP_FIELDNAME" || e.code === "ER_TABLE_EXISTS_ERROR") {
      console.log("SKIP (already exists):", sql.slice(0, 60));
    } else {
      console.error("ERROR:", e.message, "\nSQL:", sql.slice(0, 80));
    }
  }
}

await conn.end();
console.log("Migration v3 complete.");
