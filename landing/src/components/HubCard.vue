<script setup>
import { computed } from "vue";
import AppIcon from "@shared/AppIcon.vue";

const props = defineProps({
  name: { type: String, required: true },
  desc: { type: String, default: "" },
  icon: { type: String, default: "queue" },
  href: { type: String, required: true },
  external: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  badge: { type: String, default: "" },
});

// 미구현 서비스는 링크가 아니라 정보 카드다 — 앵커로 두면 클릭해서 404를 보게 된다.
const tag = computed(() => (props.disabled ? "div" : "a"));
</script>

<template>
  <component
    :is="tag"
    class="hub-card"
    :class="{ disabled }"
    :href="disabled ? undefined : href"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener noreferrer' : undefined"
  >
    <span class="card-icon"><AppIcon :name="icon" /></span>

    <span class="card-body">
      <span class="card-title">
        {{ name }}
        <span v-if="badge" class="badge badge-muted">{{ badge }}</span>
      </span>
      <span v-if="desc" class="card-desc">{{ desc }}</span>
    </span>

    <AppIcon v-if="external" name="external" class="card-arrow" />
    <AppIcon v-else-if="!disabled" name="chevron" class="card-arrow card-arrow-right" />
  </component>
</template>

<style scoped>
.hub-card {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 1rem 1.125rem;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-card);
  text-decoration: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

a.hub-card:hover {
  text-decoration: none;
  border-color: var(--border-strong);
  box-shadow: var(--shadow-hover);
}

.hub-card.disabled .card-title,
.hub-card.disabled .card-desc,
.hub-card.disabled .card-icon {
  color: var(--text-tertiary);
}

.card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  color: var(--text-secondary);
  background: var(--bg-hover);
  flex: none;
}

.card-icon .icon {
  width: 20px;
  height: 20px;
}

.card-body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9375rem;
  font-weight: 600;
  word-break: keep-all;
}

.card-desc {
  margin-top: 0.1rem;
  font-size: 0.8125rem;
  line-height: 1.45;
  color: var(--text-secondary);
  word-break: keep-all;
}

.card-arrow {
  width: 15px;
  height: 15px;
  margin-left: auto;
  color: var(--text-tertiary);
  flex: none;
}

.card-arrow-right {
  transform: rotate(-90deg);
}
</style>
