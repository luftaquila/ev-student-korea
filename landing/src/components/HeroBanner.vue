<template>
  <section class="hero">
    <div class="hero-inner">
      <h1 class="hero-title">대회 운영 서비스를 한곳에서</h1>
      <p class="hero-desc">
        EV Student Korea 서비스 허브입니다. 등록 대기열과 에너지미터,
        공지·규정 서비스를 빠르게 이용하세요.
      </p>
    </div>
  </section>
</template>

<style scoped>
.hero {
  background: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.hero-inner {
  max-width: var(--layout-max-width);
  margin: 0 auto;
  padding: var(--spacing-2xl) var(--spacing-xl);
}

.hero-title {
  font-size: clamp(1.5rem, 4vw, 2rem);
  font-weight: 700;
  letter-spacing: -0.02em;
}

.hero-desc {
  margin-top: 0.6rem;
  max-width: 36rem;
  font-size: 0.9375rem;
  line-height: 1.65;
  color: var(--text-secondary);
  word-break: keep-all;
}

@media (max-width: 768px) {
  .hero-inner {
    padding: var(--spacing-xl) var(--spacing-md);
  }
}
</style>
