import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  TEST_INTERNAL_SECRET, tmpDbPath, makeAuthCookie, createClient,
  startServer, stopServer, cleanup, setupTestEnv,
} from "../helpers/test-utils.mjs";

const ROOT_EMAIL = "root@ev.test";

// createAuthApp이 모듈 로드가 아니라 호출 시점에 env를 읽으므로 import 전에 세팅해도 되지만,
// 부트스트랩(ADMIN_EMAIL)이 앱 생성 시 실행되므로 반드시 생성 전에 정해져 있어야 한다.
setupTestEnv();
process.env.ADMIN_EMAIL = ROOT_EMAIL;
process.env.GOOGLE_CLIENT_ID = "test-client-id";
delete process.env.TEST_SERVER;

const { createAuthApp } = await import("../../auth/index.mjs");

describe("auth service", () => {
  let server, client, db, dbPath;
  let adminCookie, officialCookie;

  before(async () => {
    dbPath = tmpDbPath();
    const created = createAuthApp({ dbPath });
    db = created.db;
    const started = await startServer(created.app);
    server = started.server;
    client = createClient(started.baseUrl);

    // 세션 쿠키는 DB에 살아 있는 계정에만 유효하다(auth의 validateUser가 자기 DB를 조회).
    db.prepare("INSERT INTO users (email, name, role) VALUES (?, ?, 'official')").run("off@ev.test", "오피셜");
    adminCookie = makeAuthCookie({ email: ROOT_EMAIL, name: "루트", role: "admin" });
    officialCookie = makeAuthCookie({ email: "off@ev.test", name: "오피셜", role: "official" });
  });

  after(async () => {
    await stopServer(server);
    db.close();
    cleanup(dbPath);
  });

  describe("부트스트랩", () => {
    it("ADMIN_EMAIL을 admin으로 등록한다", () => {
      const row = db.prepare("SELECT role, active FROM users WHERE email = ?").get(ROOT_EMAIL);
      assert.equal(row.role, "admin");
      assert.equal(row.active, 1);
    });
  });

  describe("공개 엔드포인트", () => {
    it("GET /api/health", async () => {
      const res = await client.get("/api/health");
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "ok");
    });

    it("GET /api/session은 쿠키 없이 401", async () => {
      const res = await client.get("/api/session");
      assert.equal(res.status, 401);
    });

    it("GET /api/session은 유효 쿠키로 이름·역할을 반환한다", async () => {
      const res = await client.get("/api/session", { cookie: adminCookie });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { name: "루트", role: "admin" });
    });

    it("삭제된 계정의 쿠키는 무효다", async () => {
      const cookie = makeAuthCookie({ email: "ghost@ev.test", name: "없음", role: "admin" });
      const res = await client.get("/api/session", { cookie });
      assert.equal(res.status, 401);
    });
  });

  describe("권한 게이트", () => {
    it("미인증 요청은 401", async () => {
      const res = await client.get("/api/users");
      assert.equal(res.status, 401);
    });

    it("official은 admin API에 403", async () => {
      const res = await client.get("/api/users", { cookie: officialCookie });
      assert.equal(res.status, 403);
    });

    it("admin은 통과한다", async () => {
      const res = await client.get("/api/users", { cookie: adminCookie });
      assert.equal(res.status, 200);
      assert.ok(Array.isArray(await res.json()));
    });

    it("대소문자를 바꿔도 게이트를 우회할 수 없다", async () => {
      const res = await client.get("/API/users", { cookie: officialCookie });
      assert.equal(res.status, 403);
    });
  });

  describe("내부 서비스 인증", () => {
    it("올바른 시크릿으로 역할을 조회한다", async () => {
      const res = await client.get("/api/users/role/off@ev.test", {
        headers: { "X-Internal-Service": TEST_INTERNAL_SECRET },
      });
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { role: "official" });
    });

    it("틀린 시크릿은 403", async () => {
      const res = await client.get("/api/users/role/off@ev.test", {
        headers: { "X-Internal-Service": "wrong" },
      });
      assert.equal(res.status, 403);
    });

    it("미등록 이메일은 404", async () => {
      const res = await client.get("/api/users/role/nobody@ev.test", {
        headers: { "X-Internal-Service": TEST_INTERNAL_SECRET },
      });
      assert.equal(res.status, 404);
    });

    it("비활성 계정은 404 (다른 서비스가 즉시 차단하도록)", async () => {
      db.prepare("INSERT INTO users (email, role, active) VALUES (?, 'official', 0)").run("off2@ev.test");
      const res = await client.get("/api/users/role/off2@ev.test", {
        headers: { "X-Internal-Service": TEST_INTERNAL_SECRET },
      });
      assert.equal(res.status, 404);
    });
  });

  describe("계정 CRUD", () => {
    it("계정을 추가한다", async () => {
      const res = await client.post("/api/users", {
        cookie: adminCookie,
        body: { email: "New@EV.test", role: "official", realname: "새사람", affiliation: "OO대" },
      });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.email, "new@ev.test", "이메일은 소문자로 정규화된다");

      const row = db.prepare("SELECT * FROM users WHERE email = 'new@ev.test'").get();
      assert.equal(row.realname, "새사람");
      assert.equal(row.affiliation, "OO대");
      assert.equal(row.created_at, null, "등록 시점이 아니라 최초 로그인 시점에 기록된다");
    });

    it("중복 이메일은 400", async () => {
      const res = await client.post("/api/users", {
        cookie: adminCookie,
        body: { email: "new@ev.test", role: "official" },
      });
      assert.equal(res.status, 400);
    });

    it("잘못된 이메일 형식은 400", async () => {
      const res = await client.post("/api/users", {
        cookie: adminCookie,
        body: { email: "not-an-email", role: "official" },
      });
      assert.equal(res.status, 400);
    });

    it("알 수 없는 역할은 400", async () => {
      const res = await client.post("/api/users", {
        cookie: adminCookie,
        body: { email: "role@ev.test", role: "student" },
      });
      assert.equal(res.status, 400);
    });

    it("역할과 정보를 수정한다", async () => {
      const id = db.prepare("SELECT id FROM users WHERE email = 'new@ev.test'").get().id;
      const res = await client.patch(`/api/users/${id}`, {
        cookie: adminCookie,
        body: { role: "admin", phone: "010-1234-5678" },
      });
      assert.equal(res.status, 200);
      const row = db.prepare("SELECT role, phone FROM users WHERE id = ?").get(id);
      assert.equal(row.role, "admin");
      assert.equal(row.phone, "010-1234-5678");
    });

    it("없는 계정 수정은 404", async () => {
      const res = await client.patch("/api/users/99999", { cookie: adminCookie, body: { role: "official" } });
      assert.equal(res.status, 404);
    });

    it("계정을 삭제한다", async () => {
      const id = db.prepare("SELECT id FROM users WHERE email = 'new@ev.test'").get().id;
      const res = await client.delete(`/api/users/${id}`, { cookie: adminCookie });
      assert.equal(res.status, 200);
      assert.equal(db.prepare("SELECT id FROM users WHERE id = ?").get(id), undefined);
    });
  });

  describe("일괄 작업", () => {
    it("유효한 행만 추가하고 오류를 되돌려준다", async () => {
      const res = await client.post("/api/users/bulk", {
        cookie: adminCookie,
        body: {
          users: [
            { email: "b1@ev.test", role: "official", realname: "일" },
            { email: "b2@ev.test", role: "official" },
            { email: "off@ev.test", role: "official" },   // 중복 → skipped
            { email: "broken", role: "official" },        // 형식 오류 → errors
            { email: "b3@ev.test", role: "chief" },       // 없는 역할 → official로 보정
          ],
        },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.added, 3);
      assert.equal(body.skipped, 1);
      assert.equal(body.errors.length, 2, "형식 오류 + 역할 보정 안내");
      assert.equal(db.prepare("SELECT role FROM users WHERE email = 'b3@ev.test'").get().role, "official");
    });

    it("일괄 비활성화 후 다시 활성화한다", async () => {
      const ids = db.prepare("SELECT id FROM users WHERE email IN ('b1@ev.test','b2@ev.test')").all().map((r) => r.id);
      let res = await client.patch("/api/users/bulk", { cookie: adminCookie, body: { ids, active: false } });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).updated, 2);
      assert.equal(db.prepare("SELECT COUNT(*) c FROM users WHERE id IN (?,?) AND active = 0").get(...ids).c, 2);

      res = await client.patch("/api/users/bulk", { cookie: adminCookie, body: { ids, active: true } });
      assert.equal(res.status, 200);
    });

    it("정수가 아닌 ID는 400", async () => {
      const res = await client.patch("/api/users/bulk", { cookie: adminCookie, body: { ids: ["abc"], active: false } });
      assert.equal(res.status, 400);
    });

    it("일괄 삭제한다", async () => {
      const ids = db.prepare("SELECT id FROM users WHERE email IN ('b1@ev.test','b2@ev.test','b3@ev.test')").all().map((r) => r.id);
      const res = await client.delete("/api/users/bulk", { cookie: adminCookie, body: { ids } });
      assert.equal(res.status, 200);
      assert.equal((await res.json()).deleted, 3);
    });
  });

  describe("마지막 관리자 잠금 방지", () => {
    it("기본 관리자는 삭제할 수 없다", async () => {
      const id = db.prepare("SELECT id FROM users WHERE email = ?").get(ROOT_EMAIL).id;
      const res = await client.delete(`/api/users/${id}`, { cookie: adminCookie });
      assert.equal(res.status, 400);
      assert.ok(db.prepare("SELECT id FROM users WHERE id = ?").get(id));
    });

    it("기본 관리자는 강등할 수 없다", async () => {
      const id = db.prepare("SELECT id FROM users WHERE email = ?").get(ROOT_EMAIL).id;
      const res = await client.patch(`/api/users/${id}`, { cookie: adminCookie, body: { role: "official" } });
      assert.equal(res.status, 400);
    });

    it("기본 관리자는 비활성화할 수 없다", async () => {
      const id = db.prepare("SELECT id FROM users WHERE email = ?").get(ROOT_EMAIL).id;
      const res = await client.patch(`/api/users/${id}`, { cookie: adminCookie, body: { active: false } });
      assert.equal(res.status, 400);
    });

    it("일괄 비활성화로도 기본 관리자를 끌 수 없다", async () => {
      const id = db.prepare("SELECT id FROM users WHERE email = ?").get(ROOT_EMAIL).id;
      const res = await client.patch("/api/users/bulk", { cookie: adminCookie, body: { ids: [id], active: false } });
      assert.equal(res.status, 400);
    });

    it("유일한 활성 admin이 남지 않는 강등은 거부된다", async () => {
      // ADMIN_EMAIL 보호와 별개로 "마지막 활성 admin" 규칙 자체를 검증하기 위해
      // 보호 대상이 아닌 두 번째 admin을 만들고 기본 관리자를 비활성 처리한다.
      db.prepare("INSERT INTO users (email, role) VALUES ('second@ev.test', 'admin')").run();
      db.prepare("UPDATE users SET active = 0 WHERE email = ?").run(ROOT_EMAIL);
      const cookie = makeAuthCookie({ email: "second@ev.test", name: "둘째", role: "admin" });
      const id = db.prepare("SELECT id FROM users WHERE email = 'second@ev.test'").get().id;

      const demote = await client.patch(`/api/users/${id}`, { cookie, body: { role: "official" } });
      assert.equal(demote.status, 400);

      const deactivate = await client.patch(`/api/users/${id}`, { cookie, body: { active: false } });
      assert.equal(deactivate.status, 400);

      const remove = await client.delete(`/api/users/${id}`, { cookie });
      assert.equal(remove.status, 400);

      db.prepare("UPDATE users SET active = 1 WHERE email = ?").run(ROOT_EMAIL);
      db.prepare("DELETE FROM users WHERE email = 'second@ev.test'").run();
    });
  });

  describe("로그인 리다이렉트 검증", () => {
    it("protocol-relative 경로를 거부한다", async () => {
      const res = await client.get("/api/login?redirect=//evil.com", { redirect: "manual" });
      assert.equal(res.status, 302);
      const state = new URL(res.headers.get("location")).searchParams.get("state");
      assert.equal(JSON.parse(state).redirect, "/");
    });

    it("백슬래시로 시작하는 경로를 거부한다", async () => {
      const res = await client.get("/api/login?redirect=/%5Cevil.com", { redirect: "manual" });
      const state = new URL(res.headers.get("location")).searchParams.get("state");
      assert.equal(JSON.parse(state).redirect, "/");
    });

    it("same-origin 경로는 유지한다", async () => {
      const res = await client.get("/api/login?redirect=/queue", { redirect: "manual" });
      const state = new URL(res.headers.get("location")).searchParams.get("state");
      assert.equal(JSON.parse(state).redirect, "/queue");
    });

    it("nonce 쿠키를 발급한다", async () => {
      const res = await client.get("/api/login", { redirect: "manual" });
      assert.match(res.headers.get("set-cookie") || "", /ev_oauth_nonce=[0-9a-f]{32}/);
    });

    it("nonce가 없으면 콜백을 거부한다", async () => {
      const res = await client.get("/api/callback?code=x&state=%7B%22nonce%22%3A%22a%22%7D", { redirect: "manual" });
      assert.equal(res.headers.get("location"), "/?login_error=nonce");
    });
  });

  describe("시스템 로그", () => {
    it("계정 작업이 감사 로그로 남는다", async () => {
      const res = await client.get("/api/logs?action=user.&limit=200", { cookie: adminCookie });
      assert.equal(res.status, 200);
      const { logs } = await res.json();
      // 같은 action·target으로 성공(info)과 중복 거부(warn)가 모두 남으므로 레벨로 구분한다
      const created = logs.find((l) => l.action === "user.create" && l.target === "new@ev.test" && l.level === "info");
      assert.ok(created, "user.create 성공 로그가 있어야 한다");
      assert.equal(created.actor_email, ROOT_EMAIL);
      assert.equal(JSON.parse(created.detail).role, "official");
      assert.ok(
        logs.some((l) => l.action === "user.create" && l.target === "new@ev.test" && l.level === "warn"),
        "중복 거부는 같은 action의 warn으로 남아야 한다",
      );
    });

    it("실패는 warn 레벨로 구분된다", async () => {
      const res = await client.get("/api/logs?level=warn&action=user.delete", { cookie: adminCookie });
      const { logs } = await res.json();
      assert.ok(logs.some((l) => JSON.parse(l.detail || "{}").reason === "protected_admin"));
      assert.ok(logs.every((l) => l.level === "warn"));
    });

    it("official은 로그를 볼 수 없다", async () => {
      const res = await client.get("/api/logs", { cookie: officialCookie });
      assert.equal(res.status, 403);
    });

    it("집계 API는 서비스 태그를 붙여 반환한다", async () => {
      const res = await client.get("/api/admin/logs?limit=5", { cookie: adminCookie });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(body.services, ["auth"]);
      assert.ok(body.logs.length > 0);
      assert.ok(body.logs.every((l) => l._service === "auth"));
    });

    it("집계 API도 필터를 적용한다", async () => {
      const res = await client.get("/api/admin/logs?action=user.create&limit=50", { cookie: adminCookie });
      const { logs } = await res.json();
      assert.ok(logs.length > 0);
      assert.ok(logs.every((l) => l.action.startsWith("user.create")));
    });

    it("서비스 목록을 반환한다", async () => {
      const res = await client.get("/api/admin/services", { cookie: adminCookie });
      assert.deepEqual(await res.json(), ["auth"]);
    });
  });
});
