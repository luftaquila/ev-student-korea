import os from "os";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createJWT, COOKIE_SESSION } from "../../shared/express-setup.mjs";

export const TEST_SECRET = "test-jwt-secret-key";
export const TEST_INTERNAL_SECRET = "test-internal-secret";

export function tmpDbPath() {
  return path.join(os.tmpdir(), `ev-test-${crypto.randomUUID()}.db`);
}

export function makeAuthCookie(user, secret = TEST_SECRET) {
  return `${COOKIE_SESSION}=${createJWT(user, secret)}`;
}

export function createClient(baseUrl) {
  async function req(method, urlPath, { body, cookie, headers, redirect } = {}) {
    const opts = { method, headers: { ...headers } };
    if (body !== undefined) {
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    if (cookie) opts.headers["Cookie"] = cookie;
    // 리다이렉트 검증 테스트는 따라가면 외부(accounts.google.com)로 실제 요청이 나간다
    if (redirect) opts.redirect = redirect;
    return fetch(`${baseUrl}${urlPath}`, opts);
  }
  return {
    get: (p, opts) => req("GET", p, opts || {}),
    post: (p, opts) => req("POST", p, opts || {}),
    patch: (p, opts) => req("PATCH", p, opts || {}),
    delete: (p, opts) => req("DELETE", p, opts || {}),
  };
}

// 포트 0으로 띄워 실제 포트를 받아온다 — 테스트 병렬 실행에서 충돌하지 않는다.
export function startServer(app) {
  return new Promise((resolve) => {
    const server = app.listen(0, () => {
      resolve({ server, baseUrl: `http://localhost:${server.address().port}` });
    });
  });
}

export function stopServer(server) {
  return new Promise((resolve) => server.close(resolve));
}

export function cleanup(...paths) {
  for (const p of paths) {
    for (const suffix of ["", "-wal", "-shm"]) {
      try { fs.unlinkSync(p + suffix); } catch { /* 없으면 무시 */ }
    }
  }
}

export function setupTestEnv() {
  process.env.JWT_SECRET = TEST_SECRET;
  process.env.INTERNAL_SECRET = TEST_INTERNAL_SECRET;
}
