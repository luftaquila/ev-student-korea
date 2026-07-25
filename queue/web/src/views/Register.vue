<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import AppIcon from "@shared/AppIcon.vue";
import * as api from "../api.js";

// 오피셜이 등록 데스크 태블릿에 띄워두는 화면. 학생이 직접 조작하므로
// 단계를 하나씩 밟는 큰 UI로 만들고, 완료 후에는 자동으로 처음 화면으로 돌아간다.

const step = ref("num");        // num → confirm → done
const num = ref("");
const phone = ref("");
const entry = ref(null);        // 확인된 엔트리 { num, name, affiliation, queue_status }
const doneInfo = ref(null);     // 등록 결과 { position, waiting_total }
const errorMsg = ref("");
const busy = ref(false);
const status = ref(null);       // { open, waiting }
const countdown = ref(0);

let statusTimer = null;
let resetTimer = null;
let countdownTimer = null;

async function loadStatus() {
  try {
    status.value = await api.fetchStatus();
  } catch { /* 다음 주기에 재시도 */ }
}

function reset() {
  clearTimeout(resetTimer);
  clearInterval(countdownTimer);
  step.value = "num";
  num.value = "";
  phone.value = "";
  entry.value = null;
  doneInfo.value = null;
  errorMsg.value = "";
  countdown.value = 0;
}

async function confirmEntry() {
  const value = String(num.value).trim();
  if (!value) return;
  busy.value = true;
  errorMsg.value = "";
  try {
    const found = await api.fetchEntry(value);
    if (found.queue_status) {
      errorMsg.value = found.queue_status === "called"
        ? `엔트리 ${found.num}번은 이미 호출되었습니다. 등록 데스크에 문의해 주세요.`
        : `엔트리 ${found.num}번은 이미 대기 중입니다.`;
      return;
    }
    entry.value = found;
    step.value = "confirm";
  } catch (e) {
    errorMsg.value = e.message;
  } finally {
    busy.value = false;
  }
}

async function submit() {
  busy.value = true;
  errorMsg.value = "";
  try {
    doneInfo.value = await api.registerQueue({ num: entry.value.num, phone: phone.value });
    step.value = "done";
    loadStatus();

    // 다음 학생을 위해 잠시 후 자동 초기화
    countdown.value = 8;
    countdownTimer = setInterval(() => { countdown.value -= 1; }, 1000);
    resetTimer = setTimeout(reset, 8000);
  } catch (e) {
    errorMsg.value = e.message;
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  loadStatus();
  statusTimer = setInterval(loadStatus, 10000);
});

onUnmounted(() => {
  clearInterval(statusTimer);
  clearTimeout(resetTimer);
  clearInterval(countdownTimer);
});
</script>

<template>
  <div class="kiosk">
    <div class="kiosk-status">
      <span v-if="status" class="badge" :class="status.open ? 'badge-ok' : 'badge-danger'">
        {{ status.open ? "접수 중" : "접수 마감" }}
      </span>
      <span v-if="status" class="dim">현재 대기 {{ status.waiting }}팀</span>
    </div>

    <!-- 접수 마감 -->
    <div v-if="status && !status.open" class="panel kiosk-card">
      <AppIcon name="alert" class="kiosk-icon warn" />
      <h1 class="kiosk-title">지금은 대기 접수를 받지 않습니다</h1>
      <p class="muted">접수는 대기열 관리 화면에서 열 수 있습니다.</p>
    </div>

    <!-- 1단계: 엔트리 번호 -->
    <form v-else-if="step === 'num'" class="panel kiosk-card" @submit.prevent="confirmEntry">
      <h1 class="kiosk-title">등록 대기 신청</h1>
      <p class="kiosk-desc">엔트리 번호를 입력해 주세요.</p>
      <input
        v-model="num" class="input kiosk-input" type="text" inputmode="numeric"
        placeholder="엔트리 번호" autocomplete="off" autofocus
      >
      <p v-if="errorMsg" class="kiosk-error">{{ errorMsg }}</p>
      <button class="btn btn-primary kiosk-btn" type="submit" :disabled="busy || !num.trim()">다음</button>
    </form>

    <!-- 2단계: 팀 확인 + 전화번호 -->
    <form v-else-if="step === 'confirm'" class="panel kiosk-card" @submit.prevent="submit">
      <div class="kiosk-team">
        <span class="badge badge-muted">엔트리 {{ entry.num }}</span>
        <span class="kiosk-team-name">{{ entry.name }}</span>
        <span v-if="entry.affiliation" class="dim">{{ entry.affiliation }}</span>
      </div>
      <p class="kiosk-desc">
        순서가 다가오면 문자로 알려드립니다.<br>연락받을 휴대전화 번호를 입력해 주세요.
      </p>
      <input
        v-model="phone" class="input kiosk-input input-mono" type="tel"
        placeholder="010-0000-0000" autocomplete="off" autofocus
      >
      <p v-if="errorMsg" class="kiosk-error">{{ errorMsg }}</p>
      <div class="kiosk-actions">
        <button class="btn btn-ghost kiosk-btn" type="button" @click="reset">처음으로</button>
        <button class="btn btn-primary kiosk-btn" type="submit" :disabled="busy || !phone.trim()">대기 등록</button>
      </div>
    </form>

    <!-- 3단계: 완료 -->
    <div v-else class="panel kiosk-card">
      <AppIcon name="check" class="kiosk-icon ok" />
      <h1 class="kiosk-title">대기 등록 완료</h1>
      <div class="kiosk-rank">
        <span class="kiosk-rank-num">{{ doneInfo.position }}</span>
        <span class="kiosk-rank-unit">번째</span>
      </div>
      <p class="kiosk-desc">
        엔트리 {{ doneInfo.num }}번 · {{ doneInfo.name }}<br>
        순서가 되면 문자로 알려드립니다.
      </p>
      <button class="btn btn-ghost kiosk-btn" type="button" @click="reset">
        처음으로 ({{ countdown }})
      </button>
    </div>
  </div>
</template>

<style scoped>
.kiosk {
  max-width: 480px;
  margin: 0 auto;
}

.kiosk-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  margin-bottom: var(--spacing-md);
  font-size: 0.875rem;
}

.kiosk-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-md);
  padding: var(--spacing-2xl) var(--spacing-xl);
  text-align: center;
}

.kiosk-title {
  font-size: 1.375rem;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.kiosk-desc {
  color: var(--text-secondary);
  line-height: 1.6;
}

.kiosk-input {
  width: 100%;
  max-width: 300px;
  padding: 0.8rem 1rem;
  font-size: 1.25rem;
  text-align: center;
}

.kiosk-btn {
  min-width: 9rem;
  padding: 0.7rem 1.5rem;
  font-size: 1rem;
}

.kiosk-actions {
  display: flex;
  gap: 0.6rem;
}

.kiosk-error {
  color: var(--accent-danger);
  font-size: 0.875rem;
}

.kiosk-icon {
  width: 40px;
  height: 40px;
}

.kiosk-icon.ok {
  color: var(--accent-success);
}

.kiosk-icon.warn {
  color: var(--accent-warning);
}

.kiosk-team {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.35rem;
}

.kiosk-team-name {
  font-size: 1.25rem;
  font-weight: 700;
}

.kiosk-rank {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
}

.kiosk-rank-num {
  font-size: 4.5rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--accent-primary);
  font-variant-numeric: tabular-nums;
}

.kiosk-rank-unit {
  font-size: 1.375rem;
  color: var(--text-secondary);
}
</style>
