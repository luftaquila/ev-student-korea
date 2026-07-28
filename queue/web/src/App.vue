<script setup>
import { computed, watch } from "vue";
import { useRoute } from "vue-router";
import HubHeader from "@shared/HubHeader.vue";
import SonnerToaster from "@shared/SonnerToaster.vue";
import AppIcon from "@shared/AppIcon.vue";
import { user, isOfficial, isAdmin } from "@shared/userStore.js";

const route = useRoute();

// vite base는 프로덕션에서 "/queue/", dev에서 "/"다. 탭은 라우터 링크가 아닌 실제 앵커라
// 두 환경 모두에서 유효한 경로를 만들어야 한다(HubHeader를 라우터 의존 없이 공유하기 위함).
const base = import.meta.env.BASE_URL || "/";
function toHref(routePath) {
  return (base + routePath.replace(/^\//, "")).replace(/\/$/, "") || "/";
}

// 공개 방문자는 탭이 없고, 오피셜부터 운영 메뉴가 보인다. 엔트리 관리는 admin 전용.
const menu = computed(() => {
  if (!isOfficial.value) return [];
  const items = [
    { name: "대기 현황", route: "/" },
    { name: "대기열 관리", route: "/manage" },
  ];
  if (isAdmin.value) items.push({ name: "엔트리 관리", route: "/entries" });
  return items.map((m) => ({ ...m, href: toHref(m.route) }));
});

const currentPath = computed(() => toHref(route.path));

// 서버도 SPA 경로를 게이트하지만(비인가는 "/"로 리다이렉트), SPA 내부 네비게이션은
// 서버를 거치지 않으므로 클라이언트에서도 같은 규칙으로 화면을 막는다.
const allowed = computed(() => {
  const need = route.meta.role;
  if (!need) return true;
  return need === "admin" ? isAdmin.value : isOfficial.value;
});

watch(
  () => route.meta.title,
  (title) => { document.title = `${title || "등록 대기열"} · EV Student Korea`; },
  { immediate: true },
);
</script>

<template>
  <div class="app-shell">
    <SonnerToaster />
    <HubHeader :tabs="menu" :currentPath="currentPath" subtitle="등록 대기열" />

    <main class="main">
      <router-view v-if="allowed" />

      <div v-else class="panel denied">
        <AppIcon name="alert" />
        <h2 class="page-title">{{ route.meta.role === "admin" ? "관리자" : "오피셜" }} 권한이 필요합니다</h2>
        <p class="muted">
          {{ user ? "이 계정에는 접근 권한이 없습니다." : "로그인이 필요합니다." }}
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
