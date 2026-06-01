// role 컬럼에 superadmin enum 추가 및 기존 계정 superadmin 지정
// 실행: node migrate-superadmin.mjs [이메일]
//   이메일 미입력 시: 현재 유저 목록 출력 + 첫 번째 유저 superadmin으로 업데이트
//   이메일 입력 시: 해당 이메일 계정을 superadmin으로 업데이트
import "dotenv/config";
import mysql from "mysql2/promise";

const email = process.argv[2];
const conn = await mysql.createConnection(process.env.DATABASE_URL);

// 1) role 컬럼 enum에 superadmin 추가 (이미 있으면 무시)
try {
  await conn.execute(
    `ALTER TABLE users MODIFY COLUMN role ENUM('user','admin','instructor','superadmin') NOT NULL DEFAULT 'user'`
  );
  console.log("✅ role 컬럼 enum 업데이트 완료");
} catch (e) {
  console.log("role 컬럼 수정 중:", e.message);
}

// 2) 현재 유저 조회
const [rows] = await conn.execute("SELECT openId, email, name, role FROM users ORDER BY createdAt ASC");
console.log("\n현재 사용자 목록:");
rows.forEach((r, i) => console.log(`  [${i + 1}] ${r.name || "이름없음"} <${r.email}> - ${r.role}`));

// 3) superadmin 지정
if (email) {
  const [result] = await conn.execute("UPDATE users SET role='superadmin' WHERE email=?", [email]);
  console.log(`\n✅ ${email} → superadmin (${result.affectedRows}건 업데이트)`);
} else if (rows.length > 0) {
  const first = rows[0];
  const [result] = await conn.execute("UPDATE users SET role='superadmin' WHERE openId=?", [first.openId]);
  console.log(`\n✅ 첫 번째 사용자 ${first.email} → superadmin (${result.affectedRows}건 업데이트)`);
} else {
  console.log("\n사용자가 없습니다. 가입 후 다시 실행하세요.");
}

await conn.end();
