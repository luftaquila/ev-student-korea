<script setup>
import { ref, computed, onMounted } from "vue";
import AppIcon from "@shared/AppIcon.vue";
import { useNotification } from "@shared/useNotification.js";
import { formatDate } from "@shared/format-date.js";
import { formatPhone } from "@shared/format-phone.js";
import { ROLE_LABELS } from "@shared/userStore.js";
import * as api from "../api.js";

const { success, error } = useNotification();

const ROLES = Object.keys(ROLE_LABELS);

const users = ref([]);
const loading = ref(true);
const search = ref("");
const selectedIds = ref([]);
const busy = ref(false);

const form = ref({ email: "", role: "official", realname: "", phone: "", affiliation: "" });
const bulkOpen = ref(false);
const bulkText = ref("");
const bulkRole = ref("official");

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return users.value;
  return users.value.filter((u) =>
    [u.email, u.name, u.realname, u.affiliation, u.phone]
      .some((v) => (v || "").toLowerCase().includes(q)),
  );
});

const allSelected = computed(() =>
  filtered.value.length > 0 && filtered.value.every((u) => selectedIds.value.includes(u.id)));

const counts = computed(() => ({
  total: users.value.length,
  admin: users.value.filter((u) => u.role === "admin").length,
  inactive: users.value.filter((u) => !u.active).length,
}));

async function load() {
  loading.value = true;
  try {
    users.value = await api.fetchUsers();
    // 목록이 갱신되면 사라진 행의 선택은 버린다
    const ids = new Set(users.value.map((u) => u.id));
    selectedIds.value = selectedIds.value.filter((id) => ids.has(id));
  } catch (e) {
    error(e.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function toggleAll(checked) {
  if (checked) {
    const ids = new Set(selectedIds.value);
    filtered.value.forEach((u) => ids.add(u.id));
    selectedIds.value = [...ids];
  } else {
    const visible = new Set(filtered.value.map((u) => u.id));
    selectedIds.value = selectedIds.value.filter((id) => !visible.has(id));
  }
}

/* ── 추가 ─────────────────────────────────────────── */
async function addUser() {
  const email = form.value.email.trim();
  if (!email) return error("이메일을 입력하세요.");
  busy.value = true;
  try {
    await api.createUser({ ...form.value, email });
    success(`${email} 계정을 추가했습니다.`);
    form.value = { email: "", role: form.value.role, realname: "", phone: "", affiliation: "" };
    await load();
  } catch (e) {
    error(e.message);
  } finally {
    busy.value = false;
  }
}

// 한 줄에 "이메일, 실명, 소속, 연락처" (쉼표 또는 탭 구분). 역할은 모달에서 일괄 지정한다.
function parseBulk(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, realname, affiliation, phone] = line.split(/[\t,]/).map((s) => (s || "").trim());
      return { email, realname, affiliation, phone, role: bulkRole.value };
    });
}

async function addBulk() {
  const rows = parseBulk(bulkText.value);
  if (rows.length === 0) return error("추가할 계정을 입력하세요.");
  busy.value = true;
  try {
    const result = await api.createUsersBulk(rows);
    const parts = [`${result.added}건 추가`];
    if (result.skipped) parts.push(`${result.skipped}건 중복 건너뜀`);
    if (result.errors?.length) parts.push(`${result.errors.length}건 오류`);
    success(parts.join(" · "));
    if (result.errors?.length) {
      error(result.errors.map((e) => `${e.row?.email || "?"}: ${e.reason}`).join("\n"));
    }
    bulkText.value = "";
    bulkOpen.value = false;
    await load();
  } catch (e) {
    error(e.message);
  } finally {
    busy.value = false;
  }
}

/* ── 인라인 수정 ──────────────────────────────────── */
// 편집 직전 값을 기억해 두고, 저장이 실패하면 화면 값을 되돌린다.
let buffer = null;

function editStart(row, field) {
  buffer = row[field];
}

async function editEnd(row, field) {
  if (buffer === null || buffer === row[field]) { buffer = null; return; }
  const prev = buffer;
  buffer = null;
  try {
    await api.updateUser(row.id, { [field]: row[field] });
    success(`${row.email} 정보를 수정했습니다.`);
  } catch (e) {
    row[field] = prev;
    error(e.message);
  }
}

async function setActive(row, ev) {
  const active = ev.target.checked;
  try {
    await api.updateUser(row.id, { active });
    row.active = active ? 1 : 0;
    success(`${row.email} 계정을 ${active ? "활성화" : "비활성화"}했습니다.`);
  } catch (e) {
    // 서버가 거부했으므로 DOM 체크 상태를 원래 값으로 되돌린다
    ev.target.checked = !!row.active;
    error(e.message);
  }
}

async function removeUser(row) {
  if (!confirm(`${row.email} 계정을 삭제할까요?`)) return;
  try {
    await api.deleteUser(row.id);
    success(`${row.email} 계정을 삭제했습니다.`);
    await load();
  } catch (e) {
    error(e.message);
  }
}

/* ── 일괄 작업 ────────────────────────────────────── */
async function bulkToggle(active) {
  busy.value = true;
  try {
    const result = await api.toggleUsers(selectedIds.value, active);
    success(`${result.updated}건을 ${active ? "활성화" : "비활성화"}했습니다.`);
    selectedIds.value = [];
    await load();
  } catch (e) {
    error(e.message);
  } finally {
    busy.value = false;
  }
}

async function bulkRemove() {
  if (!confirm(`선택한 ${selectedIds.value.length}개 계정을 삭제할까요?`)) return;
  busy.value = true;
  try {
    const result = await api.deleteUsers(selectedIds.value);
    success(`${result.deleted}건을 삭제했습니다.`);
    selectedIds.value = [];
    await load();
  } catch (e) {
    error(e.message);
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="page-head">
    <h1 class="page-title">계정 관리</h1>
    <div class="row-wrap stats">
      <span class="badge">전체 {{ counts.total }}</span>
      <span class="badge badge-accent">관리자 {{ counts.admin }}</span>
      <span v-if="counts.inactive" class="badge badge-muted">비활성 {{ counts.inactive }}</span>
    </div>
  </div>

  <!-- 계정 추가 -->
  <section class="panel add-panel">
    <div class="panel-head">
      <span class="panel-title">계정 추가</span>
      <button class="btn btn-ghost btn-sm" type="button" @click="bulkOpen = true">
        <AppIcon name="plus" /><span>일괄 추가</span>
      </button>
    </div>
    <form class="panel-body toolbar" @submit.prevent="addUser">
      <div class="field grow">
        <label class="field-label" for="new-email">이메일</label>
        <input id="new-email" v-model="form.email" class="input" type="email" placeholder="name@example.com" autocomplete="off">
      </div>
      <div class="field">
        <label class="field-label" for="new-role">권한</label>
        <select id="new-role" v-model="form.role" class="input">
          <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label" for="new-realname">실명</label>
        <input id="new-realname" v-model="form.realname" class="input" type="text">
      </div>
      <div class="field">
        <label class="field-label" for="new-affiliation">소속</label>
        <input id="new-affiliation" v-model="form.affiliation" class="input" type="text">
      </div>
      <div class="field">
        <label class="field-label" for="new-phone">연락처</label>
        <input
          id="new-phone" class="input" type="tel" inputmode="numeric" maxlength="13"
          :value="form.phone" @input="form.phone = formatPhone($event.target.value)"
        >
      </div>
      <button class="btn btn-primary" type="submit" :disabled="busy">추가</button>
    </form>
  </section>

  <!-- 목록 -->
  <section class="panel list-panel">
    <div class="panel-head">
      <span class="panel-title">계정 목록</span>
      <div class="row-wrap">
        <div class="search">
          <AppIcon name="search" />
          <input v-model="search" class="input input-search" type="search" placeholder="이메일·이름·소속 검색">
        </div>
        <button class="btn btn-icon" type="button" title="새로고침" @click="load">
          <AppIcon name="refresh" />
        </button>
      </div>
    </div>

    <div v-if="selectedIds.length" class="bulk-bar">
      <span class="mono">{{ selectedIds.length }}건 선택</span>
      <div class="spacer"></div>
      <button class="btn btn-sm" type="button" :disabled="busy" @click="bulkToggle(true)">활성화</button>
      <button class="btn btn-sm" type="button" :disabled="busy" @click="bulkToggle(false)">비활성화</button>
      <button class="btn btn-sm btn-danger" type="button" :disabled="busy" @click="bulkRemove">
        <AppIcon name="trash" /><span>삭제</span>
      </button>
      <button class="btn btn-icon btn-sm" type="button" title="선택 해제" @click="selectedIds = []">
        <AppIcon name="close" />
      </button>
    </div>

    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-check">
              <input type="checkbox" :checked="allSelected" aria-label="전체 선택" @change="toggleAll($event.target.checked)">
            </th>
            <th>이메일</th>
            <th>이름</th>
            <th>소속</th>
            <th>연락처</th>
            <th>권한</th>
            <th class="col-active">활성</th>
            <th>최초 로그인</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.id" :class="{ 'is-inactive': !row.active }">
            <td class="col-check">
              <input v-model="selectedIds" type="checkbox" :value="row.id" :aria-label="`${row.email} 선택`">
            </td>
            <!-- td 자체에 display:flex를 걸면 테이블 셀에서 빠져나와 행 높이·보더가 어긋난다 -->
            <td class="cell-mono">
              <span class="email-cell">
                {{ row.email }}
                <span v-if="row.protected" class="badge badge-accent">기본</span>
              </span>
            </td>
            <td>
              <input
                v-model="row.realname"
                class="input input-inline"
                type="text"
                placeholder="실명"
                @focus="editStart(row, 'realname')"
                @blur="editEnd(row, 'realname')"
              >
              <div v-if="row.name" class="dim login-name">{{ row.name }}</div>
            </td>
            <td>
              <input
                v-model="row.affiliation"
                class="input input-inline"
                type="text"
                placeholder="소속"
                @focus="editStart(row, 'affiliation')"
                @blur="editEnd(row, 'affiliation')"
              >
            </td>
            <td>
              <input
                class="input input-inline input-mono"
                type="tel"
                inputmode="numeric"
                maxlength="13"
                placeholder="연락처"
                :value="row.phone"
                @input="row.phone = formatPhone($event.target.value)"
                @focus="editStart(row, 'phone')"
                @blur="editEnd(row, 'phone')"
              >
            </td>
            <td>
              <select
                v-model="row.role"
                class="input input-inline"
                :disabled="row.protected"
                @focus="editStart(row, 'role')"
                @change="editEnd(row, 'role')"
              >
                <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
              </select>
            </td>
            <td class="col-active">
              <label class="switch">
                <input type="checkbox" :checked="!!row.active" :disabled="row.protected" @change="setActive(row, $event)">
                <span class="switch-track"></span>
              </label>
            </td>
            <td class="cell-mono nowrap dim">{{ row.created_at ? formatDate(row.created_at) : "미로그인" }}</td>
            <td class="text-right">
              <button
                class="btn btn-icon btn-sm"
                type="button"
                title="삭제"
                :disabled="row.protected"
                @click="removeUser(row)"
              >
                <AppIcon name="trash" />
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="loading" class="empty">불러오는 중…</div>
    <div v-else-if="!filtered.length" class="empty">
      <AppIcon name="users" />
      <div>{{ search ? "검색 결과가 없습니다." : "등록된 계정이 없습니다." }}</div>
    </div>
  </section>

  <!-- 일괄 추가 모달 -->
  <div v-if="bulkOpen" class="modal-backdrop" @click.self="bulkOpen = false">
    <div class="modal">
      <div class="modal-head">
        <span class="panel-title">계정 일괄 추가</span>
        <button class="btn btn-icon btn-sm" type="button" @click="bulkOpen = false"><AppIcon name="close" /></button>
      </div>
      <div class="modal-body stack">
        <div class="field">
          <label class="field-label" for="bulk-role">권한 (전체 적용)</label>
          <select id="bulk-role" v-model="bulkRole" class="input">
            <option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABELS[r] }}</option>
          </select>
        </div>
        <div class="field">
          <label class="field-label" for="bulk-text">한 줄에 하나 — 이메일, 실명, 소속, 연락처</label>
          <textarea
            id="bulk-text"
            v-model="bulkText"
            class="input input-mono"
            rows="9"
            placeholder="hong@example.com, 홍길동, OO대학교, 010-0000-0000&#10;kim@example.com, 김철수"
          ></textarea>
        </div>
        <p class="dim">이미 등록된 이메일은 건너뜁니다.</p>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" type="button" @click="bulkOpen = false">취소</button>
        <button class="btn btn-primary" type="button" :disabled="busy" @click="addBulk">추가</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.stats {
  gap: 0.35rem;
}

.add-panel {
  margin-bottom: var(--spacing-md);
}

.add-panel .field {
  flex: 1 1 8rem;
}

.add-panel .field.grow {
  flex: 2 1 16rem;
}

.search {
  position: relative;
  display: flex;
  align-items: center;
}

.search .icon {
  position: absolute;
  left: 0.5rem;
  width: 15px;
  height: 15px;
  color: var(--text-tertiary);
  pointer-events: none;
}

.input-search {
  width: 15rem;
  max-width: 100%;
  padding-left: 1.85rem;
}

.bulk-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem var(--spacing-md);
  background: var(--accent-primary-soft);
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8125rem;
}

.col-check {
  width: 1px;
  padding-right: 0;
}

.col-active {
  width: 1px;
  text-align: center;
}

.email-cell {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}

/* 표 안의 입력은 보더 없이 텍스트처럼 보이게 하고, 포커스에서만 필드로 드러난다.
   background 단축 속성을 쓰면 select.input의 화살표(background-image)까지 지워진다. */
.input-inline {
  min-width: 7rem;
  padding: 0.2rem 0.35rem;
  background-color: transparent;
  border-color: transparent;
}

.input-inline:hover:not(:disabled) {
  border-color: var(--border-color);
}

.input-inline:focus {
  background: var(--bg-input);
}

select.input-inline {
  min-width: 6.5rem;
}

.login-name {
  padding-left: 0.35rem;
  font-size: 0.75rem;
}

textarea.input {
  resize: vertical;
  line-height: 1.55;
}
</style>
