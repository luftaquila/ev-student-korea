import { ref, computed } from "vue";
import { ROLE_LEVELS } from "./constants.js";

// 서버가 세팅하는 표시용 쿠키(= express-setup.mjs의 COOKIE_USER). HttpOnly가 아니므로
// 프론트가 읽을 수 있지만 어디까지나 UI 표시용이다 — 실제 접근 제어는 서버의 ev_session
// JWT 검증이 담당한다. 여기 값을 조작해도 API는 통과하지 못한다.
const USER_COOKIE = "ev_user";

function roleLevel(role) {
  return ROLE_LEVELS[role] || 0;
}

function getUserFromCookie() {
  const match = document.cookie.match(/(?:^|;\s*)ev_user=([^;]*)/);
  if (!match || !match[1]) return null;
  try { return JSON.parse(decodeURIComponent(match[1])); }
  catch { return null; }
}

export const user = ref(getUserFromCookie());
export const isAuthenticated = computed(() => roleLevel(user.value?.role) >= 1);
export const isOfficial = computed(() => roleLevel(user.value?.role) >= ROLE_LEVELS.official);
export const isAdmin = computed(() => roleLevel(user.value?.role) >= ROLE_LEVELS.admin);

export const ROLE_LABELS = { official: "오피셜", admin: "관리자" };
export const roleLabel = computed(() => ROLE_LABELS[user.value?.role] || "");

// 다른 탭에서 로그인/로그아웃했거나 서버가 역할을 갱신했을 수 있으므로 탭이 다시 보일 때 재확인
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      user.value = getUserFromCookie();
    }
  });
}

export function refreshUserFromCookie() {
  user.value = getUserFromCookie();
  return user.value;
}

export { USER_COOKIE };
