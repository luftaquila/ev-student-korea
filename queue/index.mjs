import https from "https";
import crypto from "crypto";
import express from "express";
import Database from "better-sqlite3";
import { createDatabase } from "../shared/db-setup.mjs";
import {
  createApp, setupProcessHandlers, createDbRun, ensureDataDir,
} from "../shared/express-setup.mjs";
import { createLogger } from "../shared/logger.mjs";

const PORT = 9300;

// 대기 상태 전이: waiting → called → done. 취소는 waiting/called 어디서든 가능하다.
const ACTIVE_STATUSES = ["waiting", "called"];

// 안내 문자 앞머리. 대회가 하나뿐이라 설정으로 두지 않고 고정한다.
const SMS_PREFIX = "[EV]";

export function createQueueApp(options = {}) {

const db = createDatabase(Database, options.dbPath || "./data/queue.db");

db.transaction(() => {
  // 엔트리 목록 (관리자가 등록). 대기 등록은 여기 있는 번호만 받는다.
  // 엔트리 한 건은 "번호 · 학교 · 팀"으로 식별한다.
  db.exec(`CREATE TABLE IF NOT EXISTS entries (
    num INTEGER PRIMARY KEY CHECK(num > 0),
    school TEXT NOT NULL DEFAULT '',
    team TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);

  // 마이그레이션: 초기 스키마(name=팀명 / affiliation=소속)를 school·team으로 바꾼다.
  if (db.prepare("PRAGMA table_info(entries)").all().some((c) => c.name === "name")) {
    db.exec(`CREATE TABLE entries_new (
      num INTEGER PRIMARY KEY CHECK(num > 0),
      school TEXT NOT NULL DEFAULT '',
      team TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    db.exec(`INSERT INTO entries_new (num, school, team, created_at)
      SELECT num, COALESCE(affiliation, ''), name, created_at FROM entries`);
    db.exec("DROP TABLE entries");
    db.exec("ALTER TABLE entries_new RENAME TO entries");
  }

  // 등록 대기열. 순번은 별도 컬럼 없이 id 오름차순(FIFO)으로 계산한다.
  db.exec(`CREATE TABLE IF NOT EXISTS queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num INTEGER NOT NULL,
    phone TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'waiting' CHECK(status IN ('waiting','called','done','canceled')),
    notified INTEGER NOT NULL DEFAULT 0,
    registered_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    called_at TEXT,
    finished_at TEXT
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS idx_queue_status ON queue(status, id)");
  // 같은 엔트리의 활성(대기·호출) 등록은 하나만 허용한다
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_queue_active
    ON queue(num) WHERE status IN ('waiting','called')`);

  db.exec(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  )`);

  const defaults = [
    ["open", "true"],          // 대기 접수 열림
    ["sms", "true"],           // SMS 알림 발송 (credential 미설정이면 무시된다)
    ["notify_rank", "3"],      // 대기 N번째가 되면 사전 안내 문자 (0 = 사용 안 함)
  ];
  for (const [k, v] of defaults) {
    db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)").run(k, v);
  }
  // 문자 앞머리는 SMS_PREFIX로 고정됐다 — 초기 버전의 설정 행을 정리한다.
  db.prepare("DELETE FROM settings WHERE key = 'event_name'").run();
})();

const logger = createLogger(db, "queue");
const dbRun = createDbRun();

const getSetting = (key) => db.prepare("SELECT value FROM settings WHERE key = ?").get(key)?.value;
const setSetting = (key, value) => db.prepare("UPDATE settings SET value = ? WHERE key = ?").run(String(value), key);

/* ============================================
   입력 검증
   ============================================ */
function parseEntryNum(value) {
  const num = Number(value);
  if (!Number.isInteger(num) || num < 1 || num > 9999) return null;
  return num;
}

// 하이픈·공백이 섞여 들어와도 숫자만 남겨 정규화한다. 국내 휴대전화 번호만 받는다 —
// SENS 발송 대상이므로 형식이 틀리면 등록 자체를 거부하는 편이 낫다.
function normalizePhone(value) {
  const digits = String(value || "").replace(/\D/g, "");
  return /^01[016789]\d{7,8}$/.test(digits) ? digits : null;
}

/* ============================================
   Rate Limiter (공개 조회 엔드포인트)
   ============================================ */
// 조회는 엔트리 번호+전화번호 쌍이 곧 인증이다. 무차별 대입을 IP당 분당 60회로 막는다.
// (행사장 NAT 뒤에 학생 여럿이 있을 수 있어 너무 조이면 정상 조회가 429를 맞는다)
const rateLimitMap = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now > entry.resetAt) rateLimitMap.delete(ip);
  }
}, 60000).unref();

function rateLimit(req, res, next) {
  // Caddy가 세팅한 신뢰 X-Real-IP 우선(위조 불가), 없으면 X-Forwarded-For 최좌측 → req.ip 폴백.
  const ip = req.headers["x-real-ip"]?.trim() || req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.ip;
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 60000 };
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000; }
  entry.count++;
  rateLimitMap.set(ip, entry);
  if (entry.count > 60) return res.status(429).send("요청이 너무 많습니다. 잠시 후 다시 시도하세요.");
  next();
}

/* ============================================
   SMS (Naver Cloud SENS) — formula-student-korea와 같은 API·credential을 쓴다
   ============================================ */
const smsConfig = (() => {
  const accessKey = process.env.NAVER_CLOUD_ACCESS_KEY;
  const secretKey = process.env.NAVER_CLOUD_SECRET_KEY;
  const serviceId = process.env.NAVER_CLOUD_SMS_SERVICE_ID;
  const sender = process.env.PHONE_NUMBER_SMS_SENDER;
  return accessKey && secretKey && serviceId && sender
    ? { accessKey, secretKey, serviceId, sender }
    : null;
})();

function sendSmsViaSens(to, content) {
  return new Promise((resolve, reject) => {
    const path = `/sms/v2/services/${smsConfig.serviceId}/messages`;
    const timestamp = String(Date.now());
    const signature = crypto
      .createHmac("sha256", smsConfig.secretKey)
      .update(`POST ${path}\n${timestamp}\n${smsConfig.accessKey}`)
      .digest("base64");

    const req = https.request({
      hostname: "sens.apigw.ntruss.com",
      port: 443,
      path,
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "x-ncp-apigw-timestamp": timestamp,
        "x-ncp-iam-access-key": smsConfig.accessKey,
        "x-ncp-apigw-signature-v2": signature,
      },
    }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
        else reject(new Error(`SENS ${res.statusCode}: ${data}`));
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error("SENS 요청 타임아웃"));
    });
    req.on("error", reject);
    req.write(JSON.stringify({
      type: "SMS",
      from: smsConfig.sender,
      content,
      messages: [{ to }],
    }));
    req.end();
  });
}

// 테스트는 options.sendSms로 발송을 가로챈다. 운영에서는 env credential이 있어야 켜진다.
const sendSms = options.sendSms || (smsConfig ? sendSmsViaSens : null);
const smsAvailable = !!sendSms;

function smsEnabled() {
  return smsAvailable && getSetting("sms") === "true";
}

// 발송은 응답을 막지 않는다(fire-and-forget). 성공·실패 모두 로그에 남긴다.
function dispatchSms(kind, num, phone, content) {
  Promise.resolve()
    .then(() => sendSms(phone, content))
    .then((response) => logger.log(null, "sms.send", { kind, num, response }, `#${num}`))
    .catch((e) => logger.warn(null, "sms.send", { kind, num, error: e.message || String(e) }, `#${num}`));
}

// 대기열이 움직일 때마다 앞쪽 notify_rank명 중 아직 안내하지 않은 사람에게 문자를 보낸다.
// notified 플래그로 1인 1회를 보장한다.
function notifyUpcoming() {
  if (!smsEnabled()) return;
  const rank = Number.parseInt(getSetting("notify_rank"), 10) || 0;
  if (rank <= 0) return;

  const upcoming = db.prepare(
    "SELECT id, num, phone, notified FROM queue WHERE status = 'waiting' ORDER BY id LIMIT ?",
  ).all(rank);

  for (const [i, row] of upcoming.entries()) {
    if (row.notified) continue;
    const result = dbRun(() => db.prepare("UPDATE queue SET notified = 1 WHERE id = ?").run(row.id));
    if (!result.success) {
      logger.warn(null, "sms.notify_flag", { error: result.error, num: row.num }, `#${row.num}`);
      continue;
    }
    dispatchSms("advance", row.num, row.phone,
      `${SMS_PREFIX} 엔트리 ${row.num}번 대기 ${i + 1}번째입니다. 등록 데스크 근처에서 대기하세요.`);
  }
}

/* ============================================
   Express 앱
   ============================================ */
// 비-auth 서비스: AUTH_SERVER로 매 요청 역할을 재검증한다(express-setup의 fail-close 로직).
const app = createApp({ express }, (req) => {
  if (["/api/health", "/api/status", "/api/lookup"].includes(req.path)) return null;
  if (req.path.startsWith("/api/queue") || req.path.startsWith("/api/settings")) return "official";
  // 태블릿 등록 화면의 엔트리 확인용 단건 조회만 official에 연다. 나머지 엔트리 관리는 admin.
  if (/^\/api\/entries\/\d+$/.test(req.path) && req.method === "GET") return "official";
  if (req.path.startsWith("/api/")) return "admin"; // default-close
  // SPA 경로 게이트. queue의 "/"는 공개 조회 페이지라 리다이렉트 루프가 없다.
  if (["/register", "/manage"].includes(req.path)) return "official";
  if (req.path === "/entries") return "admin";
  return null;
});

app.get("/api/logs", logger.queryHandler);

app.get("/api/health", (req, res) => res.send("ok"));

/* ============================================
   공개 API — 대기 현황·내 순서 조회
   ============================================ */

// GET /api/status - 전광판용 공개 현황 (전화번호 등 개인정보 없음).
// 조회·태블릿 화면이 상시 폴링하므로 rate limit을 걸지 않는다 — 개인정보가 없어
// 무차별 대입의 대상도 아니다.
app.get("/api/status", (req, res) => {
  const waiting = db.prepare("SELECT COUNT(*) AS cnt FROM queue WHERE status = 'waiting'").get().cnt;
  const called = db.prepare(
    "SELECT num, called_at FROM queue WHERE status = 'called' ORDER BY called_at",
  ).all();
  res.json({ open: getSetting("open") === "true", waiting, called });
});

// POST /api/lookup - 엔트리 번호+전화번호로 내 순서 조회
app.post("/api/lookup", rateLimit, (req, res) => {
  const num = parseEntryNum(req.body.num);
  const phone = normalizePhone(req.body.phone);
  if (!num || !phone) return res.status(400).send("엔트리 번호와 전화번호를 확인하세요.");

  const reg = db.prepare(`
    SELECT q.id, q.num, q.status, q.registered_at, q.called_at, e.school, e.team
    FROM queue q LEFT JOIN entries e ON e.num = q.num
    WHERE q.num = ? AND q.phone = ? AND q.status IN ('waiting','called')
  `).get(num, phone);
  if (!reg) return res.status(404).send("대기 중인 등록 내역이 없습니다.");

  const waitingTotal = db.prepare("SELECT COUNT(*) AS cnt FROM queue WHERE status = 'waiting'").get().cnt;
  const position = reg.status === "waiting"
    ? db.prepare("SELECT COUNT(*) AS cnt FROM queue WHERE status = 'waiting' AND id <= ?").get(reg.id).cnt
    : null;

  res.json({
    num: reg.num,
    school: reg.school,
    team: reg.team,
    status: reg.status,
    position,
    waiting_total: waitingTotal,
    registered_at: reg.registered_at,
    called_at: reg.called_at,
  });
});

/* ============================================
   대기열 운영 API (official)
   ============================================ */

// GET /api/queue - 운영 보드 (대기·호출 목록 + 오늘 처리 현황 + 설정)
app.get("/api/queue", (req, res) => {
  const waiting = db.prepare(`
    SELECT q.id, q.num, q.phone, q.registered_at, q.notified, e.school, e.team
    FROM queue q LEFT JOIN entries e ON e.num = q.num
    WHERE q.status = 'waiting' ORDER BY q.id
  `).all().map((row, i) => ({ ...row, position: i + 1 }));

  const called = db.prepare(`
    SELECT q.id, q.num, q.phone, q.called_at, e.school, e.team
    FROM queue q LEFT JOIN entries e ON e.num = q.num
    WHERE q.status = 'called' ORDER BY q.called_at
  `).all();

  // 타임스탬프는 UTC로 저장되므로 KST(+9) 기준으로 "오늘"을 계산한다
  const today = db.prepare(`
    SELECT
      SUM(status = 'done') AS done,
      SUM(status = 'canceled') AS canceled
    FROM queue
    WHERE finished_at IS NOT NULL AND date(finished_at, '+9 hours') = date('now', '+9 hours')
  `).get();

  res.json({
    waiting,
    called,
    today: { done: today.done || 0, canceled: today.canceled || 0 },
    settings: currentSettings(),
  });
});

// POST /api/queue - 대기 등록 (태블릿, official 세션으로 동작)
app.post("/api/queue", (req, res) => {
  const num = parseEntryNum(req.body.num);
  if (!num) return res.status(400).send("올바르지 않은 엔트리 번호입니다.");
  const phone = normalizePhone(req.body.phone);
  if (!phone) return res.status(400).send("올바르지 않은 전화번호입니다.");

  if (getSetting("open") !== "true") {
    logger.warn(req, "queue.register", { reason: "closed", num }, `#${num}`);
    return res.status(403).send("지금은 대기 접수를 받지 않습니다.");
  }

  const entry = db.prepare("SELECT num, school, team FROM entries WHERE num = ?").get(num);
  if (!entry) {
    logger.warn(req, "queue.register", { reason: "unknown_entry", num }, `#${num}`);
    return res.status(400).send("등록되지 않은 엔트리 번호입니다.");
  }

  const active = db.prepare(
    "SELECT id, status FROM queue WHERE num = ? AND status IN ('waiting','called')",
  ).get(num);
  if (active) {
    logger.warn(req, "queue.register", { reason: "duplicate", num, school: entry.school, team: entry.team, existing_status: active.status }, `#${num}`);
    return res.status(409).send(active.status === "called"
      ? "이미 호출된 엔트리입니다. 등록 데스크로 오세요."
      : "이미 대기 중인 엔트리입니다.");
  }

  const result = dbRun(() => db.prepare("INSERT INTO queue (num, phone) VALUES (?, ?)").run(num, phone));
  if (!result.success) {
    logger.warn(req, "queue.register", { error: result.error, num, school: entry.school, team: entry.team }, `#${num}`);
    return res.status(result.status).send(result.error);
  }

  const position = db.prepare(
    "SELECT COUNT(*) AS cnt FROM queue WHERE status = 'waiting' AND id <= ?",
  ).get(result.result.lastInsertRowid).cnt;
  const waitingTotal = db.prepare("SELECT COUNT(*) AS cnt FROM queue WHERE status = 'waiting'").get().cnt;

  logger.log(req, "queue.register", { num, school: entry.school, team: entry.team, phone, position }, `#${num}`);
  notifyUpcoming();

  res.status(201).json({
    id: result.result.lastInsertRowid,
    num,
    school: entry.school,
    team: entry.team,
    position,
    waiting_total: waitingTotal,
  });
});

// 상태 전이 헬퍼. 전이 규칙에 맞지 않으면 409.
function transition(req, res, id, from, to, timestampCol, action, onSuccess) {
  const reg = db.prepare(`
    SELECT q.id, q.num, q.phone, q.status, e.school, e.team
    FROM queue q LEFT JOIN entries e ON e.num = q.num WHERE q.id = ?
  `).get(Number(id));
  if (!reg) return res.status(404).send("대기 내역을 찾을 수 없습니다.");
  if (!from.includes(reg.status)) {
    logger.warn(req, action, { reason: "invalid_status", status: reg.status, num: reg.num }, `#${reg.num}`);
    return res.status(409).send("이미 처리된 대기 내역입니다.");
  }

  const result = dbRun(() => db.prepare(
    `UPDATE queue SET status = ?, ${timestampCol} = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
  ).run(to, reg.id));
  if (!result.success) {
    logger.warn(req, action, { error: result.error, num: reg.num }, `#${reg.num}`);
    return res.status(result.status).send(result.error);
  }

  logger.log(req, action, { num: reg.num, school: reg.school, team: reg.team }, `#${reg.num}`);
  if (onSuccess) onSuccess(reg);
  notifyUpcoming();
  res.status(200).send();
}

// POST /api/queue/:id/call - 호출 (SMS 발송)
app.post("/api/queue/:id/call", (req, res) => {
  transition(req, res, req.params.id, ["waiting"], "called", "called_at", "queue.call", (reg) => {
    if (smsEnabled()) {
      dispatchSms("call", reg.num, reg.phone,
        `${SMS_PREFIX} 엔트리 ${reg.num}번 차례입니다. 등록 데스크로 오세요.`);
    }
  });
});

// POST /api/queue/:id/done - 등록 완료 (호출 없이 바로 완료도 허용)
app.post("/api/queue/:id/done", (req, res) => {
  transition(req, res, req.params.id, ACTIVE_STATUSES, "done", "finished_at", "queue.done");
});

// POST /api/queue/:id/cancel - 취소·부재 처리
app.post("/api/queue/:id/cancel", (req, res) => {
  transition(req, res, req.params.id, ACTIVE_STATUSES, "canceled", "finished_at", "queue.cancel");
});

/* ============================================
   설정 API (official)
   ============================================ */
function currentSettings() {
  return {
    open: getSetting("open") === "true",
    sms: getSetting("sms") === "true",
    notify_rank: Number.parseInt(getSetting("notify_rank"), 10) || 0,
    sms_prefix: SMS_PREFIX,
    sms_available: smsAvailable,
  };
}

app.get("/api/settings", (req, res) => res.json(currentSettings()));

// PATCH /api/settings - 부분 갱신. 값 검증에 실패하면 아무것도 바꾸지 않는다.
app.patch("/api/settings", (req, res) => {
  const { open, sms, notify_rank } = req.body;
  const changes = {};

  if (open !== undefined) {
    if (typeof open !== "boolean") return res.status(400).send("open은 true/false여야 합니다.");
    changes.open = String(open);
  }
  if (sms !== undefined) {
    if (typeof sms !== "boolean") return res.status(400).send("sms는 true/false여야 합니다.");
    changes.sms = String(sms);
  }
  if (notify_rank !== undefined) {
    const rank = Number(notify_rank);
    if (!Number.isInteger(rank) || rank < 0 || rank > 20) {
      return res.status(400).send("사전 안내 순번은 0~20 사이여야 합니다. (0 = 사용 안 함)");
    }
    changes.notify_rank = String(rank);
  }
  if (Object.keys(changes).length === 0) return res.status(400).send("변경할 설정이 없습니다.");

  const result = dbRun(() => db.transaction(() => {
    for (const [key, value] of Object.entries(changes)) setSetting(key, value);
  })());
  if (!result.success) {
    logger.warn(req, "settings.update", { error: result.error, changes });
    return res.status(result.status).send(result.error);
  }

  logger.log(req, "settings.update", changes);
  // 접수 상태와 무관하게, 안내 순번이 늘었으면 새 범위의 대기자에게 즉시 안내한다
  notifyUpcoming();
  res.json(currentSettings());
});

/* ============================================
   엔트리 관리 API (admin, 단건 조회만 official)
   ============================================ */

// GET /api/entries - 전체 목록 (+ 현재 대기 상태)
app.get("/api/entries", (req, res) => {
  const result = dbRun(() => db.prepare(`
    SELECT e.num, e.school, e.team, e.created_at,
      (SELECT status FROM queue q WHERE q.num = e.num AND q.status IN ('waiting','called')) AS queue_status
    FROM entries e ORDER BY e.num
  `).all());
  if (!result.success) return res.status(result.status).send(result.error);
  res.json(result.result);
});

// GET /api/entries/:num - 태블릿 등록 화면의 엔트리 확인 (official)
app.get("/api/entries/:num", (req, res) => {
  const num = parseEntryNum(req.params.num);
  if (!num) return res.status(400).send("올바르지 않은 엔트리 번호입니다.");
  const entry = db.prepare(`
    SELECT e.num, e.school, e.team,
      (SELECT status FROM queue q WHERE q.num = e.num AND q.status IN ('waiting','called')) AS queue_status
    FROM entries e WHERE e.num = ?
  `).get(num);
  if (!entry) return res.status(404).send("등록되지 않은 엔트리 번호입니다.");
  res.json(entry);
});

// POST /api/entries - 엔트리 추가
app.post("/api/entries", (req, res) => {
  const num = parseEntryNum(req.body.num);
  if (!num) return res.status(400).send("엔트리 번호는 1~9999 사이의 숫자여야 합니다.");
  const school = String(req.body.school || "").trim();
  if (!school) return res.status(400).send("학교를 입력하세요.");
  const team = String(req.body.team || "").trim();
  if (!team) return res.status(400).send("팀을 입력하세요.");

  const result = dbRun(() => db.prepare(
    "INSERT INTO entries (num, school, team) VALUES (?, ?, ?)",
  ).run(num, school, team));
  if (!result.success) {
    if (result.error.includes("이미 존재")) {
      logger.warn(req, "entry.create", { error: "duplicate", num, school, team }, `#${num}`);
      return res.status(400).send("이미 등록된 엔트리 번호입니다.");
    }
    logger.warn(req, "entry.create", { error: result.error, num, school, team }, `#${num}`);
    return res.status(result.status).send(result.error);
  }

  logger.log(req, "entry.create", { num, school, team }, `#${num}`);
  res.status(201).json({ num, school, team });
});

// POST /api/entries/bulk - 일괄 추가 (붙여넣기 입력)
app.post("/api/entries/bulk", (req, res) => {
  const { entries: rows } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).send("추가할 엔트리 목록이 비어있습니다.");

  const insert = db.prepare("INSERT OR IGNORE INTO entries (num, school, team) VALUES (?, ?, ?)");
  const added = [];
  const skipped = [];
  const errors = [];

  const run = db.transaction(() => {
    for (const row of rows) {
      const num = parseEntryNum(row.num);
      if (!num) { errors.push({ row, reason: "올바르지 않은 엔트리 번호" }); continue; }
      const school = String(row.school || "").trim();
      if (!school) { errors.push({ row, reason: "학교 없음" }); continue; }
      const team = String(row.team || "").trim();
      if (!team) { errors.push({ row, reason: "팀 없음" }); continue; }

      const result = insert.run(num, school, team);
      if (result.changes > 0) added.push(num);
      else skipped.push(num);
    }
  });

  const txResult = dbRun(() => run());
  if (!txResult.success) {
    logger.warn(req, "entry.create_bulk", { error: txResult.error, count: rows.length });
    return res.status(txResult.status).send(txResult.error);
  }

  logger.log(req, "entry.create_bulk", { added, skipped, errors: errors.map((e) => e.reason) });
  res.json({ added: added.length, skipped: skipped.length, errors });
});

// DELETE /api/entries/bulk - 일괄 삭제. 대기·호출 중인 엔트리는 건너뛰고 알려준다.
app.delete("/api/entries/bulk", (req, res) => {
  const { nums } = req.body;
  if (!Array.isArray(nums) || nums.length === 0) return res.status(400).send("삭제할 엔트리를 선택하세요.");

  const parsed = nums.map(parseEntryNum);
  if (parsed.some((n) => n === null)) return res.status(400).send("일부 엔트리 번호가 올바르지 않습니다.");

  const txResult = dbRun(() => db.transaction(() => {
    const deleted = [];
    const busy = [];
    const stmt = db.prepare("DELETE FROM entries WHERE num = ?");
    for (const num of parsed) {
      const active = db.prepare(
        "SELECT 1 FROM queue WHERE num = ? AND status IN ('waiting','called')",
      ).get(num);
      if (active) { busy.push(num); continue; }
      if (stmt.run(num).changes > 0) deleted.push(num);
    }
    return { deleted, busy };
  })());

  if (!txResult.success) {
    logger.warn(req, "entry.delete_bulk", { error: txResult.error, nums: parsed });
    return res.status(txResult.status).send(txResult.error);
  }

  logger.log(req, "entry.delete_bulk", txResult.result);
  res.json({ deleted: txResult.result.deleted.length, busy: txResult.result.busy });
});

// PATCH /api/entries/:num - 학교·팀 수정
app.patch("/api/entries/:num", (req, res) => {
  const num = parseEntryNum(req.params.num);
  if (!num) return res.status(400).send("올바르지 않은 엔트리 번호입니다.");
  const entry = db.prepare("SELECT * FROM entries WHERE num = ?").get(num);
  if (!entry) return res.status(404).send("엔트리를 찾을 수 없습니다.");

  const { school, team } = req.body;
  const changes = {};
  if (team !== undefined) {
    const trimmed = String(team).trim();
    if (!trimmed) return res.status(400).send("팀은 비울 수 없습니다.");
    changes.team = trimmed;
  }
  if (school !== undefined) {
    const trimmed = String(school).trim();
    if (!trimmed) return res.status(400).send("학교는 비울 수 없습니다.");
    changes.school = trimmed;
  }
  if (Object.keys(changes).length === 0) return res.status(400).send("변경할 내용이 없습니다.");

  const result = dbRun(() => db.transaction(() => {
    if (changes.team !== undefined) db.prepare("UPDATE entries SET team = ? WHERE num = ?").run(changes.team, num);
    if (changes.school !== undefined) db.prepare("UPDATE entries SET school = ? WHERE num = ?").run(changes.school, num);
  })());
  if (!result.success) {
    logger.warn(req, "entry.update", { error: result.error, changes }, `#${num}`);
    return res.status(result.status).send(result.error);
  }

  logger.log(req, "entry.update", changes, `#${num}`);
  res.status(200).send();
});

// DELETE /api/entries/:num - 삭제. 대기·호출 중이면 거부한다(대기열 정합성 보호).
app.delete("/api/entries/:num", (req, res) => {
  const num = parseEntryNum(req.params.num);
  if (!num) return res.status(400).send("올바르지 않은 엔트리 번호입니다.");
  const entry = db.prepare("SELECT * FROM entries WHERE num = ?").get(num);
  if (!entry) return res.status(404).send("엔트리를 찾을 수 없습니다.");

  const active = db.prepare(
    "SELECT status FROM queue WHERE num = ? AND status IN ('waiting','called')",
  ).get(num);
  if (active) {
    logger.warn(req, "entry.delete", { reason: "active_registration", status: active.status, school: entry.school, team: entry.team }, `#${num}`);
    return res.status(409).send("대기 중인 엔트리는 삭제할 수 없습니다. 먼저 대기를 취소하세요.");
  }

  const result = dbRun(() => db.prepare("DELETE FROM entries WHERE num = ?").run(num));
  if (!result.success) {
    logger.warn(req, "entry.delete", { error: result.error, school: entry.school, team: entry.team }, `#${num}`);
    return res.status(result.status).send(result.error);
  }

  logger.log(req, "entry.delete", { school: entry.school, team: entry.team }, `#${num}`);
  res.status(200).send();
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
  const { app, db } = createQueueApp();
  setupProcessHandlers(db);
  app.listen(PORT, () => console.log(`Queue service running on port ${PORT}`));
}
