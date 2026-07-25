<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import AppIcon from "@shared/AppIcon.vue";
import { useNotification } from "@shared/useNotification.js";
import { formatDate } from "@shared/format-date.js";
import * as api from "../api.js";

const { success, error } = useNotification();

const board = ref(null);   // { waiting, called, today, settings }
const busy = ref(false);
const loading = ref(true);

// 설정 입력값은 저장 버튼을 누를 때만 반영한다(스위치는 즉시 저장).
const rankInput = ref(0);
const eventNameInput = ref("");

async function load() {
  try {
    board.value = await api.fetchQueue();
    rankInput.value = board.value.settings.notify_rank;
    eventNameInput.value = board.value.settings.event_name;
  } catch (e) {
    error(e.message);
  } finally {
    loading.value = false;
  }
}

async function saveSettings(patch, message) {
  busy.value = true;
  try {
    const settings = await api.updateSettings(patch);
    board.value.settings = settings;
    rankInput.value = settings.notify_rank;
    eventNameInput.value = settings.event_name;
    success(message);
  } catch (e) {
    error(e.message);
    await load(); // 서버가 거부했으므로 화면 상태를 실제 값으로 되돌린다
  } finally {
    busy.value = false;
  }
}

async function act(fn, row, message, { confirmText } = {}) {
  if (confirmText && !confirm(confirmText)) return;
  busy.value = true;
  try {
    await fn(row.id);
    success(message);
    await load();
  } catch (e) {
    error(e.message);
    await load();
  } finally {
    busy.value = false;
  }
}

const callRow = (row) => act(api.callRegistration, row, `엔트리 ${row.num}번을 호출했습니다.`);
const doneRow = (row) => act(api.doneRegistration, row, `엔트리 ${row.num}번 등록을 완료했습니다.`);
const cancelRow = (row) => act(api.cancelRegistration, row, `엔트리 ${row.num}번 대기를 취소했습니다.`,
  { confirmText: `엔트리 ${row.num}번 (${row.name || "이름 미등록"}) 대기를 취소할까요?` });

let timer = null;

onMounted(() => {
  load();
  timer = setInterval(load, 10000);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="page-head">
    <div>
      <h1 class="page-title">대기열 관리</h1>
      <p class="page-desc">호출하면 해당 팀에게 문자가 발송됩니다. 등록을 마치면 완료 처리해 주세요.</p>
    </div>
    <div v-if="board" class="row-wrap stats">
      <span class="badge badge-accent">대기 {{ board.waiting.length }}</span>
      <span class="badge">호출 {{ board.called.length }}</span>
      <span class="badge badge-ok">오늘 완료 {{ board.today.done }}</span>
      <span v-if="board.today.canceled" class="badge badge-muted">취소 {{ board.today.canceled }}</span>
    </div>
  </div>

  <template v-if="board">
    <!-- 설정 -->
    <section class="panel settings-panel">
      <div class="panel-head">
        <span class="panel-title">설정</span>
        <span v-if="!board.settings.sms_available" class="badge badge-warn">
          SMS 발송 설정 없음 — 서버에 Naver Cloud credential이 필요합니다
        </span>
      </div>
      <div class="panel-body settings-body">
        <label class="setting-item">
          <span class="setting-label">대기 접수</span>
          <span class="switch">
            <input
              type="checkbox" :checked="board.settings.open" :disabled="busy"
              @change="saveSettings({ open: $event.target.checked }, $event.target.checked ? '대기 접수를 열었습니다.' : '대기 접수를 마감했습니다.')"
            >
            <span class="switch-track"></span>
          </span>
        </label>

        <label class="setting-item">
          <span class="setting-label">SMS 알림</span>
          <span class="switch">
            <input
              type="checkbox" :checked="board.settings.sms" :disabled="busy || !board.settings.sms_available"
              @change="saveSettings({ sms: $event.target.checked }, $event.target.checked ? 'SMS 알림을 켰습니다.' : 'SMS 알림을 껐습니다.')"
            >
            <span class="switch-track"></span>
          </span>
        </label>

        <div class="setting-item">
          <label class="setting-label" for="notify-rank">사전 안내 순번</label>
          <div class="row-wrap">
            <input
              id="notify-rank" v-model.number="rankInput" class="input input-rank"
              type="number" min="0" max="20"
            >
            <button
              class="btn btn-sm" type="button" :disabled="busy || rankInput === board.settings.notify_rank"
              @click="saveSettings({ notify_rank: rankInput }, '사전 안내 순번을 저장했습니다.')"
            >저장</button>
          </div>
          <span class="dim">대기 N번째가 되면 미리 문자를 보냅니다. 0이면 보내지 않습니다.</span>
        </div>

        <div class="setting-item">
          <label class="setting-label" for="event-name">문자 앞머리 (대회명)</label>
          <div class="row-wrap">
            <input id="event-name" v-model="eventNameInput" class="input input-event" type="text" maxlength="30">
            <button
              class="btn btn-sm" type="button" :disabled="busy || eventNameInput === board.settings.event_name"
              @click="saveSettings({ event_name: eventNameInput }, '대회명을 저장했습니다.')"
            >저장</button>
          </div>
          <span class="dim">문자가 "[{{ eventNameInput || "…" }}] 엔트리 3번 차례입니다." 형태로 발송됩니다.</span>
        </div>
      </div>
    </section>

    <!-- 호출됨 -->
    <section v-if="board.called.length" class="panel called-panel">
      <div class="panel-head">
        <span class="panel-title">호출됨</span>
        <span class="dim">아직 데스크에 오지 않은 팀입니다</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>엔트리</th><th>팀명</th><th>전화번호</th><th>호출 시각</th><th class="text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in board.called" :key="row.id">
              <td class="cell-mono">{{ row.num }}</td>
              <td>
                {{ row.name || "이름 미등록" }}
                <span v-if="row.affiliation" class="dim"> · {{ row.affiliation }}</span>
              </td>
              <td class="cell-mono">{{ row.phone }}</td>
              <td class="cell-mono nowrap dim">{{ formatDate(row.called_at) }}</td>
              <td class="text-right actions">
                <button class="btn btn-sm btn-primary" type="button" :disabled="busy" @click="doneRow(row)">
                  <AppIcon name="check" /><span>완료</span>
                </button>
                <button class="btn btn-sm" type="button" :disabled="busy" @click="cancelRow(row)">부재</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- 대기열 -->
    <section class="panel">
      <div class="panel-head">
        <span class="panel-title">대기열</span>
        <button class="btn btn-icon" type="button" title="새로고침" @click="load">
          <AppIcon name="refresh" />
        </button>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th class="col-rank">순번</th><th>엔트리</th><th>팀명</th><th>전화번호</th>
              <th>등록 시각</th><th>사전 안내</th><th class="text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in board.waiting" :key="row.id">
              <td class="cell-mono rank-cell">{{ row.position }}</td>
              <td class="cell-mono">{{ row.num }}</td>
              <td>
                {{ row.name || "이름 미등록" }}
                <span v-if="row.affiliation" class="dim"> · {{ row.affiliation }}</span>
              </td>
              <td class="cell-mono">{{ row.phone }}</td>
              <td class="cell-mono nowrap dim">{{ formatDate(row.registered_at) }}</td>
              <td>
                <span v-if="row.notified" class="badge badge-ok">발송됨</span>
                <span v-else class="dim">-</span>
              </td>
              <td class="text-right actions">
                <button class="btn btn-sm btn-primary" type="button" :disabled="busy" @click="callRow(row)">
                  <AppIcon name="notice" /><span>호출</span>
                </button>
                <button class="btn btn-sm" type="button" :disabled="busy" @click="doneRow(row)">완료</button>
                <button class="btn btn-icon btn-sm" type="button" title="취소" :disabled="busy" @click="cancelRow(row)">
                  <AppIcon name="close" />
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div v-if="!board.waiting.length" class="empty">
        <AppIcon name="queue" />
        <div>대기 중인 팀이 없습니다.</div>
      </div>
    </section>
  </template>

  <div v-else-if="loading" class="panel empty">불러오는 중…</div>
</template>

<style scoped>
.stats {
  gap: 0.35rem;
}

.settings-panel {
  margin-bottom: var(--spacing-md);
}

.settings-body {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-lg);
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  min-width: 10rem;
}

.setting-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
}

.setting-item .dim {
  max-width: 16rem;
  font-size: 0.75rem;
  line-height: 1.5;
}

.input-rank {
  width: 5rem;
}

.input-event {
  width: 13rem;
}

.called-panel {
  margin-bottom: var(--spacing-md);
  border-color: var(--accent-primary);
}

.col-rank {
  width: 3.5rem;
}

.rank-cell {
  font-weight: 600;
}

.actions {
  white-space: nowrap;
}

.actions .btn + .btn {
  margin-left: 0.3rem;
}
</style>
