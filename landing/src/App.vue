<script setup>
import { onMounted } from "vue";
import HubHeader from "@shared/HubHeader.vue";
import SonnerToaster from "@shared/SonnerToaster.vue";
import HubCard from "./components/HubCard.vue";
import { useNotification } from "@shared/useNotification.js";
import { user, isAdmin } from "@shared/userStore.js";
import { services, externals, adminMenu } from "@shared/nav-config.js";

const { error: notifyError } = useNotification();

const year = new Date().getFullYear();

const LOGIN_ERROR_MESSAGES = {
  unregistered: "등록되지 않은 계정입니다. 관리자에게 문의하세요.",
  deactivated: "비활성화된 계정입니다. 관리자에게 문의하세요.",
  unverified: "이메일이 확인되지 않은 Google 계정입니다.",
  cancelled: "로그인이 취소되었습니다.",
  nonce: "로그인 요청이 만료되었습니다. 다시 시도해 주세요.",
  token: "로그인 중 오류가 발생했습니다. 다시 시도해 주세요.",
  userinfo: "로그인 중 오류가 발생했습니다. 다시 시도해 주세요.",
  error: "로그인 중 오류가 발생했습니다. 다시 시도해 주세요.",
  rate_limit: "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.",
};

onMounted(() => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("login_error");
  if (code) {
    notifyError(LOGIN_ERROR_MESSAGES[code] || "로그인에 실패했습니다.");
    history.replaceState(null, "", "/");
  }

  // ev_user 쿠키는 표시용이라 서버에서 계정이 삭제·비활성화·강등돼도 남아 있을 수 있다.
  // 세션을 재검증해 관리자 섹션 등 UI가 실제 권한과 어긋나지 않게 맞춘다.
  if (user.value) {
    fetch("/auth/api/session")
      .then((res) => (res.ok ? res.json().then((data) => { user.value = data; }) : (user.value = null)))
      .catch(() => {});
  }
});
</script>

<template>
  <div class="app-shell">
    <SonnerToaster />
    <HubHeader />

    <!-- 마케팅성 히어로 없이 바로 본론 — 운영 포털은 랜딩이 곧 바로가기 목록이다 -->
    <main class="main">
      <section class="section">
        <h2 class="section-title">서비스</h2>
        <div class="card-grid">
          <HubCard v-for="item in services" :key="item.href" v-bind="item" />
        </div>
      </section>

      <section class="section">
        <h2 class="section-title">외부 서비스</h2>
        <div class="card-grid">
          <HubCard v-for="item in externals" :key="item.href" v-bind="item" external />
        </div>
      </section>

      <section v-if="isAdmin" class="section">
        <h2 class="section-title">관리자</h2>
        <div class="card-grid">
          <HubCard v-for="item in adminMenu" :key="item.href" v-bind="item" />
        </div>
      </section>
    </main>

    <footer class="app-footer">© {{ year }} EV Student Korea</footer>
  </div>
</template>

<style scoped>
.section + .section {
  margin-top: var(--spacing-xl);
}

.section-title {
  font-size: 1.0625rem;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-bottom: 0.85rem;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.75rem;
}

@media (max-width: 640px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
