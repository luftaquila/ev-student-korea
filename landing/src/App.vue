<script setup>
import { onMounted } from "vue";
import HubHeader from "@shared/HubHeader.vue";
import SonnerToaster from "@shared/SonnerToaster.vue";
import HeroBanner from "./components/HeroBanner.vue";
import HubCard from "./components/HubCard.vue";
import { useNotification } from "@shared/useNotification.js";
import { user, isAdmin } from "@shared/userStore.js";
import { services, externals, adminMenu } from "@shared/nav-config.js";

const { error: notifyError } = useNotification();

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

    <main class="main">
      <HeroBanner />

      <section class="section">
        <h2 class="section-label"><span class="section-index">01</span> Services ///</h2>
        <div class="card-grid">
          <HubCard v-for="(item, i) in services" :key="item.href" v-bind="item" :index="i + 1" />
        </div>
      </section>

      <section class="section">
        <h2 class="section-label"><span class="section-index">02</span> External ///</h2>
        <div class="card-grid">
          <HubCard v-for="(item, i) in externals" :key="item.href" v-bind="item" :index="i + 1" external />
        </div>
      </section>

      <section v-if="isAdmin" class="section">
        <h2 class="section-label"><span class="section-index">03</span> Admin ///</h2>
        <div class="card-grid">
          <HubCard v-for="(item, i) in adminMenu" :key="item.href" v-bind="item" :index="i + 1" />
        </div>
      </section>
    </main>

    <footer class="footer">
      <span class="mono dim">EV STUDENT KOREA · SERVICE HUB</span>
    </footer>
  </div>
</template>

<style scoped>
.section {
  margin-bottom: var(--spacing-2xl);
}

.section-label {
  margin-bottom: var(--spacing-md);
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));
  gap: var(--spacing-md);
}

.footer {
  padding: var(--spacing-lg) var(--spacing-xl);
  border-top: 1px solid var(--border-color);
  text-align: center;
  font-size: 0.6875rem;
  letter-spacing: 0.14em;
}

@media (max-width: 640px) {
  .section {
    margin-bottom: var(--spacing-xl);
  }

  .card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.6rem;
  }
}
</style>
