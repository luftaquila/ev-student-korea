import { describe, it, before, after, beforeEach } from "node:test";
import { createRequire } from "node:module";
import assert from "node:assert/strict";
import {
  TEST_INTERNAL_SECRET, tmpDbPath, makeAuthCookie, createClient,
  startServer, stopServer, cleanup, setupTestEnv,
} from "../helpers/test-utils.mjs";

// AUTH_SERVER가 없으면 createApp이 JWT를 그대로 신뢰하므로 쿠키만으로 역할을 만들 수 있다.
setupTestEnv();
delete process.env.AUTH_SERVER;

const { createQueueApp } = await import("../../queue/index.mjs");

describe("queue service", () => {
  let server, client, db, dbPath;
  let adminCookie, officialCookie;
  let sentSms; // options.sendSms로 가로챈 발송 기록

  before(async () => {
    dbPath = tmpDbPath();
    sentSms = [];
    const created = createQueueApp({
      dbPath,
      sendSms: async (to, content) => { sentSms.push({ to, content }); return "ok"; },
    });
    db = created.db;
    const started = await startServer(created.app);
    server = started.server;
    client = createClient(started.baseUrl);

    adminCookie = makeAuthCookie({ email: "admin@ev.test", name: "관리자", role: "admin" });
    officialCookie = makeAuthCookie({ email: "off@ev.test", name: "오피셜", role: "official" });
  });

  after(async () => {
    await stopServer(server);
    db.close();
    cleanup(dbPath);
  });

  // 각 테스트 그룹이 서로의 대기열 상태에 기대지 않도록 초기화한다
  function resetQueue() {
    db.prepare("DELETE FROM queue").run();
    db.prepare("DELETE FROM entries").run();
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'open'").run();
    db.prepare("UPDATE settings SET value = 'true' WHERE key = 'sms'").run();
    db.prepare("UPDATE settings SET value = '3' WHERE key = 'notify_rank'").run();
    sentSms.length = 0;
  }

  function addEntry(num, team = `팀${num}`, school = "OO대학교") {
    db.prepare("INSERT INTO entries (num, school, team) VALUES (?, ?, ?)").run(num, school, team);
  }

  const register = (num, phone = `0101234${String(num).padStart(4, "0")}`) =>
    client.post("/api/queue", { cookie: officialCookie, body: { num, phone } });

  describe("공개 엔드포인트", () => {
    beforeEach(resetQueue);

    it("GET /api/health", async () => {
      const res = await client.get("/api/health");
      assert.equal(res.status, 200);
      assert.equal(await res.text(), "ok");
    });

    it("GET /api/status는 인증 없이 현황을 반환한다", async () => {
      const res = await client.get("/api/status");
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.open, true);
      assert.equal(body.waiting, 0);
      assert.deepEqual(body.called, []);
    });

    it("POST /api/lookup은 번호+전화 쌍이 맞아야 조회된다", async () => {
      addEntry(7);
      await register(7, "010-1234-0007");

      const wrong = await client.post("/api/lookup", { body: { num: 7, phone: "010-9999-9999" } });
      assert.equal(wrong.status, 404);

      // 하이픈 유무와 무관하게 정규화되어 매칭된다
      const res = await client.post("/api/lookup", { body: { num: 7, phone: "01012340007" } });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.num, 7);
      assert.equal(body.team, "팀7");
      assert.equal(body.school, "OO대학교");
      assert.equal(body.status, "waiting");
      assert.equal(body.position, 1);
      assert.equal(body.waiting_total, 1);
    });

    it("완료된 등록은 조회되지 않는다", async () => {
      addEntry(8);
      const reg = await (await register(8)).json();
      await client.post(`/api/queue/${reg.id}/done`, { cookie: officialCookie });

      const res = await client.post("/api/lookup", { body: { num: 8, phone: "01012340008" } });
      assert.equal(res.status, 404);
    });

    it("형식이 틀린 조회는 400", async () => {
      const res = await client.post("/api/lookup", { body: { num: "abc", phone: "123" } });
      assert.equal(res.status, 400);
    });
  });

  describe("권한 게이트", () => {
    it("대기 등록은 인증이 필요하다", async () => {
      const res = await client.post("/api/queue", { body: { num: 1, phone: "01012345678" } });
      assert.equal(res.status, 401);
    });

    it("엔트리 관리는 official에게 403", async () => {
      const res = await client.get("/api/entries", { cookie: officialCookie });
      assert.equal(res.status, 403);
      const post = await client.post("/api/entries", { cookie: officialCookie, body: { num: 1, team: "x" } });
      assert.equal(post.status, 403);
    });

    it("엔트리 단건 조회는 official에게 열려 있다 (태블릿 확인용)", async () => {
      resetQueue();
      addEntry(11, "확인팀", "확인대학교");
      const res = await client.get("/api/entries/11", { cookie: officialCookie });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.team, "확인팀");
      assert.equal(body.school, "확인대학교");
      assert.equal(body.queue_status, null);
    });

    it("설정은 official이 변경할 수 있다", async () => {
      const res = await client.patch("/api/settings", { cookie: officialCookie, body: { open: false } });
      assert.equal(res.status, 200);
      await client.patch("/api/settings", { cookie: officialCookie, body: { open: true } });
    });

    it("내부 서비스 시크릿으로 로그를 조회할 수 있다", async () => {
      const res = await client.get("/api/logs", {
        headers: { "X-Internal-Service": TEST_INTERNAL_SECRET },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.service, "queue");
      assert.ok(Array.isArray(body.logs));
    });
  });

  describe("대기 등록", () => {
    beforeEach(resetQueue);

    it("엔트리 번호와 전화번호로 등록하고 순번을 받는다", async () => {
      addEntry(1);
      addEntry(2);

      const first = await register(1);
      assert.equal(first.status, 201);
      const firstBody = await first.json();
      assert.equal(firstBody.position, 1);
      assert.equal(firstBody.team, "팀1");
      assert.equal(firstBody.school, "OO대학교");

      const second = await register(2);
      const secondBody = await second.json();
      assert.equal(secondBody.position, 2);
      assert.equal(secondBody.waiting_total, 2);
    });

    it("미등록 엔트리는 400", async () => {
      const res = await register(999);
      assert.equal(res.status, 400);
    });

    it("전화번호 형식이 틀리면 400", async () => {
      addEntry(1);
      const res = await client.post("/api/queue", { cookie: officialCookie, body: { num: 1, phone: "02-123-4567" } });
      assert.equal(res.status, 400);
    });

    it("이미 대기 중이면 409", async () => {
      addEntry(1);
      await register(1);
      const res = await register(1);
      assert.equal(res.status, 409);
    });

    it("접수가 닫혀 있으면 403", async () => {
      addEntry(1);
      await client.patch("/api/settings", { cookie: officialCookie, body: { open: false } });
      const res = await register(1);
      assert.equal(res.status, 403);
    });

    it("완료된 엔트리는 다시 등록할 수 있다", async () => {
      addEntry(1);
      const reg = await (await register(1)).json();
      await client.post(`/api/queue/${reg.id}/done`, { cookie: officialCookie });
      const res = await register(1);
      assert.equal(res.status, 201);
    });
  });

  describe("호출·완료·취소 흐름", () => {
    beforeEach(resetQueue);

    it("호출하면 called로 바뀌고 호출 SMS가 발송된다", async () => {
      addEntry(1);
      const reg = await (await register(1, "01011110001")).json();
      sentSms.length = 0; // 등록 시 사전 안내는 별도 테스트에서 검증

      const res = await client.post(`/api/queue/${reg.id}/call`, { cookie: officialCookie });
      assert.equal(res.status, 200);

      const row = db.prepare("SELECT status, called_at FROM queue WHERE id = ?").get(reg.id);
      assert.equal(row.status, "called");
      assert.ok(row.called_at);

      const callSms = sentSms.find((s) => s.content.includes("차례입니다"));
      assert.ok(callSms, "호출 SMS가 발송되어야 한다");
      assert.equal(callSms.to, "01011110001");
      assert.ok(callSms.content.includes("엔트리 1번"));
    });

    it("호출된 등록은 공개 현황에 노출된다", async () => {
      addEntry(1);
      const reg = await (await register(1)).json();
      await client.post(`/api/queue/${reg.id}/call`, { cookie: officialCookie });

      const body = await (await client.get("/api/status")).json();
      assert.equal(body.waiting, 0);
      assert.equal(body.called.length, 1);
      assert.equal(body.called[0].num, 1);
    });

    it("완료·취소 후에는 다시 처리할 수 없다", async () => {
      addEntry(1);
      const reg = await (await register(1)).json();
      await client.post(`/api/queue/${reg.id}/done`, { cookie: officialCookie });

      const again = await client.post(`/api/queue/${reg.id}/cancel`, { cookie: officialCookie });
      assert.equal(again.status, 409);
    });

    it("없는 대기 내역은 404", async () => {
      const res = await client.post("/api/queue/99999/call", { cookie: officialCookie });
      assert.equal(res.status, 404);
    });

    it("앞사람이 빠지면 뒷사람 순번이 당겨진다", async () => {
      addEntry(1); addEntry(2); addEntry(3);
      const first = await (await register(1)).json();
      await register(2);
      await register(3, "010-3333-0003");

      await client.post(`/api/queue/${first.id}/done`, { cookie: officialCookie });

      const res = await client.post("/api/lookup", { body: { num: 3, phone: "01033330003" } });
      const body = await res.json();
      assert.equal(body.position, 2);
      assert.equal(body.waiting_total, 2);
    });
  });

  describe("사전 안내 SMS", () => {
    beforeEach(resetQueue);

    it("대기 notify_rank번째 이내에게 1회만 안내한다", async () => {
      await client.patch("/api/settings", { cookie: officialCookie, body: { notify_rank: 2 } });
      for (const n of [1, 2, 3]) addEntry(n);

      await register(1, "01000000001");
      await register(2, "01000000002");
      await register(3, "01000000003");

      const advance = sentSms.filter((s) => s.content.includes("번째입니다"));
      assert.deepEqual(advance.map((s) => s.to).sort(), ["01000000001", "01000000002"]);

      // 1번 완료 → 3번이 2번째로 진입 → 안내 발송. 2번은 다시 받지 않는다.
      const first = db.prepare("SELECT id FROM queue WHERE num = 1").get();
      sentSms.length = 0;
      await client.post(`/api/queue/${first.id}/done`, { cookie: officialCookie });

      const after = sentSms.filter((s) => s.content.includes("번째입니다"));
      assert.equal(after.length, 1);
      assert.equal(after[0].to, "01000000003");
      assert.ok(after[0].content.includes("2번째"));
    });

    it("SMS 설정을 끄면 발송되지 않는다", async () => {
      await client.patch("/api/settings", { cookie: officialCookie, body: { sms: false } });
      addEntry(1);
      const reg = await (await register(1)).json();
      await client.post(`/api/queue/${reg.id}/call`, { cookie: officialCookie });
      assert.equal(sentSms.length, 0);
    });

    it("notify_rank가 0이면 사전 안내가 없다 (호출 SMS는 발송)", async () => {
      await client.patch("/api/settings", { cookie: officialCookie, body: { notify_rank: 0 } });
      addEntry(1);
      const reg = await (await register(1)).json();
      assert.equal(sentSms.length, 0);

      await client.post(`/api/queue/${reg.id}/call`, { cookie: officialCookie });
      assert.equal(sentSms.length, 1);
      assert.ok(sentSms[0].content.includes("차례입니다"));
    });
  });

  describe("설정", () => {
    beforeEach(resetQueue);

    it("GET /api/settings는 현재 설정과 SMS 가용 여부를 반환한다", async () => {
      const body = await (await client.get("/api/settings", { cookie: officialCookie })).json();
      assert.equal(body.open, true);
      assert.equal(body.sms, true);
      assert.equal(body.notify_rank, 3);
      assert.equal(body.sms_prefix, "[EV]");
      assert.equal(body.sms_available, true); // 테스트는 sendSms 주입으로 항상 가용
    });

    it("잘못된 값은 400", async () => {
      const rank = await client.patch("/api/settings", { cookie: officialCookie, body: { notify_rank: 99 } });
      assert.equal(rank.status, 400);
      const open = await client.patch("/api/settings", { cookie: officialCookie, body: { open: "yes" } });
      assert.equal(open.status, 400);
      const empty = await client.patch("/api/settings", { cookie: officialCookie, body: {} });
      assert.equal(empty.status, 400);
    });

    it("문자 앞머리는 [EV]로 고정이며 설정으로 바꿀 수 없다", async () => {
      const res = await client.patch("/api/settings", { cookie: officialCookie, body: { event_name: "EV 2026" } });
      assert.equal(res.status, 400, "event_name만 담긴 요청은 변경할 설정이 없다");

      addEntry(1);
      const reg = await (await register(1)).json();
      await client.post(`/api/queue/${reg.id}/call`, { cookie: officialCookie });
      assert.ok(sentSms.every((s) => s.content.startsWith("[EV] ")));
    });
  });

  describe("엔트리 관리", () => {
    beforeEach(resetQueue);

    it("추가·수정·삭제", async () => {
      const created = await client.post("/api/entries", {
        cookie: adminCookie, body: { num: 10, school: "XX대학교", team: "새팀" },
      });
      assert.equal(created.status, 201);
      assert.deepEqual(await created.json(), { num: 10, school: "XX대학교", team: "새팀" });

      const dup = await client.post("/api/entries", {
        cookie: adminCookie, body: { num: 10, school: "XX대학교", team: "중복" },
      });
      assert.equal(dup.status, 400);

      const patched = await client.patch("/api/entries/10", {
        cookie: adminCookie, body: { team: "바뀐팀", school: "YY대학교" },
      });
      assert.equal(patched.status, 200);
      const row = db.prepare("SELECT school, team FROM entries WHERE num = 10").get();
      assert.deepEqual(row, { school: "YY대학교", team: "바뀐팀" });

      const deleted = await client.delete("/api/entries/10", { cookie: adminCookie });
      assert.equal(deleted.status, 200);
      assert.equal(db.prepare("SELECT 1 FROM entries WHERE num = 10").get(), undefined);
    });

    it("번호·학교·팀은 모두 필수다", async () => {
      const noTeam = await client.post("/api/entries", {
        cookie: adminCookie, body: { num: 10, school: "XX대학교", team: "  " },
      });
      assert.equal(noTeam.status, 400);

      const noSchool = await client.post("/api/entries", {
        cookie: adminCookie, body: { num: 10, school: " ", team: "학교없는팀" },
      });
      assert.equal(noSchool.status, 400);

      const noNum = await client.post("/api/entries", {
        cookie: adminCookie, body: { school: "XX대학교", team: "번호없는팀" },
      });
      assert.equal(noNum.status, 400);

      assert.equal(db.prepare("SELECT COUNT(*) c FROM entries").get().c, 0);
    });

    it("학교·팀을 빈 값으로 수정할 수 없다", async () => {
      addEntry(10);
      const school = await client.patch("/api/entries/10", { cookie: adminCookie, body: { school: "  " } });
      assert.equal(school.status, 400);
      const team = await client.patch("/api/entries/10", { cookie: adminCookie, body: { team: "" } });
      assert.equal(team.status, 400);
    });

    it("대기 중인 엔트리는 삭제가 거부된다", async () => {
      addEntry(10);
      await register(10);
      const res = await client.delete("/api/entries/10", { cookie: adminCookie });
      assert.equal(res.status, 409);
    });

    it("일괄 추가는 중복을 건너뛰고 결과를 보고한다", async () => {
      addEntry(1, "기존팀");
      const res = await client.post("/api/entries/bulk", {
        cookie: adminCookie,
        body: { entries: [
          { num: 1, school: "덮어쓰기시도", team: "중복팀" },
          { num: 2, school: "YY대학교", team: "새팀" },
          { num: "bad", school: "ZZ대학교", team: "형식오류" },
          { num: 3, school: "ZZ대학교", team: "" },
          { num: 4, team: "학교없음" },
        ] },
      });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.added, 1);
      assert.equal(body.skipped, 1);
      assert.equal(body.errors.length, 3);
      assert.equal(db.prepare("SELECT team FROM entries WHERE num = 1").get().team, "기존팀");
      assert.deepEqual(
        db.prepare("SELECT school, team FROM entries WHERE num = 2").get(),
        { school: "YY대학교", team: "새팀" },
      );
    });

    it("일괄 삭제는 대기 중인 엔트리를 건너뛴다", async () => {
      addEntry(1); addEntry(2);
      await register(1);
      const res = await client.delete("/api/entries/bulk", { cookie: adminCookie, body: { nums: [1, 2] } });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.deleted, 1);
      assert.deepEqual(body.busy, [1]);
    });

    it("목록에 현재 대기 상태가 함께 온다", async () => {
      addEntry(1); addEntry(2);
      await register(1);
      const body = await (await client.get("/api/entries", { cookie: adminCookie })).json();
      assert.equal(body.find((e) => e.num === 1).queue_status, "waiting");
      assert.equal(body.find((e) => e.num === 2).queue_status, null);
    });
  });
});

// 초기 버전(name=팀명 / affiliation=소속 · event_name 설정)으로 만들어진 DB를 열었을 때
// school·team으로 옮겨지는지 검증한다. 프로덕션 DB가 이 경로를 탄다.
describe("queue service 마이그레이션", () => {
  let dbPath;

  after(() => cleanup(dbPath));

  it("name·affiliation을 team·school로 옮기고 event_name 설정을 지운다", () => {
    dbPath = tmpDbPath();
    // better-sqlite3는 queue/node_modules에만 있다 — 서비스와 같은 위치에서 해석한다.
    const Database = createRequire(new URL("../../queue/index.mjs", import.meta.url))("better-sqlite3");

    // 초기 스키마 재현
    const legacy = new Database(dbPath);
    legacy.exec(`CREATE TABLE entries (
      num INTEGER PRIMARY KEY CHECK(num > 0),
      name TEXT NOT NULL,
      affiliation TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    )`);
    legacy.exec("CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    legacy.prepare("INSERT INTO entries (num, name, affiliation) VALUES (?, ?, ?)").run(3, "옛날팀", "옛날대학교");
    legacy.prepare("INSERT INTO settings (key, value) VALUES ('event_name', 'EV Student Korea')").run();
    legacy.close();

    const { db } = createQueueApp({ dbPath });
    try {
      assert.deepEqual(
        db.prepare("SELECT num, school, team FROM entries").all(),
        [{ num: 3, school: "옛날대학교", team: "옛날팀" }],
      );
      assert.equal(db.prepare("SELECT 1 FROM settings WHERE key = 'event_name'").get(), undefined);
    } finally {
      db.close();
    }
  });
});
