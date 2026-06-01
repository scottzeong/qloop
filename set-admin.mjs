// 모든 기존 사용자를 admin으로 설정하거나, 특정 이메일을 admin으로 설정
// 실행: node set-admin.mjs [이메일 (선택)]
import "dotenv/config";
import mysql from "mysql2/promise";

const email = process.argv[2]; // 지정 안 하면 전체 업데이트

const conn = await mysql.createConnection(process.env.DATABASE_URL);

if (email) {
  const [result] = await conn.execute("UPDATE users SET role='admin' WHERE email=?", [email]);
  console.log(`Updated ${result.affectedRows} user(s) with email: ${email} → admin`);
} else {
  const [rows] = await conn.execute("SELECT openId, email, role FROM users");
  console.log("Current users:", rows);
  const [result] = await conn.execute("UPDATE users SET role='admin' WHERE role IS NULL OR role != 'admin'");
  console.log(`Updated ${result.affectedRows} user(s) → admin`);
}

await conn.end();
