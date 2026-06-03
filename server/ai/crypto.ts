import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { ENV } from "../_core/env";

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits

/**
 * ENCRYPTION_SECRET을 기반으로 암호화 키 생성 (32바이트)
 * ENCRYPTION_SECRET이 없으면 JWT_SECRET으로 fallback (하위 호환)
 */
function getEncryptionKey(): Buffer {
  const secret = ENV.encryptionSecret;
  if (!secret) throw new Error("ENCRYPTION_SECRET (또는 JWT_SECRET) 환경변수가 설정되지 않았습니다.");
  // SHA-256으로 해시하여 32바이트 키 생성
  return createHash("sha256").update(secret).digest();
}

/**
 * API Key 암호화
 * @returns "iv:authTag:ciphertext" 형식의 hex 문자열
 */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(12); // GCM 권장 12바이트
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * API Key 복호화
 * @param encrypted "iv:authTag:ciphertext" 형식의 hex 문자열
 */
export function decryptApiKey(encrypted: string): string {
  const key = getEncryptionKey();
  const parts = encrypted.split(":");
  if (parts.length !== 3) throw new Error("암호화 형식이 올바르지 않습니다.");

  const [ivHex, authTagHex, ciphertextHex] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(ciphertextHex, "hex");

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
