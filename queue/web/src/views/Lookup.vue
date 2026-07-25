<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import AppIcon from "@shared/AppIcon.vue";
import { formatDate } from "@shared/format-date.js";
import * as api from "../api.js";

// 조회 정보를 저장해 두면 학생이 다시 들어왔을 때 바로 자기 순서가 보인다
const STORAGE_KEY = "ev_queue_lookup";

const status = ref(null);        // 공개 현황 { open, waiting, called }
const form = ref({ num: "", phone: "" });
const result = ref(null);        // 조회 결과
const notFound = ref(false);     // 조회했지만 대기 내역이 없는 상태
const errorMsg = ref("");
const busy = ref(false);

const aheadCount = computed(() => (result.value?.position ? result.value.position - 1 : 0));

async function loadStatus() {
  try {
    status.value = await api.fetchStatus();
  } catch { /* 일시 장애 — 다음 주기에 다시 시도한다 */ }
}

async function doLookup({ silent = false } = {}) {
  const num = String(form.value.num).trim();
  const phone = String(form.value.phone).trim();
  if (!num || !phone) {
    if (!silent) errorMsg.value = "엔트리 번호와 전화번호를 입력해 주세요.";
    return;
  }

  busy.value = !silent;
  errorMsg.value = "";
  if (!silent) notFound.value = false;
  try {
    result.value = await api.lookup({ num, phone });
    notFound.value = false;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ num, phone }));
  } catch (e) {
    result.value = null;
    // 자동 갱신 중 404는 방금 완료·취소 처리됐다는 뜻이다 — 결과를 지우고 안내로 바꾼다.
    // 직접 조회한 실패는 서버 메시지를 그대로 보여준다(잘못된 번호 입력 등).
    if (silent) notFound.value = true;
    else errorMsg.value = e.message;
  } finally {
    busy.value = false;
  }
}

let timer = null;

onMounted(() => {
  loadStatus();

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.num && saved?.phone) {
      form.value = { num: saved.num, phone: saved.phone };
      doLookup({ silent: true });
    }
  } catch { /* 저장값 손상 — 무시 */ }

  // 대기 순서는 계속 움직이므로 화면을 열어둔 학생에게 15초마다 갱신해 준다
  timer = setInterval(() => {
    loadStatus();
    if (result.value) doLookup({ silent: true });
  }, 15000);
});

onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="page-head">
    <div>
      <h1 class="page-title">등록 대기 현황</h1>
      <p class="page-desc">엔트리 번호와 대기 등록 시 입력한 전화번호로 내 순서를 확인할 수 있습니다.</p>
    </div>
  </div>

  <!-- 전체 현황 -->
  <section v-if="status" class="panel overview">
    <div class="overview-stat">
      <span class="overview-num">{{ status.waiting }}</span>
      <span class="overview-label">현재 대기</span>
    </div>
    <div class="overview-side">
      <span class="badge" :class="status.open ? 'badge-ok' : 'badge-danger'">
        {{ status.open ? "접수 중" : "접수 마감" }}
      </span>
      <div v-if="status.called.length" class="called-chips">
        <span class="dim">호출됨</span>
        <span v-for="c in status.called" :key="c.num" class="badge badge-accent">{{ c.num }}번</span>
      </div>
    </div>
  </section>

  <!-- 내 순서 조회 -->
  <section class="panel">
    <div class="panel-head">
      <span class="panel-title">내 순서 조회</span>
    </div>
    <form class="panel-body toolbar" @submit.prevent="doLookup()">
      <div class="field">
        <label class="field-label" for="lookup-num">엔트리 번호</label>
        <input
          id="lookup-num" v-model="form.num" class="input" type="text"
          inputmode="numeric" placeholder="예: 12" autocomplete="off"
        >
      </div>
      <div class="field grow">
        <label class="field-label" for="lookup-phone">전화번호</label>
        <input
          id="lookup-phone" v-model="form.phone" class="input input-mono" type="tel"
          placeholder="010-0000-0000" autocomplete="off"
        >
      </div>
      <button class="btn btn-primary" type="submit" :disabled="busy">
        <AppIcon name="search" /><span>조회</span>
      </button>
    </form>
    <p v-if="errorMsg" class="lookup-error">{{ errorMsg }}</p>
  </section>

  <!-- 조회 결과 -->
  <section v-if="result" class="panel result" :class="{ 'result-called': result.status === 'called' }">
    <div class="result-team">
      <span class="badge badge-muted">엔트리 {{ result.num }}</span>
      <span class="team-name">{{ result.name || "이름 미등록" }}</span>
      <span v-if="result.affiliation" class="dim">{{ result.affiliation }}</span>
    </div>

    <template v-if="result.status === 'waiting'">
      <div class="result-rank">
        <span class="rank-num">{{ result.position }}</span>
        <span class="rank-unit">번째</span>
      </div>
      <p class="result-note">
        {{ aheadCount > 0 ? `앞에 ${aheadCount}팀이 기다리고 있습니다.` : "다음 차례입니다. 등록 데스크 근처에서 기다려 주세요." }}
      </p>
      <p class="dim">전체 대기 {{ result.waiting_total }}팀 · 등록 {{ formatDate(result.registered_at) }}</p>
    </template>

    <template v-else>
      <div class="result-rank called-text">
        <AppIcon name="notice" />
        <span>호출되었습니다</span>
      </div>
      <p class="result-note">지금 등록 데스크로 와주세요.</p>
      <p class="dim">호출 {{ formatDate(result.called_at) }}</p>
    </template>
  </section>

  <section v-else-if="notFound" class="panel empty">
    <AppIcon name="check" />
    <div>대기 중인 내역이 없습니다. 등록이 완료되었거나 취소된 경우입니다.</div>
  </section>
</template>

<style scoped>
.overview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-md);
  padding: var(--spacing-md) var(--spacing-lg);
  margin-bottom: var(--spacing-md);
}

.overview-stat {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
}

.overview-num {
  font-size: 2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
}

.overview-label {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.overview-side {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.4rem;
}

.called-chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.8125rem;
}

.field {
  flex: 1 1 8rem;
}

.field.grow {
  flex: 2 1 12rem;
}

.toolbar .btn {
  flex: none;
}

.lookup-error {
  padding: 0 var(--spacing-md) var(--spacing-md);
  color: var(--accent-danger);
  font-size: 0.8125rem;
}

.result {
  margin-top: var(--spacing-md);
  padding: var(--spacing-xl) var(--spacing-lg);
  text-align: center;
}

.result-called {
  border-color: var(--accent-primary);
}

.result-team {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: var(--spacing-md);
}

.team-name {
  font-weight: 600;
}

.result-rank {
  display: flex;
  align-items: baseline;
  justify-content: center;
  gap: 0.3rem;
}

.rank-num {
  font-size: 4rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--accent-primary);
  font-variant-numeric: tabular-nums;
}

.rank-unit {
  font-size: 1.25rem;
  color: var(--text-secondary);
}

.called-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1.75rem;
  font-weight: 700;
  color: var(--accent-primary);
}

.called-text .icon {
  width: 28px;
  height: 28px;
}

.result-note {
  margin-top: var(--spacing-sm);
  font-size: 1rem;
}

.result .dim {
  margin-top: var(--spacing-xs);
  font-size: 0.8125rem;
}

.empty {
  margin-top: var(--spacing-md);
}
</style>
