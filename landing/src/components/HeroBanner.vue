<script setup>
import { user, roleLabel } from "@shared/userStore.js";
</script>

<template>
  <section class="hero">
    <div class="hero-rule">
      <span class="mono">EV COMPETITION</span>
      <span class="rule"></span>
      <span class="mono dim">{{ user ? `${roleLabel} 접속` : "게스트" }}</span>
    </div>

    <h1 class="hero-title">
      <span class="line-1">EV STUDENT</span>
      <span class="line-2">KOREA</span>
    </h1>

    <p class="hero-desc">
      대회 운영에 필요한 서비스를 한곳에서 엽니다.
      <br class="br-mobile">
      등록 대기열과 계측·공지·규정 서비스로 바로 이동하세요.
    </p>
  </section>
</template>

<style scoped>
.hero {
  padding: var(--spacing-2xl) 0 var(--spacing-xl);
}

.hero-rule {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.6875rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--accent-primary);
}

.hero-rule .rule {
  flex: 1;
  height: 1px;
  background: linear-gradient(to right, var(--accent-primary), var(--border-color) 40%, transparent);
}

.hero-title {
  margin: var(--spacing-md) 0 var(--spacing-sm);
  display: flex;
  flex-direction: column;
  font-family: var(--font-display);
  font-size: clamp(2.25rem, 8vw, 4.25rem);
  font-weight: 600;
  line-height: 0.98;
  letter-spacing: -0.03em;
  text-transform: uppercase;
}

.line-2 {
  /* 두 번째 줄만 라임으로 끊어 시선을 잡는다 */
  color: var(--accent-primary);
  padding-left: 1.5ch;
}

.hero-desc {
  max-width: 34rem;
  font-size: 0.9375rem;
  line-height: 1.65;
  color: var(--text-secondary);
  word-break: keep-all;
}

.br-mobile {
  display: none;
}

@media (max-width: 640px) {
  .hero {
    padding: var(--spacing-xl) 0 var(--spacing-lg);
  }

  .line-2 {
    padding-left: 0;
  }

  .br-mobile {
    display: inline;
  }
}
</style>
