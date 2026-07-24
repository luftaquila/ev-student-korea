// 서비스별 API 클라이언트 팩토리. 프로덕션에서는 Caddy가 /<service> 접두사로 라우팅하므로
// basePath를 붙이고, dev 서버에서는 vite proxy가 /api를 백엔드로 넘기므로 접두사가 없다.
export function createApiClient(basePath) {
  const BASE_URL = import.meta.env.PROD ? basePath : "";

  async function request(endpoint, options = {}) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });

    // 세션 만료/미로그인은 곧바로 로그인 흐름으로 보낸다. 돌아올 경로를 넘겨
    // 로그인 후 보던 화면으로 복귀시킨다.
    if (res.status === 401) {
      window.location.href = `/auth/api/login?redirect=${encodeURIComponent(window.location.pathname)}`;
      throw new Error("인증이 필요합니다.");
    }

    if (!res.ok) {
      const message = await res.text();
      throw new Error(message || `요청 실패 (${res.status})`);
    }

    return res;
  }

  const json = async (endpoint, options) => (await request(endpoint, options)).json();

  return { request, json, BASE_URL };
}
