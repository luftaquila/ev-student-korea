/**
 * 전화번호 입력값을 하이픈 포맷으로 변환 (입력 중 실시간 포매팅용)
 * @param {string} value - 입력값
 * @returns {string} 포맷된 전화번호 (e.g. "010-1234-5678")
 */
export function formatPhone(value) {
  const digits = String(value ?? "").replace(/[^0-9]/g, "").slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

/**
 * 저장된 전화번호(숫자만)를 하이픈 포맷으로 변환 (표시용)
 * @param {string} phone - 10~11자리 전화번호
 * @returns {string} 포맷된 전화번호 (e.g. "010-1234-5678")
 */
export function displayPhone(phone) {
  return formatPhone(phone) || String(phone ?? "");
}

// 서버(queue의 normalizePhone)와 같은 기준으로 검사한다 — 클라이언트가 더 좁게 막으면
// 011·016 같은 유효 번호가 등록 화면에서만 거부된다.
const MOBILE_RE = /^01[016789]\d{7,8}$/;

/**
 * 하이픈이 섞인 입력값이 국내 휴대전화 번호인지 검사한다.
 * @param {string} value - 입력값
 * @returns {boolean}
 */
export function isMobilePhone(value) {
  return MOBILE_RE.test(String(value ?? "").replace(/\D/g, ""));
}
