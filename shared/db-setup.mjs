export function createDatabase(Database, dbPath) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  return db;
}

// SQL에 보간되는 테이블/컬럼 식별자 가드. 현재 호출부는 전부 하드코딩 리터럴이지만,
// 미래의 호출자가 사용자 입력을 넘기는 실수를 인젝션이 아닌 즉시 예외로 만든다.
export function assertIdentifier(name) {
  if (typeof name !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`올바르지 않은 SQL 식별자입니다: ${name}`);
  }
  return name;
}

export function addColumn(db, table, columnDef) {
  assertIdentifier(table);
  try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`); }
  catch (e) {
    if (e.message && e.message.includes("duplicate column")) return;
    throw e;
  }
}

// 1회성 마이그레이션 실행기. schema_migrations에 이름을 남겨 재기동 시 재실행을 막는다.
// 이미 적용됐으면 false, 이번에 적용했으면 true.
export function runMigrationOnce(db, name, fn, { transaction = true } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  )`);
  if (db.prepare("SELECT 1 FROM schema_migrations WHERE name = ?").get(name)) return false;
  const apply = () => {
    fn();
    db.prepare("INSERT INTO schema_migrations (name) VALUES (?)").run(name);
  };
  if (transaction) db.transaction(apply)();
  else apply();
  return true;
}
