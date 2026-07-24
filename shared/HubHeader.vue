<script setup>
import { ref, computed, onMounted, onUnmounted } from "vue";
import AppIcon from "./AppIcon.vue";
import ThemeToggle from "./ThemeToggle.vue";
import { user, roleLabel, refreshUserFromCookie } from "./userStore.js";

// 랜딩과 auth SPA가 공유하는 상단 크롬. 탭 목록은 각 앱이 넘긴다(랜딩은 카드가 내비게이션
// 역할을 하므로 탭 없음, auth는 관리자 메뉴를 탭으로 노출).
const props = defineProps({
  tabs: { type: Array, default: () => [] },
  currentPath: { type: String, default: "" },
  subtitle: { type: String, default: "" },
});

const menuOpen = ref(false);
const menuRef = ref(null);

const initial = computed(() => (user.value?.name || "?").trim().charAt(0).toUpperCase());

// 로그인 후 보고 있던 화면으로 돌아온다. Caddy가 /auth 접두사를 떼기 때문에 절대 경로로 호출한다.
const loginHref = () =>
  `/auth/api/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;

async function logout() {
  menuOpen.value = false;
  try {
    await fetch("/auth/api/logout", { method: "POST" });
  } finally {
    // 서버가 쿠키를 지웠으므로 루트로 보내 상태를 초기화한다(실패해도 재확인 기회를 준다).
    window.location.href = "/";
  }
}

function onDocClick(e) {
  if (menuOpen.value && menuRef.value && !menuRef.value.contains(e.target)) menuOpen.value = false;
}

function onKeydown(e) {
  if (e.key === "Escape") menuOpen.value = false;
}

onMounted(() => {
  refreshUserFromCookie();
  document.addEventListener("click", onDocClick);
  document.addEventListener("keydown", onKeydown);
});

onUnmounted(() => {
  document.removeEventListener("click", onDocClick);
  document.removeEventListener("keydown", onKeydown);
});
</script>

<template>
  <header class="app-header">
    <div class="header-inner">
      <a class="brand" href="/">
        <span class="brand-mark"><AppIcon name="energy" /></span>
        <span class="brand-name">EV Student Korea</span>
      </a>
      <template v-if="subtitle">
        <span class="brand-divider"></span>
        <span class="brand-sub">{{ subtitle }}</span>
      </template>

      <nav v-if="tabs.length" class="nav-tabs">
        <a
          v-for="tab in tabs"
          :key="tab.href"
          :href="tab.href"
          class="nav-tab"
          :class="{ active: tab.href === currentPath }"
        >{{ tab.name }}</a>
      </nav>

      <div class="header-actions">
        <ThemeToggle />

        <div v-if="user" ref="menuRef" class="user-menu">
          <button class="user-chip" type="button" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
            <span class="user-avatar">{{ initial }}</span>
            <span class="user-name">{{ user.name }}</span>
            <AppIcon name="chevron" class="chevron" :class="{ open: menuOpen }" />
          </button>

          <div v-if="menuOpen" class="user-popover">
            <div class="popover-head">
              <div class="user-name-full">{{ user.name }}</div>
              <div class="dim">{{ roleLabel }}</div>
            </div>
            <button class="popover-item" type="button" @click="logout">
              <AppIcon name="logout" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>

        <a v-else class="btn login-btn" :href="loginHref()">
          <AppIcon name="google" />
          <span>Google 로그인</span>
        </a>
      </div>
    </div>
  </header>
</template>

<style scoped>
.user-menu {
  position: relative;
}

.user-chip {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  padding: 0.3rem 0.55rem 0.3rem 0.35rem;
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: var(--text-primary);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease;
}

.user-chip:hover {
  background: var(--bg-hover);
}

.user-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--accent-primary);
  background: var(--accent-primary-soft);
  flex: none;
}

.user-name {
  max-width: 9rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.chevron {
  width: 14px;
  height: 14px;
  color: var(--text-tertiary);
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(180deg);
}

.user-popover {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 50;
  min-width: 180px;
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-modal);
  overflow: hidden;
}

.popover-head {
  padding: 0.65rem 0.85rem;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.8125rem;
}

.user-name-full {
  font-weight: 600;
  word-break: break-all;
}

.popover-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.6rem 0.85rem;
  font-family: var(--font-body);
  font-size: 0.8125rem;
  color: var(--text-primary);
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}

.popover-item:hover {
  background: var(--bg-hover);
}

.popover-item .icon {
  width: 15px;
  height: 15px;
  color: var(--text-secondary);
}

.login-btn .icon {
  width: 15px;
  height: 15px;
}

@media (max-width: 768px) {
  .user-name {
    display: none;
  }

  .login-btn span {
    display: none;
  }
}
</style>
