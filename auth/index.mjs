import crypto from "crypto";
import express from "express";
import Database from "better-sqlite3";
import { createDatabase } from "../shared/db-setup.mjs";
import {
  createApp, setupProcessHandlers, createDbRun, createJWT, ensureDataDir, VALID_ROLES,
  isSecureConnection, sessionCookies, isEnvEnabled,
} from "../shared/express-setup.mjs";
import { createLogger, buildLogFilter } from "../shared/logger.mjs";

const PORT = 9100;
const NONCE_COOKIE = "ev_oauth_nonce";

export function createAuthApp(options = {}) {

const db = createDatabase(Database, options.dbPath || "./data/auth.db");

// 계정. role은 official(등록 대기열 운영) / admin(+ 계정·로그 관리) 2단계뿐이다.
// name은 최초 로그인 시 Google 프로필에서 채워지므로 관리자가 추가한 직후에는 NULL이다.
db.exec(`CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  role TEXT NOT NULL CHECK(role IN ('admin', 'official')),
  realname TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  affiliation TEXT DEFAULT '',
  created_at TEXT,
  active INTEGER DEFAULT 1
)`);

// Bootstrap: ADMIN_EMAIL이 DB에 없으면 admin으로 등록한다. 이 계정은 삭제·강등·비활성화가
// 금지되므로(아래 가드) 관리자 전원이 잠기는 상황을 만들 수 없다.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
if (ADMIN_EMAIL) {
  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL);
  if (!existing) {
    db.prepare("INSERT INTO users (email, role) VALUES (?, 'admin')").run(ADMIN_EMAIL);
  }
}

if (isEnvEnabled(process.env.TEST_SERVER)) {
  console.warn("[WARNING] TEST_SERVER mode enabled — all Google logins will be auto-registered as admin");
}

/* ============================================
   Express 앱 설정
   ============================================ */
// auth는 자기 DB를 직접 조회한다(다른 서비스는 AUTH_SERVER로 HTTP 검증).
const validateUser = (email) => {
  const user = db.prepare("SELECT role FROM users WHERE email = ? AND active = 1").get(email);
  return user ? { valid: true, role: user.role } : { valid: false, role: null };
};

const logger = createLogger(db, "auth");

// 로그 집계 실패 폭주 방지: action+service별 최소 60초 간격 throttle
const _aggWarn = new Map();
function warnAggThrottled(action, detail, target) {
  const t = Date.now();
  const k = action + "|" + (target || "");
  const last = _aggWarn.get(k) || 0;
  if (t - last < 60000) return;
  _aggWarn.set(k, t);
  logger.warn(null, action, detail, target);
}

const app = createApp({ express, validateUser, db }, (req) => {
  if (["/api/health", "/api/session", "/api/login", "/api/callback", "/api/logout"].includes(req.path)) return null;
  if (req.path.startsWith("/api/")) return "admin"; // users·logs 포함 API 기본값: default-close
  // SPA 경로는 게이트하지 않는다. 여기서 비-admin을 res.redirect("/")로 돌리면 프로덕션에선
  // 랜딩으로 가지만 auth 단독 실행(dev)에선 "/"가 다시 이 게이트에 걸려 리다이렉트 루프가 된다.
  // 모든 API가 admin으로 닫혀 있으므로 노출되는 것은 빈 셸뿐이고, SPA가 권한 없음 화면을 띄운다.
  return null;
});

app.get("/api/logs", logger.queryHandler);

app.get("/api/health", (req, res) => res.send("ok"));

// 랜딩·SPA가 쿠키 상태를 재검증하는 엔드포인트
app.get("/api/session", (req, res) => {
  if (!req.user) return res.status(401).send();
  res.json({ name: req.user.name, role: req.user.role });
});

/* ============================================
   DB 헬퍼
   ============================================ */
const dbRun = createDbRun();

/* ============================================
   OAuth Rate Limiter
   ============================================ */
const loginLimiter = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginLimiter) {
    if (now > entry.resetAt) loginLimiter.delete(ip);
  }
}, 60000).unref();

function clientIp(req) {
  // Caddy가 세팅한 신뢰 X-Real-IP 우선(위조 불가), 없으면 X-Forwarded-For 최좌측 → req.ip 폴백.
  return req.headers["x-real-ip"]?.trim() || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
}

function checkLoginRate(req, res) {
  const ip = clientIp(req);
  const now = Date.now();
  const entry = loginLimiter.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000; }
  entry.count++;
  loginLimiter.set(ip, entry);
  if (entry.count > 20) {
    logger.warn(req, "auth.rate_limit", { count: entry.count, ip });
    res.redirect("/?login_error=rate_limit");
    return false;
  }
  return true;
}

/* ============================================
   Google OAuth 헬퍼
   ============================================ */
function getRedirectUri(req) {
  if (process.env.PUBLIC_URL) return `${process.env.PUBLIC_URL}/auth/api/callback`;
  const proto = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  return `${proto}://${host}/auth/api/callback`;
}

function sanitizeRedirect(url) {
  if (!url || typeof url !== "string") return "/";
  // same-origin 절대 경로만 허용한다. 브라우저는 Location 헤더의 백슬래시를 슬래시로
  // 정규화하므로 "/\\evil.com"은 protocol-relative URL이 되어 외부 오픈 리다이렉트가
  // 된다. 선두가 "/" 다음에 "/" 또는 "\\"가 오는 경우와, 개행·탭 등 제어문자(헤더 조작·
  // 정규화 트릭)를 모두 거부한다.
  if (url[0] !== "/") return "/";
  if (url[1] === "/" || url[1] === "\\") return "/";
  if (/[\u0000-\u001f]/.test(url)) return "/";
  return url;
}

/* ============================================
   인증 라우트
   ============================================ */

// GET /api/login - Google OAuth 리다이렉트
app.get("/api/login", (req, res) => {
  if (!checkLoginRate(req, res)) return;
  const redirect = sanitizeRedirect(req.query.redirect);
  const redirectUri = getRedirectUri(req);
  const nonce = crypto.randomBytes(16).toString("hex");

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "email profile",
    access_type: "online",
    prompt: "select_account",
    state: JSON.stringify({ redirect, nonce }),
  });

  const secure = isSecureConnection(req);
  // nonce는 state와 쿠키 양쪽에 넣고 콜백에서 대조한다(OAuth CSRF 방어).
  res.setHeader("Set-Cookie", `${NONCE_COOKIE}=${nonce}; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`);
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

// GET /api/callback - OAuth 콜백
app.get("/api/callback", async (req, res) => {
  if (!checkLoginRate(req, res)) return;
  const { code, state } = req.query;

  let redirectUrl = "/";
  let stateNonce = null;
  try {
    const parsed = JSON.parse(state);
    redirectUrl = sanitizeRedirect(parsed.redirect);
    stateNonce = parsed.nonce;
  } catch {
    redirectUrl = sanitizeRedirect(state);
  }

  const cookieNonce = req.cookies[NONCE_COOKIE];
  const nonceMatch = stateNonce && cookieNonce
    && stateNonce.length === cookieNonce.length
    && crypto.timingSafeEqual(Buffer.from(stateNonce), Buffer.from(cookieNonce));
  if (!nonceMatch) {
    logger.warn(req, "auth.nonce_failed", { has_state: !!stateNonce, has_cookie: !!cookieNonce });
    return res.redirect("/?login_error=nonce");
  }

  const secure = isSecureConnection(req);
  const clearNonceCookie = `${NONCE_COOKIE}=; HttpOnly; Path=/auth; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
  const clearSession = sessionCookies({}, 0, secure);

  if (!code) {
    res.setHeader("Set-Cookie", clearNonceCookie);
    return res.redirect("/?login_error=cancelled");
  }

  try {
    const redirectUri = getRedirectUri(req);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!tokenRes.ok) {
      logger.warn(req, "auth.token_failed", { status: tokenRes.status });
      res.setHeader("Set-Cookie", clearNonceCookie);
      return res.redirect("/?login_error=token");
    }

    const tokenData = await tokenRes.json();

    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
      signal: AbortSignal.timeout(5000),
    });

    if (!userInfoRes.ok) {
      logger.warn(req, "auth.userinfo_failed", { status: userInfoRes.status });
      res.setHeader("Set-Cookie", clearNonceCookie);
      return res.redirect("/?login_error=userinfo");
    }

    const userInfo = await userInfoRes.json();
    const email = userInfo.email;
    const name = userInfo.name || email;

    // Google이 이메일 소유를 검증하지 못한 계정은 거부한다(이메일이 계정 primary key이므로
    // 미검증 이메일 클레임 방어). verified_email이 명시적 false일 때만 차단해, 필드가 없는
    // 정상 계정의 로그인은 막지 않는다.
    if (userInfo.verified_email === false) {
      logger.warn(req, "auth.email_unverified", {}, email, { email, name });
      res.setHeader("Set-Cookie", clearNonceCookie);
      return res.redirect("/?login_error=unverified");
    }

    let user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);

    // TEST_SERVER 모드: 미등록 사용자 자동 admin 등록
    if (!user && isEnvEnabled(process.env.TEST_SERVER)) {
      db.prepare("INSERT INTO users (email, name, role, active, created_at) VALUES (?, ?, 'admin', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))").run(email, name);
      user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
      logger.log(req, "user.auto_register", { name, role: "admin", test_server: true }, email, { email, name });
    }

    // 미등록·비활성 계정은 거부한다. 계정 신청 흐름이 없으므로 관리자가 계정 관리에서
    // 이메일을 먼저 등록해야 로그인할 수 있다.
    if (!user || !user.active) {
      const reason = user ? "deactivated" : "unregistered";
      logger.warn(req, "user.login_failed", { reason }, email, { email, name });
      res.setHeader("Set-Cookie", [clearNonceCookie, ...clearSession]);
      return res.redirect(`/?login_error=${reason}`);
    }

    // Google 프로필 이름 동기화 (best-effort: 실패해도 로그인을 막지 않는다)
    if (name && name !== user.name) {
      const r = dbRun(() => db.prepare("UPDATE users SET name = ? WHERE id = ?").run(name, user.id));
      if (!r.success) logger.warn(req, "user.name_sync", { error: r.error }, email, { email, name, role: user.role });
    }

    // 최초 로그인 시점 기록
    if (!user.created_at) {
      const r = dbRun(() => db.prepare("UPDATE users SET created_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?").run(user.id));
      if (!r.success) logger.warn(req, "user.created_at_init", { error: r.error }, email, { email, name, role: user.role });
    }

    const jwt = createJWT({ email, name, role: user.role }, process.env.JWT_SECRET);
    res.setHeader("Set-Cookie", [
      ...sessionCookies({ jwt, name, role: user.role }, 7 * 24 * 3600, secure),
      clearNonceCookie,
    ]);

    logger.log(req, "user.login", { name, role: user.role }, email, { email, name, role: user.role });

    res.redirect(redirectUrl);
  } catch (e) {
    logger.warn(req, "auth.callback_error", { error: e.message || String(e) });
    res.setHeader("Set-Cookie", clearNonceCookie);
    res.redirect("/?login_error=error");
  }
});

// POST /api/logout - 쿠키 삭제
app.post("/api/logout", (req, res) => {
  if (!req.user) return res.status(401).send("인증이 필요합니다.");
  logger.log(req, "user.logout", null, req.user.email);
  res.setHeader("Set-Cookie", sessionCookies({}, 0, isSecureConnection(req)));
  res.status(200).send();
});

/* ============================================
   계정 관리 (admin)
   ============================================ */

// GET /api/users/role/:email - 역할 조회 (내부 서비스용). 다른 서비스의 createApp이
// 매 요청 이 엔드포인트로 역할을 재검증하므로 캐싱 없이 즉시 반영된다.
app.get("/api/users/role/:email", (req, res) => {
  const user = db.prepare("SELECT role FROM users WHERE email = ? AND active = 1").get(req.params.email);
  if (!user) return res.status(404).send();
  res.json({ role: user.role });
});

// GET /api/users - 전체 계정 목록
app.get("/api/users", (req, res) => {
  const result = dbRun(() => db.prepare(
    "SELECT id, email, name, role, realname, phone, affiliation, active, created_at FROM users ORDER BY id",
  ).all());
  if (!result.success) return res.status(result.status).send(result.error);
  res.json(result.result.map((u) => ({ ...u, protected: u.email === ADMIN_EMAIL })));
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// POST /api/users - 계정 추가
app.post("/api/users", (req, res) => {
  const { email, role, realname, phone, affiliation } = req.body;
  if (!email || !email.trim()) return res.status(400).send("이메일을 입력하세요.");
  const normalized = email.trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) return res.status(400).send("올바르지 않은 이메일 형식입니다.");
  if (!VALID_ROLES.includes(role)) return res.status(400).send("올바르지 않은 역할입니다.");

  const result = dbRun(() => db.prepare(
    "INSERT INTO users (email, role, realname, phone, affiliation) VALUES (?, ?, ?, ?, ?)",
  ).run(normalized, role, (realname || "").trim(), (phone || "").trim(), (affiliation || "").trim()));

  if (!result.success) {
    if (result.error.includes("UNIQUE")) {
      logger.warn(req, "user.create", { error: "duplicate" }, normalized);
      return res.status(400).send("이미 등록된 이메일입니다.");
    }
    logger.warn(req, "user.create", { error: result.error }, normalized);
    return res.status(result.status).send(result.error);
  }

  logger.log(req, "user.create", { role, realname: realname || "", affiliation: affiliation || "" }, normalized);
  res.status(201).json({ id: result.result.lastInsertRowid, email: normalized, role });
});

// POST /api/users/bulk - 계정 일괄 추가 (붙여넣기 입력)
app.post("/api/users/bulk", (req, res) => {
  const { users: rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).send("추가할 계정 목록이 비어있습니다.");

  const insert = db.prepare("INSERT OR IGNORE INTO users (email, role, realname, phone, affiliation) VALUES (?, ?, ?, ?, ?)");
  const added = [];
  const skipped = [];
  const errors = [];

  const run = db.transaction(() => {
    for (const row of rows) {
      const email = (row.email || "").trim().toLowerCase();
      if (!email) { errors.push({ row, reason: "이메일 없음" }); continue; }
      // 단건 추가와 동일한 형식 검증 — 벌크만 우회해 잘못된 주소가 저장되면 이후 로그인
      // 매칭이 조용히 실패한다.
      if (!EMAIL_RE.test(email)) { errors.push({ row, reason: "올바르지 않은 이메일 형식" }); continue; }

      const role = VALID_ROLES.includes(row.role) ? row.role : "official";
      if (!VALID_ROLES.includes(row.role)) {
        errors.push({ row, reason: `알 수 없는 역할 "${row.role}", "official"로 설정됨` });
      }

      const result = insert.run(email, role, (row.realname || "").trim(), (row.phone || "").trim(), (row.affiliation || "").trim());
      if (result.changes > 0) added.push(email);
      else skipped.push(email);
    }
  });

  const txResult = dbRun(() => run());
  if (!txResult.success) {
    logger.warn(req, "user.create_bulk", { error: txResult.error, count: rows.length });
    return res.status(txResult.status).send(txResult.error);
  }

  logger.log(req, "user.create_bulk", { added, skipped, errors: errors.map((e) => e.reason) });
  res.json({ added: added.length, skipped: skipped.length, errors });
});

// PATCH /api/users/bulk - 일괄 활성/비활성
app.patch("/api/users/bulk", (req, res) => {
  const { ids, active } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).send("계정을 선택하세요.");
  if (active === undefined) return res.status(400).send("active 값이 필요합니다.");

  const numIds = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (numIds.length === 0) return res.status(400).send("유효한 ID가 없습니다.");
  if (numIds.length !== ids.length) return res.status(400).send("일부 ID가 올바르지 않습니다.");

  if (ADMIN_EMAIL && !active) {
    const protectedUser = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL);
    if (protectedUser && numIds.includes(protectedUser.id)) {
      logger.warn(req, "user.bulk_toggle", { reason: "protected_admin", id: protectedUser.id });
      return res.status(400).send("기본 관리자는 비활성화할 수 없습니다.");
    }
  }

  // 마지막 활성 관리자 잠금 방지: 비활성화 대상이 현재 활성 admin 전부를 포함하면 거부.
  // (active=0 admin은 로그인·검증이 불가하므로 활성 admin 기준으로 센다.)
  if (!active) {
    const activeAdminIds = db.prepare("SELECT id FROM users WHERE role = 'admin' AND active = 1").all().map((r) => r.id);
    if (activeAdminIds.length > 0 && activeAdminIds.every((aid) => numIds.includes(aid))) {
      logger.warn(req, "user.bulk_toggle", { reason: "last_admin_deactivate" });
      return res.status(400).send("마지막 활성 관리자는 비활성화할 수 없습니다.");
    }
  }

  const placeholders = numIds.map(() => "?").join(",");
  const emails = db.prepare(`SELECT email FROM users WHERE id IN (${placeholders})`).all(...numIds).map((r) => r.email);
  const stmt = db.prepare(`UPDATE users SET active = ? WHERE id IN (${placeholders})`);

  const txResult = dbRun(() => db.transaction(() => stmt.run(active ? 1 : 0, ...numIds))());
  if (!txResult.success) {
    logger.warn(req, "user.bulk_toggle", { error: txResult.error, emails, active: !!active });
    return res.status(txResult.status).send(txResult.error);
  }

  logger.log(req, "user.bulk_toggle", { emails, active: !!active });
  res.json({ updated: txResult.result.changes });
});

// DELETE /api/users/bulk - 일괄 삭제
app.delete("/api/users/bulk", (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).send("삭제할 계정을 선택하세요.");

  const numIds = ids.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  if (numIds.length === 0) return res.status(400).send("유효한 ID가 없습니다.");
  if (numIds.length !== ids.length) return res.status(400).send("일부 ID가 올바르지 않습니다.");

  if (ADMIN_EMAIL) {
    const protectedUser = db.prepare("SELECT id FROM users WHERE email = ?").get(ADMIN_EMAIL);
    if (protectedUser && numIds.includes(protectedUser.id)) {
      logger.warn(req, "user.bulk_delete", { reason: "protected_admin", id: protectedUser.id });
      return res.status(400).send("기본 관리자는 삭제할 수 없습니다.");
    }
  }

  const placeholders = numIds.map(() => "?").join(",");

  let denyReason = null;
  const txResult = dbRun(() => db.transaction(() => {
    // 삭제 대상을 제외한 활성 admin이 0이 되면 거부한다(강등·비활성화와 동일 기준).
    const remainingActiveAdmins = db.prepare(
      `SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND active = 1 AND id NOT IN (${placeholders})`,
    ).get(...numIds).cnt;
    if (remainingActiveAdmins < 1) {
      denyReason = "last_admin";
      throw { status: 400, message: "마지막 관리자는 삭제할 수 없습니다." };
    }

    const emails = db.prepare(`SELECT email FROM users WHERE id IN (${placeholders})`).all(...numIds).map((r) => r.email);
    const delResult = db.prepare(`DELETE FROM users WHERE id IN (${placeholders})`).run(...numIds);
    return { changes: delResult.changes, emails };
  })());

  if (!txResult.success) {
    logger.warn(req, "user.bulk_delete", denyReason
      ? { error: txResult.error, reason: denyReason, ids: numIds }
      : { error: txResult.error, ids: numIds });
    return res.status(txResult.status).send(txResult.error);
  }

  logger.log(req, "user.bulk_delete", { emails: txResult.result.emails });
  res.json({ deleted: txResult.result.changes });
});

// PATCH /api/users/:id - 역할·실명·연락처·소속·활성 변경
app.patch("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);
  const { role, realname, phone, affiliation, active } = req.body;

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).send("계정을 찾을 수 없습니다.");

  if (role !== undefined) {
    if (!VALID_ROLES.includes(role)) return res.status(400).send("올바르지 않은 역할입니다.");
    if (user.email === ADMIN_EMAIL && role !== "admin") {
      logger.warn(req, "user.update", { reason: "protected_admin", role }, user.email);
      return res.status(400).send("기본 관리자의 역할은 변경할 수 없습니다.");
    }
  }

  if (active !== undefined && user.email === ADMIN_EMAIL) {
    logger.warn(req, "user.update", { reason: "protected_admin", active }, user.email);
    return res.status(400).send("기본 관리자는 비활성화할 수 없습니다.");
  }

  let denyReason = null;
  const result = dbRun(() => {
    db.transaction(() => {
      if (role !== undefined && user.role === "admin" && role !== "admin") {
        const remainingActiveAdmins = db.prepare(
          "SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND active = 1 AND id != ?",
        ).get(id).cnt;
        if (remainingActiveAdmins < 1) {
          denyReason = "last_admin_demote";
          throw { status: 400, message: "마지막 관리자는 강등할 수 없습니다." };
        }
      }
      if (active !== undefined && !active && user.role === "admin") {
        const activeAdmins = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND active = 1").get().cnt;
        if (activeAdmins <= 1) {
          denyReason = "last_admin_deactivate";
          throw { status: 400, message: "마지막 활성 관리자는 비활성화할 수 없습니다." };
        }
      }
      if (role !== undefined) db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
      if (realname !== undefined) db.prepare("UPDATE users SET realname = ? WHERE id = ?").run(realname, id);
      if (phone !== undefined) db.prepare("UPDATE users SET phone = ? WHERE id = ?").run(phone, id);
      if (affiliation !== undefined) db.prepare("UPDATE users SET affiliation = ? WHERE id = ?").run(affiliation, id);
      if (active !== undefined) db.prepare("UPDATE users SET active = ? WHERE id = ?").run(active ? 1 : 0, id);
    })();
  });

  if (!result.success) {
    logger.warn(req, "user.update", denyReason
      ? { error: result.error, reason: denyReason, role }
      : { error: result.error }, user.email);
    return res.status(result.status).send(result.error);
  }

  const changes = {};
  if (role !== undefined) changes.role = role;
  if (realname !== undefined) changes.realname = realname;
  if (phone !== undefined) changes.phone = phone;
  if (affiliation !== undefined) changes.affiliation = affiliation;
  if (active !== undefined) changes.active = !!active;
  logger.log(req, "user.update", changes, user.email);

  res.status(200).send();
});

// DELETE /api/users/:id - 계정 삭제
app.delete("/api/users/:id", (req, res) => {
  const id = Number(req.params.id);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  if (!user) return res.status(404).send("계정을 찾을 수 없습니다.");

  if (user.email === ADMIN_EMAIL) {
    logger.warn(req, "user.delete", { reason: "protected_admin" }, user.email);
    return res.status(400).send("기본 관리자는 삭제할 수 없습니다.");
  }

  // 활성 admin만 로그인·검증이 가능하므로, 대상을 제외한 활성 admin이 0이 되면 거부한다.
  if (user.role === "admin") {
    const remainingActiveAdmins = db.prepare(
      "SELECT COUNT(*) as cnt FROM users WHERE role = 'admin' AND active = 1 AND id != ?",
    ).get(id).cnt;
    if (remainingActiveAdmins < 1) {
      logger.warn(req, "user.delete", { reason: "last_admin" }, user.email);
      return res.status(400).send("마지막 관리자는 삭제할 수 없습니다.");
    }
  }

  const result = dbRun(() => db.prepare("DELETE FROM users WHERE id = ?").run(id));
  if (!result.success) {
    logger.warn(req, "user.delete", { error: result.error }, user.email);
    return res.status(result.status).send(result.error);
  }
  logger.log(req, "user.delete", { role: user.role, name: user.name }, user.email);
  res.status(200).send();
});

/* ============================================
   로그 집계 API
   ============================================ */
// "name:url,name:url" 형태. 서비스가 늘어나면 compose.yml의 LOG_SERVICES에 한 줄만 추가하면
// 시스템 로그 뷰어가 자동으로 그 서비스의 /api/logs까지 집계한다.
const LOG_SERVICES = (() => {
  const env = process.env.LOG_SERVICES || "";
  const map = {};
  for (const part of env.split(",").filter(Boolean)) {
    const idx = part.indexOf(":");
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const url = part.slice(idx + 1).trim();
    if (name && url) map[name] = url;
  }
  return map;
})();

// GET /api/admin/logs - 전체 서비스 로그 집계
app.get("/api/admin/logs", async (req, res) => {
  const { service, limit: qLimit, offset: qOffset, ...filters } = req.query;
  const parsedLimit = Number(qLimit);
  const parsedOffset = Number(qOffset);
  const limit = Number.isInteger(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 500)) : 100;
  const offset = Number.isInteger(parsedOffset) ? Math.max(0, parsedOffset) : 0;

  const qs = new URLSearchParams();
  // 전역 시간순 병합 후 offset을 적용하므로 각 서비스에서 최소 offset+limit개가 필요하다.
  // 서비스별 logger 보존 상한이 50,000행이라 그 이상 가져올 필요는 없다.
  const fetchLimit = Math.min(offset + limit, 50000);
  qs.set("limit", String(fetchLimit));
  for (const [k, v] of Object.entries(filters)) {
    if (v) qs.set(k, v);
  }

  const targetServices = service
    ? Object.fromEntries(
        service.split(",").map((s) => s.trim()).filter(Boolean)
          .map((name) => [name, name === "auth" ? null : LOG_SERVICES[name]]),
      )
    : { auth: null, ...LOG_SERVICES };

  const fetches = Object.entries(targetServices).map(async ([name, url]) => {
    if (name === "auth") {
      // 로컬 쿼리 (HTTP 왕복 없음)
      try {
        const { where, params } = buildLogFilter(filters);
        const total = db.prepare(`SELECT COUNT(*) as cnt FROM logs ${where}`).get(...params).cnt;
        // 원격 서비스와 동일한 offset+limit 윈도우를 적용해야 두 번째 페이지 이후가 비지 않는다.
        const logs = db.prepare(`SELECT * FROM logs ${where} ORDER BY id DESC LIMIT ?`).all(...params, fetchLimit);
        return { name, logs: logs.map((l) => ({ ...l, _service: name })), total };
      } catch (e) {
        logger.warn(null, "logs.query_failed", { error: e.message }, "auth");
        return { name, logs: [], total: 0 };
      }
    }

    if (!url) {
      warnAggThrottled("logs.aggregate_failed", { service: name, error: "unknown service" }, name);
      return { name, logs: [], total: 0 };
    }

    try {
      const fetchRes = await fetch(`${url}/api/logs?${qs}`, {
        headers: { "X-Internal-Service": process.env.INTERNAL_SECRET || "" },
        signal: AbortSignal.timeout(5000),
      });
      if (!fetchRes.ok) {
        warnAggThrottled("logs.aggregate_failed", { service: name, status: fetchRes.status }, name);
        return { name, logs: [], total: 0 };
      }
      const data = await fetchRes.json();
      return { name, logs: (data.logs || []).map((l) => ({ ...l, _service: name })), total: data.total || 0 };
    } catch (e) {
      warnAggThrottled("logs.aggregate_failed", { service: name, error: e.message }, name);
      return { name, logs: [], total: 0 };
    }
  });

  const allResults = await Promise.all(fetches);

  const merged = [];
  let totalSum = 0;
  for (const r of allResults) {
    merged.push(...r.logs);
    totalSum += r.total;
  }
  merged.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

  res.json({ logs: merged.slice(offset, offset + limit), total: totalSum, services: Object.keys(targetServices) });
});

// GET /api/admin/services - 로그 뷰어의 서비스 필터 목록
app.get("/api/admin/services", (req, res) => {
  res.json(["auth", ...Object.keys(LOG_SERVICES)]);
});

/* ============================================
   SPA Fallback - Vue Router 지원
   ============================================ */
app.get("/{*splat}", (req, res) => {
  res.sendFile("index.html", { root: "./web/dist" });
});

return { app, db };
}

const isDirectRun = import.meta.filename === process.argv[1];
if (isDirectRun) {
  ensureDataDir();
  const { app, db } = createAuthApp();
  setupProcessHandlers(db);
  app.listen(PORT, () => console.log(`Auth service running on port ${PORT}`));
}
