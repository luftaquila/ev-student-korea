<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import AppIcon from "@shared/AppIcon.vue";
import { useNotification } from "@shared/useNotification.js";
import { formatDate } from "@shared/format-date.js";
import { displayPhone } from "@shared/format-phone.js";
import * as api from "../api.js";

const { success, error } = useNotification();

const board = ref(null);   // { waiting, called, today, settings }
const busy = ref(false);
const loading = ref(true);

// 사전 안내 순번은 저장 버튼을 누를 때만 반영한다(스위치는 즉시 저장).
const rankInput = ref(0);

async function load() {
  try {
    board.value = await api.fetchQueue();
    rankInput.value = board.value.settings.notify_rank;
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
  { confirmText: `엔트리 ${row.num}번 (${row.team || "팀 미등록"}) 대기를 취소할까요?` });

let timer = null;

onMounted(() => {
  load();
  timer = setInterval(load, 10000);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="page-head">
    <h1 class="page-title">대기열 관리</h1>
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
        <span v-if="!board.settings.sms_available" class="badge badge-warn">SMS 미설정</span>
      </div>
      <div class="panel-body settings-body">
        <label class="setting-item">
          <span class="setting-label">대기 접수</span>
          <span class="setting-control">
            <span class="switch">
              <input
                type="checkbox" :checked="board.settings.open" :disabled="busy"
                @change="saveSettings({ open: $event.target.checked }, $event.target.checked ? '대기 접수를 열었습니다.' : '대기 접수를 마감했습니다.')"
              >
              <span class="switch-track"></span>
            </span>
          </span>
        </label>

        <label class="setting-item">
          <span class="setting-label">SMS 알림</span>
          <span class="setting-control">
            <span class="switch">
              <input
                type="checkbox" :checked="board.settings.sms" :disabled="busy || !board.settings.sms_available"
                @change="saveSettings({ sms: $event.target.checked }, $event.target.checked ? 'SMS 알림을 켰습니다.' : 'SMS 알림을 껐습니다.')"
              >
              <span class="switch-track"></span>
            </span>
          </span>
        </label>

        <div class="setting-item">
          <label class="setting-label" for="notify-rank">사전 안내 순번 (0 = 끔)</label>
          <div class="setting-control row-wrap">
            <input
              id="notify-rank" v-model.number="rankInput" class="input input-rank"
              type="number" min="0" max="20"
            >
            <button
              class="btn btn-sm" type="button" :disabled="busy || rankInput === board.settings.notify_rank"
              @click="saveSettings({ notify_rank: rankInput }, '사전 안내 순번을 저장했습니다.')"
            >저장</button>
          </div>
        </div>
      </div>
    </section>

    <!-- 호출됨 -->
    <section v-if="board.called.length" class="panel called-panel">
      <div class="panel-head">
        <span class="panel-title">호출됨</span>
      </div>
      <div class="table-wrap">
        <table class="data-table">
          <thead>
            <tr>
              <th>엔트리</th><th>학교</th><th>팀</th><th>전화번호</th><th>호출 시각</th><th class="text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in board.called" :key="row.id">
              <td class="cell-mono">{{ row.num }}</td>
              <td>{{ row.school || "-" }}</td>
              <td>{{ row.team || "팀 미등록" }}</td>
              <td class="cell-mono"><a :href="`tel:${row.phone}`">{{ displayPhone(row.phone) }}</a></td>
              <td class="cell-mono nowrap dim">{{ formatDate(row.called_at) }}</td>
              <!-- 버튼은 래퍼 안에서 flex로 정렬한다. td에 직접 display:flex를 걸면
                   셀이 테이블 레이아웃에서 빠져나와 행 높이·보더가 어긋난다. -->
              <td>
                <div class="actions">
                  <button class="btn btn-sm btn-primary" type="button" :disabled="busy" @click="doneRow(row)">
                    <AppIcon name="check" /><span>완료</span>
                  </button>
                  <button class="btn btn-sm" type="button" :disabled="busy" @click="cancelRow(row)">부재</button>
                </div>
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
              <th class="col-rank">순번</th><th>엔트리</th><th>학교</th><th>팀</th><th>전화번호</th>
              <th>등록 시각</th><th>사전 안내</th><th class="text-right"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in board.waiting" :key="row.id">
              <td class="cell-mono rank-cell">{{ row.position }}</td>
              <td class="cell-mono">{{ row.num }}</td>
              <td>{{ row.school || "-" }}</td>
              <td>{{ row.team || "팀 미등록" }}</td>
              <td class="cell-mono"><a :href="`tel:${row.phone}`">{{ displayPhone(row.phone) }}</a></td>
              <td class="cell-mono nowrap dim">{{ formatDate(row.registered_at) }}</td>
              <td>
                <span v-if="row.notified === 1" class="badge badge-ok">발송됨</span>
                <span v-else-if="row.notified === 2" class="badge badge-muted">발송 중</span>
                <span v-else class="dim">-</span>
              </td>
              <td>
                <div class="actions">
                  <button class="btn btn-sm btn-primary" type="button" :disabled="busy" @click="callRow(row)">
                    <AppIcon name="notice" /><span>호출</span>
                  </button>
                  <button class="btn btn-sm" type="button" :disabled="busy" @click="doneRow(row)">완료</button>
                  <button class="btn btn-icon btn-sm" type="button" title="취소" :disabled="busy" @click="cancelRow(row)">
                    <AppIcon name="close" />
                  </button>
                </div>
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
  gap: var(--spacing-md) var(--spacing-xl);
  align-items: flex-start;
}

.setting-item {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.setting-label {
  font-size: 0.8125rem;
  font-weight: 600;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* 스위치는 20px, 숫자 입력은 34px다. 컨트롤을 같은 높이 띠에 넣고 세로 중앙에 두어
   항목끼리 중심선이 맞게 한다(그러지 않으면 스위치가 7px 위로 떠 보인다). */
.setting-control {
  display: flex;
  align-items: center;
  min-height: 2.125rem;
}

.input-rank {
  width: 4.5rem;
}

.called-panel {
  margin-bottom: var(--spacing-md);
  border-color: var(--accent-primary);
}

/* 좁은 화면에서 표를 컨테이너 폭에 억지로 맞추면 한글 셀이 한 글자씩 세로로 끊긴다.
   셀은 nowrap으로 두고 넘치는 폭은 .table-wrap의 가로 스크롤에 맡긴다. */
.data-table th,
.data-table td {
  white-space: nowrap;
}

.col-rank {
  width: 3.5rem;
}

.rank-cell {
  font-weight: 600;
}

/* 아이콘이 있는 버튼과 없는 버튼을 나란히 두면 baseline 정렬 탓에 높이가 어긋난다 */
.actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.35rem;
}

/* .btn-icon의 패딩이 .btn-sm을 덮어써 같은 행에서 3px 더 커진다 — 행 안에서는 맞춘다 */
.actions .btn-icon {
  padding: 0.35rem;
}
</style>
