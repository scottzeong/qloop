import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // 1. documentGroups 테이블 생성
  await conn.execute(`
    CREATE TABLE IF NOT EXISTS documentGroups (
      id INT AUTO_INCREMENT PRIMARY KEY,
      userId INT NOT NULL,
      name VARCHAR(512) NOT NULL,
      description TEXT,
      analysisStatus ENUM('pending','analyzing','done','error') NOT NULL DEFAULT 'pending',
      structure JSON,
      createdAt TIMESTAMP NOT NULL DEFAULT NOW(),
      updatedAt TIMESTAMP NOT NULL DEFAULT NOW() ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  console.log("✓ documentGroups 테이블 생성");

  // 2. documents 테이블에 groupId 컬럼 추가 (없는 경우만)
  try {
    await conn.execute(`ALTER TABLE documents ADD COLUMN groupId INT DEFAULT NULL`);
    console.log("✓ documents.groupId 컬럼 추가");
  } catch (e) {
    if (e.errno === 1060) console.log("- documents.groupId 이미 존재");
    else throw e;
  }

  // 3. documents 테이블에 fileType 컬럼 추가 (없는 경우만)
  try {
    await conn.execute(`ALTER TABLE documents ADD COLUMN fileType ENUM('pdf','doc','docx','ppt','pptx') NOT NULL DEFAULT 'pdf'`);
    console.log("✓ documents.fileType 컬럼 추가");
  } catch (e) {
    if (e.errno === 1060) console.log("- documents.fileType 이미 존재");
    else throw e;
  }

  // 4. learningSessions 테이블에 groupId 컬럼 추가 (없는 경우만)
  try {
    await conn.execute(`ALTER TABLE learningSessions ADD COLUMN groupId INT DEFAULT NULL`);
    console.log("✓ learningSessions.groupId 컬럼 추가");
  } catch (e) {
    if (e.errno === 1060) console.log("- learningSessions.groupId 이미 존재");
    else throw e;
  }

  console.log("\n✅ 마이그레이션 완료");
} catch (err) {
  console.error("마이그레이션 실패:", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
