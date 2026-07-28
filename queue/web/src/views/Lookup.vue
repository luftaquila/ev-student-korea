<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import AppIcon from "@shared/AppIcon.vue";
import { formatDate } from "@shared/format-date.js";
import { formatPhone } from "@shared/format-phone.js";
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
    if (!silent) errorMsg.value = "엔트리 번호와 전화번호를 입력하세요.";
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

// 결과 카드에서 조회 폼으로 돌아간다(저장값도 버려 자동 조회가 다시 걸리지 않게 한다)
function resetLookup() {
  result.value = null;
  notFound.value = false;
  errorMsg.value = "";
  form.value = { num: "", phone: "" };
  localStorage.removeItem(STORAGE_KEY);
}

let timer = null;

onMounted(() => {
  loadStatus();

  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    if (saved?.num && saved?.phone) {
      form.value = { num: saved.num, phone: formatPhone(saved.phone) };
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
  <div class="lookup">
    <!-- 현황 요약: 조회 결과와 경쟁하지 않도록 카드가 아닌 한 줄 스트립으로 둔다 -->
    <div v-if="status" class="status-strip">
      <span class="badge" :class="status.open ? 'badge-ok' : 'badge-danger'">
        {{ status.open ? "접수 중" : "접수 마감" }}
      </span>
      <span class="strip-item">현재 대기 <b>{{ status.waiting }}</b>팀</span>
      <span v-if="status.called.length" class="strip-item">
        호출 <b>{{ status.called.map((c) => c.num).join(", ") }}</b>번
      </span>
    </div>

    <!-- 결과 (조회 성공) -->
    <section v-if="result" class="panel card" :class="{ 'card-called': result.status === 'called' }">
      <div class="team">
        <span class="badge badge-muted">엔트리 {{ result.num }}</span>
        <span class="team-name">{{ result.team || "팀 미등록" }}</span>
        <span v-if="result.school" class="muted team-school">{{ result.school }}</span>
      </div>

      <template v-if="result.status === 'waiting'">
        <div class="rank">
          <span class="rank-num">{{ result.position }}</span>
          <span class="rank-unit">번째</span>
        </div>
        <p class="note">
          {{ aheadCount > 0 ? `앞에 ${aheadCount}팀이 기다리고 있습니다.` : "다음 차례입니다. 등록 데스크 근처에서 대기하세요." }}
        </p>
      </template>

      <template v-else>
        <div class="rank called">
          <AppIcon name="notice" />
          <span>호출되었습니다</span>
        </div>
        <p class="note">등록 데스크로 오세요.</p>
      </template>

      <dl class="meta">
        <div class="meta-item">
          <dt>전체 대기</dt>
          <dd>{{ result.waiting_total }}팀</dd>
        </div>
        <div class="meta-item">
          <dt>{{ result.status === "called" ? "호출" : "대기 등록" }}</dt>
          <dd>{{ formatDate(result.status === "called" ? result.called_at : result.registered_at) }}</dd>
        </div>
      </dl>

      <div class="card-foot">
        <button class="btn btn-ghost btn-sm" type="button" @click="resetLookup">다른 번호로 조회</button>
      </div>
    </section>

    <!-- 조회 폼 -->
    <section v-else class="panel card">
      <h1 class="card-title">내 순서 조회</h1>

      <form class="form" @submit.prevent="doLookup()">
        <div class="field">
          <label class="field-label" for="lookup-num">엔트리 번호</label>
          <input
            id="lookup-num" v-model="form.num" class="input" type="text"
            inputmode="numeric" autocomplete="off"
          >
        </div>
        <div class="field">
          <label class="field-label" for="lookup-phone">전화번호</label>
          <!-- 등록 화면과 같은 규칙으로 입력 중 하이픈을 자동으로 넣는다 -->
          <input
            id="lookup-phone" class="input input-mono" type="tel"
            inputmode="numeric" maxlength="13"
            placeholder="010-0000-0000" autocomplete="off"
            :value="form.phone" @input="form.phone = formatPhone($event.target.value)"
          >
        </div>
        <button class="btn btn-primary submit" type="submit" :disabled="busy">
          <AppIcon name="search" /><span>조회</span>
        </button>
      </form>

      <p v-if="errorMsg" class="error">{{ errorMsg }}</p>
      <p v-else-if="notFound" class="muted found-none">대기 중인 내역이 없습니다.</p>
    </section>
  </div>
</template>

<style scoped>
/* 공개 조회는 대부분 휴대폰에서 열린다 — 한 컬럼으로 좁게 잡고 가운데 정렬한다 */
.lookup {
  max-width: 460px;
  margin: 0 auto;
}

.status-strip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.75rem;
  margin-bottom: var(--spacing-md);
  padding: 0 0.15rem;
  font-size: 0.8125rem;
  color: var(--text-secondary);
}

.strip-item b {
  font-weight: 600;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.card {
  padding: var(--spacing-lg);
}

.card-called {
  border-color: var(--accent-primary);
}

.card-title {
  font-size: 1.125rem;
}

/* ── 조회 폼 ─────────────────────────────────── */
.form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-sm) var(--spacing-md);
  margin-top: var(--spacing-md);
}

/* 버튼이 필드 간격(8px)만큼만 떨어져 있으면 입력칸에 붙어 보인다 — 한 단계 더 띄운다 */
.submit {
  grid-column: 1 / -1;
  margin-top: var(--spacing-sm);
  padding: 0.6rem 1rem;
}

.error {
  margin-top: var(--spacing-sm);
  color: var(--accent-danger);
  font-size: 0.8125rem;
}

.found-none {
  margin-top: var(--spacing-sm);
  font-size: 0.8125rem;
}

/* ── 결과 ────────────────────────────────────── */
.team {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem 0.5rem;
}

.team-name {
  font-size: 1rem;
  font-weight: 600;
}

.team-school {
  font-size: 0.875rem;
}

.rank {
  display: flex;
  align-items: baseline;
  gap: 0.3rem;
  margin: var(--spacing-md) 0 0;
}

.rank-num {
  font-size: 3.5rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  color: var(--accent-primary);
  font-variant-numeric: tabular-nums;
}

.rank-unit {
  font-size: 1.125rem;
  color: var(--text-secondary);
}

.rank.called {
  align-items: center;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--accent-primary);
}

.rank.called .icon {
  width: 26px;
  height: 26px;
}

/* 한글은 기본 규칙대로 두면 "대기하 / 세요"처럼 어절 중간에서 끊긴다 */
.note {
  margin-top: 0.35rem;
  font-size: 0.9375rem;
  color: var(--text-secondary);
  word-break: keep-all;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-md) var(--spacing-xl);
  margin-top: var(--spacing-lg);
  padding-top: var(--spacing-md);
  border-top: 1px solid var(--border-color);
}

.meta-item dt {
  font-size: 0.75rem;
  color: var(--text-secondary);
}

.meta-item dd {
  margin-top: 0.1rem;
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}

.card-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--spacing-md);
}

@media (max-width: 420px) {
  .form {
    grid-template-columns: 1fr;
  }
}
</style>
