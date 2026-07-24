// DB 타임스탬프는 전부 `strftime('%Y-%m-%dT%H:%M:%fZ','now')`로 기록된 UTC ISO 문자열이다.
// 공백 구분 형식이 섞여 들어와도 파싱되도록 T/Z를 보정한다. 실패하면 null.
export function parseDbTimestamp(value) {
  if (!value) return null;
  const s = String(value);
  const text = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : s.replace(" ", "T") + "Z";
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

// 목록·표에 쓰는 로컬 시간 문자열. 파싱 실패/빈 값은 "-".
export function formatDate(value) {
  const date = parseDbTimestamp(value);
  return date ? date.toLocaleString("ko-KR", { hour12: false }) : "-";
}

// 로그 뷰어용 고정폭 표기 (MM-DD HH:MM:SS). 초 단위까지 정렬해서 읽기 쉽게 한다.
export function formatLogTime(value) {
  const date = parseDbTimestamp(value);
  if (!date) return "-";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`;
}

// <input type="datetime-local"> 값(로컬 시각, 초 없음)을 UTC ISO로 변환한다.
export function localInputToUtc(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}
