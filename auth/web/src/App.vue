<script setup>
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import HubHeader from "@shared/HubHeader.vue";
import SonnerToaster from "@shared/SonnerToaster.vue";
import AppIcon from "@shared/AppIcon.vue";
import { user, isAdmin } from "@shared/userStore.js";
import { adminMenu } from "@shared/nav-config.js";

const route = useRoute();

// vite base는 프로덕션에서 "/auth/", dev에서 "/"다. 탭은 라우터 링크가 아닌 실제 앵커라
// 두 환경 모두에서 유효한 경로를 만들어야 한다(HubHeader를 라우터 의존 없이 공유하기 위함).
const base = import.meta.env.BASE_URL || "/";
function toHref(routePath) {
  return (base + routePath.replace(/^\//, "")).replace(/\/$/, "") || "/";
}

const tabs = computed(() => adminMenu.map((m) => ({ ...m, href: toHref(m.route) })));
const currentPath = computed(() => toHref(route.path));

watch(
  () => route.meta.title,
  (title) => { document.title = `${title || "계정 관리"} · EV Student Korea`; },
  { immediate: true },
);
</script>

<template>
  <div class="app-shell">
    <SonnerToaster />
    <HubHeader :tabs="isAdmin ? tabs : []" :currentPath="currentPath" subtitle="ADMIN" />

    <main class="main">
      <router-view v-if="isAdmin" />

      <!-- 서버는 모든 /api/*를 admin으로 닫아두므로 비-admin에게 노출되는 것은 이 안내뿐이다. -->
      <div v-else class="panel denied">
        <AppIcon name="alert" />
        <h2 class="page-title">관리자 권한이 필요합니다</h2>
        <p class="muted">
          {{ user ? "이 계정에는 관리자 권한이 없습니다." : "로그인이 필요합니다." }}
        </p>
        <a class="btn btn-ghost" href="/">허브로 돌아가기</a>
      </div>
    </main>
  </div>
</template>

<style scoped>
.denied {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-2xl) var(--spacing-lg);
  text-align: center;
}

.denied .icon {
  width: 32px;
  height: 32px;
  color: var(--accent-warning);
}

.denied .btn {
  margin-top: var(--spacing-sm);
}
</style>
