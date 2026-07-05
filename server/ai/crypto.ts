import { createCipheriv, createDecipheriv, randomBytes, createHash, scryptSync } from "crypto";
import { ENV } from "../_core/env";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits

function getSecret(): string {
  const secret = ENV.encryptionSecret;
  if (!secret) throw new Error("ENCRYPTION_SECRET (또는 JWT_SECRET) 환경변수가 설정되지 않았습니다.");
  return secret;
}

/**
 * v1(레거시) 키 파생: SHA-256(secret). Work factor가 없어 신규 암호화에는 더 이상 사용하지 않고,
 * 기존에 저장된 v1 형식 암호문을 복호화하기 위한 하위 호환 용도로만 유지한다.
 */
function getLegacyKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

/** v2 키 파생: scrypt(secret, salt) — 암호문마다 랜덤 salt를 사용해 키를 파생한다. */
function getScryptKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, KEY_LENGTH);
}

/**
 * API Key 암호화
 * @returns "v2:salt:iv:authTag:ciphertext" 형식의 hex 문자열
 */
export function encryptApiKey(plaintext: string): string {
  const secret = getSecret();
  const salt = randomBytes(16);
  const key = getScryptKey(secret, salt);
  const iv = randomBytes(12); // GCM 권장 12바이트
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `v2:${salt.toString("hex")}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * API Key 복호화
 * @param encrypted "v2:salt:iv:authTag:ciphertext" (신규) 또는 "iv:authTag:ciphertext" (레거시) 형식
 */
export function decryptApiKey(encrypted: string): string {
  const secret = getSecret();
  const parts = encrypted.split(":");

  let key: Buffer;
  let iv: Buffer;
  let authTag: Buffer;
  let ciphertext: Buffer;

  if (parts.length === 5 && parts[0] === "v2") {
    const [, saltHex, ivHex, authTagHex, ciphertextHex] = parts;
    key = getScryptKey(secret, Buffer.from(saltHex, "hex"));
    iv = Buffer.from(ivHex, "hex");
    authTag = Buffer.from(authTagHex, "hex");
    ciphertext = Buffer.from(ciphertextHex, "hex");
  } else if (parts.length === 3) {
    const [ivHex, authTagHex, ciphertextHex] = parts;
    key = getLegacyKey(secret);
    iv = Buffer.from(ivHex, "hex");
    authTag = Buffer.from(authTagHex, "hex");
    ciphertext = Buffer.from(ciphertextHex, "hex");
  } else {
    throw new Error("암호화 형식이 올바르지 않습니다.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}

/**
 * API Key 마스킹 (앞 2자 + **** + 마지막 4자)
 */
export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return "****";
  const prefix = apiKey.slice(0, 4);
  const suffix = apiKey.slice(-4);
  return `${prefix}****${suffix}`;
}
