/**
 * 마이그레이션: users 테이블에 passwordHash 컬럼 추가
 * 실행: node migrate-auth.mjs
 */
import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL 환경변수가 설정되지 않았습니다.");
  process.exit(1);
}

const connection = await mysql.createConnection(url);

try {
  // passwordHash 컬럼이 없으면 추가
  await connection.execute(`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS passwordHash TEXT NULL
  `);
  console.log("✅ users.passwordHash 컬럼 추가 완료");
} catch (err) {
  if (err.message?.includes("Duplicate column")) {
    console.log("ℹ️  passwordHash 컬럼이 이미 존재합니다.");
  } else {
    console.error("❌ 마이그레이션 실패:", err.message);
    process.exit(1);
  }
} finally {
  await connection.end();
}
