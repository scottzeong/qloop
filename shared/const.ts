export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365; // 하위호환용 (OAuth 콜백에서 사용)
export const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30일 (이메일 로그인 세션)
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
