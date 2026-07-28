<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import AppIcon from "@shared/AppIcon.vue";
import { useNotification } from "@shared/useNotification.js";
import { formatDate, formatLogTime, localInputToUtc } from "@shared/format-date.js";
import * as api from "../api.js";

const { error } = useNotification();

const LEVELS = [
  { value: "info", label: "정보", badge: "badge" },
  { value: "warn", label: "경고", badge: "badge badge-warn" },
  { value: "error", label: "오류", badge: "badge badge-danger" },
];
const LEVEL_BADGE = Object.fromEntries(LEVELS.map((l) => [l.value, l.badge]));
const LEVEL_LABEL = Object.fromEntries(LEVELS.map((l) => [l.value, l.label]));
const REFRESH_MS = 10000;
const LIMIT = 100;

const services = ref([]);
const selServices = ref([]); // 비어 있으면 전체
const selLevels = ref([]);
const filters = ref({ action: "", actor: "", search: "", from: "", to: "" });

const logs = ref([]);
const total = ref(0);
const offset = ref(0);
const loading = ref(false);
const autoRefresh = ref(false);
const detail = ref(null);

let timer = null;

const hasFilters = computed(() =>
  selServices.value.length > 0 || selLevels.value.length > 0 ||
  Object.values(filters.value).some((v) => v));

const rangeLabel = computed(() => {
  if (!logs.value.length) return "0";
  return `${offset.value + 1}–${offset.value + logs.value.length} / ${total.value}`;
});

function buildParams() {
  const params = { limit: LIMIT, offset: offset.value };
  if (selServices.value.length) params.service = selServices.value.join(",");
  if (selLevels.value.length) params.level = selLevels.value.join(",");
  if (filters.value.action.trim()) params.action = filters.value.action.trim();
  if (filters.value.actor.trim()) params.actor = filters.value.actor.trim();
  if (filters.value.search.trim()) params.search = filters.value.search.trim();
  // datetime-local은 로컬 시각이고 DB는 UTC ISO이므로 변환해서 보낸다
  const from = localInputToUtc(filters.value.from);
  const to = localInputToUtc(filters.value.to);
  if (from) params.from = from;
  if (to) params.to = to;
  return params;
}

async function load({ silent = false } = {}) {
  if (!silent) loading.value = true;
  try {
    const data = await api.fetchLogs(buildParams());
    logs.value = data.logs || [];
    total.value = data.total || 0;
  } catch (e) {
    error(e.message);
  } finally {
    loading.value = false;
  }
}

function applyFilters() {
  offset.value = 0;
  load();
}

function resetFilters() {
  selServices.value = [];
  selLevels.value = [];
  filters.value = { action: "", actor: "", search: "", from: "", to: "" };
  applyFilters();
}

function page(delta) {
  const next = offset.value + delta * LIMIT;
  if (next < 0) return;
  offset.value = next;
  load();
}

watch(autoRefresh, (on) => {
  clearInterval(timer);
  // 자동 새로고침은 조용히(로딩 표시 없이) 돌려 표가 깜빡이지 않게 한다
  if (on) timer = setInterval(() => load({ silent: true }), REFRESH_MS);
});

onMounted(async () => {
  try {
    services.value = await api.fetchLogServices();
  } catch {
    services.value = ["auth"]; // 목록 조회 실패해도 로그 자체는 볼 수 있게 한다
  }
  load();
});

onUnmounted(() => clearInterval(timer));

// 상세는 JSON 문자열이거나 평문이다. 파싱되면 보기 좋게 들여쓴다.
function prettyDetail(value) {
  if (!value) return "";
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return String(value);
  }
}

function summarize(value) {
  if (!value) return "";
  const text = String(value).replace(/\s+/g, " ");
  return text.length > 70 ? `${text.slice(0, 70)}…` : text;
}
</script>

<template>
  <div class="page-head">
    <h1 class="page-title">시스템 로그</h1>
    <div class="row-wrap">
      <label class="row auto-toggle">
        <span class="switch">
          <input v-model="autoRefresh" type="checkbox">
          <span class="switch-track"></span>
        </span>
        <span class="dim">자동 새로고침</span>
      </label>
      <button class="btn btn-sm" type="button" :disabled="loading" @click="load()">
        <AppIcon name="refresh" /><span>새로고침</span>
      </button>
    </div>
  </div>

  <section class="panel filter-panel">
    <div class="panel-body stack">
      <div class="filter-row">
        <div class="field">
          <span class="field-label">서비스</span>
          <div class="checks">
            <label v-for="s in services" :key="s" class="check">
              <input v-model="selServices" type="checkbox" :value="s">
              <span class="mono">{{ s }}</span>
            </label>
          </div>
        </div>
        <div class="field">
          <span class="field-label">레벨</span>
          <div class="checks">
            <label v-for="l in LEVELS" :key="l.value" class="check">
              <input v-model="selLevels" type="checkbox" :value="l.value">
              <span>{{ l.label }}</span>
            </label>
          </div>
        </div>
      </div>

      <div class="filter-row">
        <div class="field">
          <label class="field-label" for="f-action">액션 (접두사)</label>
          <input id="f-action" v-model="filters.action" class="input input-mono" placeholder="user." @keyup.enter="applyFilters">
        </div>
        <div class="field">
          <label class="field-label" for="f-actor">행위자</label>
          <input id="f-actor" v-model="filters.actor" class="input" placeholder="이메일 또는 이름" @keyup.enter="applyFilters">
        </div>
        <div class="field">
          <label class="field-label" for="f-search">검색 (액션·대상·상세)</label>
          <input id="f-search" v-model="filters.search" class="input" placeholder="키워드" @keyup.enter="applyFilters">
        </div>
        <div class="field">
          <label class="field-label" for="f-from">시작</label>
          <input id="f-from" v-model="filters.from" class="input input-mono" type="datetime-local">
        </div>
        <div class="field">
          <label class="field-label" for="f-to">종료</label>
          <input id="f-to" v-model="filters.to" class="input input-mono" type="datetime-local">
        </div>
        <div class="filter-actions">
          <button class="btn btn-primary" type="button" @click="applyFilters">적용</button>
          <button class="btn btn-ghost" type="button" :disabled="!hasFilters" @click="resetFilters">초기화</button>
        </div>
      </div>
    </div>
  </section>

  <section class="panel">
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>시각</th>
            <th>서비스</th>
            <th>레벨</th>
            <th>액션</th>
            <th>행위자</th>
            <th>대상</th>
            <th>상세</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="log in logs" :key="`${log._service}-${log.id}`" class="row-clickable" @click="detail = log">
            <td class="cell-mono nowrap dim">{{ formatLogTime(log.timestamp) }}</td>
            <td class="cell-mono nowrap">{{ log._service }}</td>
            <td><span :class="LEVEL_BADGE[log.level] || 'badge'">{{ LEVEL_LABEL[log.level] || log.level }}</span></td>
            <td class="cell-mono nowrap">{{ log.action }}</td>
            <td class="nowrap">
              <template v-if="log.actor_name || log.actor_email">
                {{ log.actor_name || log.actor_email }}
                <span v-if="log.actor_role" class="dim">· {{ log.actor_role }}</span>
              </template>
              <span v-else class="dim">시스템</span>
            </td>
            <td class="cell-mono nowrap">{{ log.target || "-" }}</td>
            <td class="detail-cell dim">{{ summarize(log.detail) }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-if="loading" class="empty">불러오는 중…</div>
    <div v-else-if="!logs.length" class="empty">
      <AppIcon name="logs" />
      <div>{{ hasFilters ? "조건에 맞는 로그가 없습니다." : "기록된 로그가 없습니다." }}</div>
    </div>

    <div v-if="logs.length" class="pager">
      <button class="btn btn-sm" type="button" :disabled="offset === 0 || loading" @click="page(-1)">이전</button>
      <span>{{ rangeLabel }}</span>
      <button class="btn btn-sm" type="button" :disabled="logs.length < LIMIT || loading" @click="page(1)">다음</button>
    </div>
  </section>

  <div v-if="detail" class="modal-backdrop" @click.self="detail = null">
    <div class="modal">
      <div class="modal-head">
        <span class="panel-title">{{ detail.action }}</span>
        <button class="btn btn-icon btn-sm" type="button" @click="detail = null"><AppIcon name="close" /></button>
      </div>
      <div class="modal-body stack">
        <dl class="kv">
          <dt>시각</dt><dd class="mono">{{ formatDate(detail.timestamp) }}</dd>
          <dt>서비스</dt><dd class="mono">{{ detail._service }}</dd>
          <dt>레벨</dt><dd><span :class="LEVEL_BADGE[detail.level] || 'badge'">{{ LEVEL_LABEL[detail.level] || detail.level }}</span></dd>
          <dt>행위자</dt>
          <dd>
            {{ detail.actor_name || "-" }}
            <span v-if="detail.actor_email" class="dim mono">{{ detail.actor_email }}</span>
            <span v-if="detail.actor_role" class="badge badge-muted">{{ detail.actor_role }}</span>
          </dd>
          <dt>대상</dt><dd class="mono">{{ detail.target || "-" }}</dd>
          <dt>IP</dt><dd class="mono">{{ detail.ip || "-" }}</dd>
        </dl>
        <div v-if="detail.detail" class="field">
          <span class="field-label">상세</span>
          <pre class="detail-json">{{ prettyDetail(detail.detail) }}</pre>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.filter-panel {
  margin-bottom: var(--spacing-md);
}

.filter-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: var(--spacing-sm) var(--spacing-md);
}

.filter-row .field {
  flex: 1 1 9rem;
}

.filter-actions {
  display: flex;
  gap: var(--spacing-sm);
  flex: none;
}

.checks {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 0.75rem;
  padding: 0.3rem 0;
}

.check {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8125rem;
  cursor: pointer;
}

.auto-toggle {
  cursor: pointer;
  font-size: 0.8125rem;
}

.detail-cell {
  max-width: 22rem;
  font-size: 0.8125rem;
}

.kv dd {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}
</style>
