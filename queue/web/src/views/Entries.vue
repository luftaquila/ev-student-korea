<script setup>
import { ref, computed, onMounted } from "vue";
import AppIcon from "@shared/AppIcon.vue";
import { useNotification } from "@shared/useNotification.js";
import * as api from "../api.js";

const { success, error } = useNotification();

const entries = ref([]);
const loading = ref(true);
const search = ref("");
const selectedNums = ref([]);
const busy = ref(false);

const form = ref({ num: "", school: "", team: "" });
const bulkOpen = ref(false);
const bulkText = ref("");

const QUEUE_LABELS = { waiting: "대기 중", called: "호출됨" };

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  if (!q) return entries.value;
  return entries.value.filter((e) =>
    [String(e.num), e.school, e.team].some((v) => (v || "").toLowerCase().includes(q)),
  );
});

const allSelected = computed(() =>
  filtered.value.length > 0 && filtered.value.every((e) => selectedNums.value.includes(e.num)));

const counts = computed(() => ({
  total: entries.value.length,
  queued: entries.value.filter((e) => e.queue_status).length,
}));

// 번호·학교·팀 모두 필수다
const canAdd = computed(() =>
  ["num", "school", "team"].every((k) => String(form.value[k]).trim()));

async function load() {
  loading.value = true;
  try {
    entries.value = await api.fetchEntries();
    const nums = new Set(entries.value.map((e) => e.num));
    selectedNums.value = selectedNums.value.filter((n) => nums.has(n));
  } catch (e) {
    error(e.message);
  } finally {
    loading.value = false;
  }
}

onMounted(load);

function toggleAll(checked) {
  if (checked) {
    const nums = new Set(selectedNums.value);
    filtered.value.forEach((e) => nums.add(e.num));
    selectedNums.value = [...nums];
  } else {
    const visible = new Set(filtered.value.map((e) => e.num));
    selectedNums.value = selectedNums.value.filter((n) => !visible.has(n));
  }
}

/* ── 추가 ─────────────────────────────────────────── */
async function addEntry() {
  busy.value = true;
  try {
    await api.createEntry(form.value);
    success(`엔트리 ${form.value.num}번을 추가했습니다.`);
    form.value = { num: "", school: "", team: "" };
    await load();
  } catch (e) {
    error(e.message);
  } finally {
    busy.value = false;
  }
}

// 한 줄에 "번호, 학교, 팀" (쉼표 또는 탭 구분)
function parseBulk(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [num, school, team] = line.split(/[\t,]/).map((s) => (s || "").trim());
      return { num, school, team };
    });
}

async function addBulk() {
  const rows = parseBulk(bulkText.value);
  if (rows.length === 0) return error("추가할 엔트리를 입력하세요.");
  busy.value = true;
  try {
    const result = await api.createEntriesBulk(rows);
    const parts = [`${result.added}건 추가`];
    if (result.skipped) parts.push(`${result.skipped}건 중복 건너뜀`);
    if (result.errors?.length) parts.push(`${result.errors.length}건 오류`);
    success(parts.join(" · "));
    if (result.errors?.length) {
      error(result.errors.map((e) => `${e.row?.num ?? "?"}: ${e.reason}`).join("\n"));
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
let buffer = null;

function editStart(row, field) {
  buffer = row[field];
}

async function editEnd(row, field) {
  if (buffer === null || buffer === row[field]) { buffer = null; return; }
  const prev = buffer;
  buffer = null;
  try {
    await api.updateEntry(row.num, { [field]: row[field] });
    success(`엔트리 ${row.num}번 정보를 수정했습니다.`);
  } catch (e) {
    row[field] = prev;
    error(e.message);
  }
}

async function removeEntry(row) {
  if (!confirm(`엔트리 ${row.num}번 (${row.team})을 삭제할까요?`)) return;
  try {
    await api.deleteEntry(row.num);
    success(`엔트리 ${row.num}번을 삭제했습니다.`);
    await load();
  } catch (e) {
    error(e.message);
  }
}

async function bulkRemove() {
  if (!confirm(`선택한 ${selectedNums.value.length}개 엔트리를 삭제할까요?`)) return;
  busy.value = true;
  try {
    const result = await api.deleteEntriesBulk(selectedNums.value);
    const parts = [`${result.deleted}건 삭제`];
    if (result.busy?.length) parts.push(`대기 중 ${result.busy.length}건 건너뜀 (${result.busy.join(", ")}번)`);
    success(parts.join(" · "));
    selectedNums.value = [];
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
    <h1 class="page-title">엔트리 관리</h1>
    <div class="row-wrap stats">
      <span class="badge">전체 {{ counts.total }}</span>
      <span v-if="counts.queued" class="badge badge-accent">대기열에 {{ counts.queued }}</span>
    </div>
  </div>

  <!-- 엔트리 추가 -->
  <section class="panel add-panel">
    <div class="panel-head">
      <span class="panel-title">엔트리 추가</span>
      <button class="btn btn-ghost btn-sm" type="button" @click="bulkOpen = true">
        <AppIcon name="plus" /><span>일괄 추가</span>
      </button>
    </div>
    <form class="panel-body add-form" @submit.prevent="addEntry">
      <div class="field field-num">
        <label class="field-label" for="new-num">번호</label>
        <input id="new-num" v-model="form.num" class="input" type="text" inputmode="numeric" maxlength="4" autocomplete="off">
      </div>
      <div class="field">
        <label class="field-label" for="new-school">학교</label>
        <input id="new-school" v-model="form.school" class="input" type="text" autocomplete="off">
      </div>
      <div class="field">
        <label class="field-label" for="new-team">팀</label>
        <input id="new-team" v-model="form.team" class="input" type="text" autocomplete="off">
      </div>
      <button class="btn btn-primary" type="submit" :disabled="busy || !canAdd">추가</button>
    </form>
  </section>

  <!-- 목록 -->
  <section class="panel">
    <div class="panel-head">
      <span class="panel-title">엔트리 목록</span>
      <div class="row-wrap">
        <div class="search">
          <AppIcon name="search" />
          <input v-model="search" class="input input-search" type="search" placeholder="번호·학교·팀 검색">
        </div>
        <button class="btn btn-icon" type="button" title="새로고침" @click="load">
          <AppIcon name="refresh" />
        </button>
      </div>
    </div>

    <div v-if="selectedNums.length" class="bulk-bar">
      <span class="mono">{{ selectedNums.length }}건 선택</span>
      <div class="spacer"></div>
      <button class="btn btn-sm btn-danger" type="button" :disabled="busy" @click="bulkRemove">
        <AppIcon name="trash" /><span>삭제</span>
      </button>
      <button class="btn btn-icon btn-sm" type="button" title="선택 해제" @click="selectedNums = []">
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
            <th>번호</th>
            <th>학교</th>
            <th>팀</th>
            <th>대기 상태</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in filtered" :key="row.num">
            <td class="col-check">
              <input v-model="selectedNums" type="checkbox" :value="row.num" :aria-label="`엔트리 ${row.num} 선택`">
            </td>
            <td class="cell-mono num-cell">{{ row.num }}</td>
            <td>
              <input
                v-model="row.school"
                class="input input-inline"
                type="text"
                @focus="editStart(row, 'school')"
                @blur="editEnd(row, 'school')"
              >
            </td>
            <td>
              <input
                v-model="row.team"
                class="input input-inline"
                type="text"
                @focus="editStart(row, 'team')"
                @blur="editEnd(row, 'team')"
              >
            </td>
            <td>
              <span v-if="row.queue_status" class="badge badge-accent">{{ QUEUE_LABELS[row.queue_status] }}</span>
              <span v-else class="dim">-</span>
            </td>
            <td class="text-right">
              <button
                class="btn btn-icon btn-sm"
                type="button"
                title="삭제"
                :disabled="!!row.queue_status"
                @click="removeEntry(row)"
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
      <AppIcon name="queue" />
      <div>{{ search ? "검색 결과가 없습니다." : "등록된 엔트리가 없습니다." }}</div>
    </div>
  </section>

  <!-- 일괄 추가 모달 -->
  <div v-if="bulkOpen" class="modal-backdrop" @click.self="bulkOpen = false">
    <div class="modal">
      <div class="modal-head">
        <span class="panel-title">엔트리 일괄 추가</span>
        <button class="btn btn-icon btn-sm" type="button" @click="bulkOpen = false"><AppIcon name="close" /></button>
      </div>
      <div class="modal-body stack">
        <div class="field">
          <label class="field-label" for="bulk-text">한 줄에 하나 — 번호, 학교, 팀</label>
          <textarea
            id="bulk-text"
            v-model="bulkText"
            class="input input-mono"
            rows="9"
            placeholder="1, 한국대학교, 팀이름&#10;2, 서울대학교, 다른팀"
          ></textarea>
        </div>
        <p class="dim">이미 등록된 번호는 건너뜁니다.</p>
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

/* 번호·학교·팀·버튼을 한 줄에 둔다. 번호는 네 자리까지라 좁게 고정한다.
   좁은 화면에서는 입력이 쓸 수 없을 만큼 눌리므로 flex-basis 기준으로 접힌다. */
.add-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--spacing-sm);
}

.add-form .field {
  flex: 1 1 9rem;
}

.add-form .field-num {
  flex: none;
  width: 4.5rem;
}

.add-form .btn {
  flex: none;
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

.num-cell {
  font-weight: 600;
}

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

textarea.input {
  resize: vertical;
  line-height: 1.55;
}
</style>
