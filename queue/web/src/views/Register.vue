<script setup>
import { ref, watch, onMounted, onUnmounted } from "vue";
import AppIcon from "@shared/AppIcon.vue";
import { formatPhone, isMobilePhone } from "@shared/format-phone.js";
import * as api from "../api.js";

// 오피셜이 등록 데스크 태블릿에 띄워두는 화면. 엔트리 번호와 전화번호를 한 화면에서 받고,
// 번호를 입력하는 즉시 해당 엔트리의 학교·팀을 확인시켜 준다(오입력 방지).

const num = ref("");
const phone = ref("010");       // 태블릿 입력을 줄이기 위해 접두사를 미리 채운다
const agreed = ref(false);      // 개인정보 수집·이용 동의 (없으면 등록 불가)
const entry = ref(null);        // 확인된 엔트리 { num, school, team, queue_status }
const entryError = ref("");     // 번호 조회 실패 메시지
const checking = ref(false);
const submitError = ref("");
const busy = ref(false);
const done = ref(null);         // 등록 결과 { num, school, team, position }
const status = ref(null);       // { open, waiting }
const countdown = ref(0);

let statusTimer = null;
let resetTimer = null;
let countdownTimer = null;
let lookupTimer = null;
let lookupSeq = 0;              // 늦게 도착한 응답이 최신 입력을 덮어쓰지 않게 한다

async function loadStatus() {
  try {
    status.value = await api.fetchStatus();
  } catch { /* 다음 주기에 재시도 */ }
}

function onPhoneInput(e) {
  phone.value = formatPhone(e.target.value);
  submitError.value = "";
}

// 입력을 고치면 직전 오류 문구는 지운다 — 동의를 눌렀는데 "동의하세요"가 남아 있으면 안 된다
function toggleAgreed() {
  agreed.value = !agreed.value;
  submitError.value = "";
}

// 번호 입력이 멈추면(250ms) 엔트리를 조회한다
watch(num, (value) => {
  clearTimeout(lookupTimer);
  const seq = ++lookupSeq;
  entry.value = null;
  entryError.value = "";
  submitError.value = "";

  const trimmed = String(value).trim();
  if (!trimmed) { checking.value = false; return; }

  checking.value = true;
  lookupTimer = setTimeout(async () => {
    try {
      const found = await api.fetchEntry(trimmed);
      if (seq !== lookupSeq) return;
      entry.value = found;
    } catch (e) {
      if (seq !== lookupSeq) return;
      entryError.value = e.message;
    } finally {
      if (seq === lookupSeq) checking.value = false;
    }
  }, 250);
});

function reset() {
  clearTimeout(resetTimer);
  clearInterval(countdownTimer);
  clearTimeout(lookupTimer);
  lookupSeq++;
  num.value = "";
  phone.value = "010";
  agreed.value = false;
  entry.value = null;
  entryError.value = "";
  submitError.value = "";
  checking.value = false;
  done.value = null;
  countdown.value = 0;
}

async function submit() {
  if (busy.value) return;

  // 검증 순서는 화면 위에서 아래로 — 어디를 고쳐야 하는지 바로 보이게 한다
  if (!entry.value) {
    submitError.value = entryError.value || "엔트리 번호를 입력하세요.";
    return;
  }
  if (entry.value.queue_status) {
    submitError.value = entry.value.queue_status === "called"
      ? "이미 호출된 엔트리입니다. 등록 데스크에 문의하세요."
      : "이미 대기 중인 엔트리입니다.";
    return;
  }
  if (!isMobilePhone(phone.value)) {
    submitError.value = "전화번호를 정확히 입력하세요.";
    return;
  }
  if (!agreed.value) {
    submitError.value = "개인정보 수집 및 이용에 동의하세요.";
    return;
  }

  busy.value = true;
  submitError.value = "";
  try {
    done.value = await api.registerQueue({ num: entry.value.num, phone: phone.value });
    loadStatus();

    // 다음 학생을 위해 잠시 후 자동 초기화
    countdown.value = 8;
    countdownTimer = setInterval(() => { countdown.value -= 1; }, 1000);
    resetTimer = setTimeout(reset, 8000);
  } catch (e) {
    submitError.value = e.message;
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
  clearTimeout(lookupTimer);
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
    <div v-if="status && !status.open" class="panel card">
      <AppIcon name="alert" class="card-icon warn" />
      <h1 class="card-title">지금은 대기 접수를 받지 않습니다</h1>
      <p class="muted">접수는 대기열 관리 화면에서 열 수 있습니다.</p>
    </div>

    <!-- 완료 -->
    <div v-else-if="done" class="panel card">
      <AppIcon name="check" class="card-icon ok" />
      <h1 class="card-title">대기 등록 완료</h1>
      <div class="rank">
        <span class="rank-num">{{ done.position }}</span>
        <span class="rank-unit">번째</span>
      </div>
      <p class="card-desc">
        엔트리 {{ done.num }}번 · {{ done.team }}<br>
        순서가 되면 문자로 알려드립니다.
      </p>
      <button class="btn btn-ghost big-btn" type="button" @click="reset">
        처음으로 ({{ countdown }})
      </button>
    </div>

    <!-- 등록 폼 -->
    <form v-else class="panel card" @submit.prevent="submit">
      <h1 class="card-title">등록 대기 신청</h1>

      <!-- 번호와 그 확인 결과는 한 덩어리다 — 결과가 입력 바로 아래 붙어야 읽힌다 -->
      <div class="num-group">
        <div class="field">
          <label class="field-label" for="reg-num">엔트리 번호</label>
          <input
            id="reg-num" v-model="num" class="input big-input" type="text"
            inputmode="numeric" maxlength="4" autocomplete="off" autofocus
          >
        </div>

        <div v-if="entry" class="entry-found" :class="{ busy: !!entry.queue_status }">
          <AppIcon :name="entry.queue_status ? 'alert' : 'check'" />
          <span class="entry-text">
            <span class="entry-school">{{ entry.school }}</span>
            <span class="entry-team">{{ entry.team }}</span>
          </span>
          <span v-if="entry.queue_status" class="badge badge-warn">
            {{ entry.queue_status === "called" ? "이미 호출됨" : "이미 대기 중" }}
          </span>
        </div>
        <p v-else-if="checking" class="entry-hint dim">확인 중…</p>
        <p v-else-if="entryError" class="entry-hint error">{{ entryError }}</p>
      </div>

      <div class="field">
        <label class="field-label" for="reg-phone">전화번호</label>
        <!-- 입력 중 하이픈을 자동으로 넣는다(formatPhone). v-model이면 커서가 튀므로
             :value + @input으로 제어한다. maxlength는 "010-1234-5678" 13자 기준. -->
        <input
          id="reg-phone" class="input big-input input-mono" type="tel"
          inputmode="numeric" maxlength="13"
          placeholder="010-0000-0000" autocomplete="off"
          :value="phone" @input="onPhoneInput"
        >
      </div>

      <!-- 개인정보 수집·이용 동의. 태블릿에서 누르기 쉽도록 영역 전체가 버튼이다. -->
      <button
        type="button" class="consent" :class="{ agreed }"
        :aria-pressed="agreed" @click="toggleAgreed"
      >
        <span class="consent-box"><AppIcon v-if="agreed" name="check" /></span>
        <span class="consent-text">
          <strong>개인정보 수집·이용 동의 (필수)</strong>
          <small class="consent-lines">
            <span>항목: 엔트리 번호·휴대전화번호</span>
            <span>목적: 대기 등록·순번 조회·호출 안내</span>
            <span>보유: 등록 완료·취소 시까지</span>
            <span>미동의 시 대기 등록 불가</span>
          </small>
        </span>
      </button>

      <p v-if="submitError" class="error">{{ submitError }}</p>

      <button class="btn btn-primary big-btn" type="submit" :disabled="busy">대기 등록</button>
    </form>
  </div>
</template>

<style scoped>
.kiosk {
  max-width: 460px;
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

.card {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-md);
  padding: var(--spacing-xl);
  text-align: center;
}

.card-title {
  font-size: 1.375rem;
}

.card-desc {
  color: var(--text-secondary);
  line-height: 1.6;
  word-break: keep-all;
}

/* 폼 요소는 왼쪽 정렬이 자연스럽다(레이블-입력 축이 맞아야 읽힌다) */
.card .field {
  text-align: left;
  gap: 0.4rem;
}

.num-group {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.big-input {
  padding: 0.7rem 0.85rem;
  font-size: 1.125rem;
}

.big-btn {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
}

.entry-found {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.55rem 0.75rem;
  text-align: left;
  background: var(--accent-primary-soft);
  border-radius: var(--radius);
}

.entry-found.busy {
  background: var(--accent-warning-soft);
}

.entry-found .icon {
  width: 18px;
  height: 18px;
  flex: none;
  color: var(--accent-primary);
}

.entry-found.busy .icon {
  color: var(--accent-warning);
}

.entry-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.35;
}

.entry-school {
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.entry-team {
  font-weight: 600;
}

.entry-hint {
  text-align: left;
  font-size: 0.8125rem;
}

/* 동의 영역 전체가 탭 대상이다(태블릿에서 체크박스만 누르기는 어렵다) */
.consent {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.85rem;
  font-family: var(--font-body);
  color: var(--text-primary);
  text-align: left;
  background: var(--bg-subtle);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.consent:hover {
  border-color: var(--border-strong);
}

.consent.agreed {
  background: var(--accent-success-soft);
  border-color: var(--accent-success);
}

.consent-box {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: none;
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
}

.consent.agreed .consent-box {
  color: var(--text-on-accent);
  background: var(--accent-success);
  border-color: var(--accent-success);
}

.consent-box .icon {
  width: 18px;
  height: 18px;
}

.consent-text {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  line-height: 1.45;
  word-break: keep-all;
}

.consent-text strong {
  font-size: 0.9375rem;
  font-weight: 600;
}

.consent-text small {
  font-size: 0.8125rem;
  color: var(--text-tertiary);
}

.consent-lines {
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
}

.consent-lines span {
  white-space: nowrap;
}

.error {
  color: var(--accent-danger);
  font-size: 0.875rem;
  word-break: keep-all;
}

.card-icon {
  width: 40px;
  height: 40px;
  align-self: center;
}

.card-icon.ok {
  color: var(--accent-success);
}

.card-icon.warn {
  color: var(--accent-warning);
}

.rank {
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
</style>
