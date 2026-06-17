// ENCRYPTION_SECRET이 별도로 설정되지 않으면 JWT_SECRET fallback 경고
if (process.env.NODE_ENV === "production" && !process.env.ENCRYPTION_SECRET && process.env.JWT_SECRET) {
  console.warn(
    "[Security] ENCRYPTION_SECRET 환경변수가 없어 JWT_SECRET을 API 키 암호화에 사용합니다. " +
    "ENCRYPTION_SECRET을 별도로 발급하여 Vercel 환경변수에 추가하세요."
  );
}

export const ENV = {
  appId: process.env.VITE_APP_ID ?? "qloop",
  cookieSecret: process.env.JWT_SECRET ?? "",
  encryptionSecret: process.env.ENCRYPTION_SECRET ?? process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",

  // LLM (문서 분석용 OpenAI 또는 호환 API)
  openaiApiKey: process.env.OPENAI_API_KEY ?? "",
  openaiApiUrl: process.env.OPENAI_API_URL ?? "https://api.openai.com",

  // Cloudflare R2 (S3-compatible storage)
  r2AccountId: process.env.R2_ACCOUNT_ID ?? "",
  r2AccessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  r2SecretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  r2BucketName: process.env.R2_BUCKET_NAME ?? "",
  r2PublicUrl: process.env.R2_PUBLIC_URL ?? "",

  // 하위 호환 (Forge 기능 비활성화)
  forgeApiUrl: "",
  forgeApiKey: "",
};
