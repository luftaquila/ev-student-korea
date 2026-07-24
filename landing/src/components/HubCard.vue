<script setup>
import { computed } from "vue";
import AppIcon from "@shared/AppIcon.vue";

const props = defineProps({
  name: { type: String, required: true },
  desc: { type: String, default: "" },
  icon: { type: String, default: "queue" },
  href: { type: String, required: true },
  index: { type: Number, default: 1 },
  external: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  badge: { type: String, default: "" },
});

// 미구현 서비스는 링크가 아니라 정보 카드다 — 앵커로 두면 클릭해서 404를 보게 된다.
const tag = computed(() => (props.disabled ? "div" : "a"));
const label = computed(() => String(props.index).padStart(2, "0"));
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
    <div class="card-top">
      <span class="card-index mono">{{ label }}</span>
      <AppIcon v-if="external" name="external" class="card-out" />
      <AppIcon v-else-if="disabled" name="clock" class="card-out" />
    </div>

    <span class="card-icon"><AppIcon :name="icon" /></span>

    <div class="card-text">
      <h3 class="card-name">
        {{ name }}
        <span v-if="badge" class="badge badge-muted">{{ badge }}</span>
      </h3>
      <p v-if="desc" class="card-desc">{{ desc }}</p>
    </div>
  </component>
</template>

<style scoped>
.hub-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  padding: var(--spacing-md);
  min-height: 11rem;
  color: var(--text-primary);
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  text-decoration: none;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background-color 0.18s ease;
}

.hub-card:not(.disabled):hover {
  text-decoration: none;
  background: var(--bg-hover);
  box-shadow: var(--glow);
}

.hub-card:not(.disabled):hover .card-index,
.hub-card:not(.disabled):hover .card-icon {
  color: var(--accent-primary);
  border-color: var(--accent-primary);
}

.hub-card.disabled {
  cursor: default;
  background: transparent;
  border-style: dashed;
}

.hub-card.disabled .card-name,
.hub-card.disabled .card-icon {
  color: var(--text-tertiary);
}

.card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.card-index {
  font-size: 0.6875rem;
  font-weight: 500;
  letter-spacing: 0.14em;
  color: var(--text-tertiary);
  transition: color 0.18s ease;
}

.card-out {
  width: 15px;
  height: 15px;
  color: var(--text-tertiary);
}

.card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  transition: color 0.18s ease, border-color 0.18s ease;
}

.card-icon .icon {
  width: 21px;
  height: 21px;
}

.card-text {
  margin-top: auto;
}

.card-name {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  font-size: 1rem;
  font-weight: 600;
  word-break: keep-all;
}

.card-desc {
  margin-top: 0.2rem;
  font-size: 0.8125rem;
  line-height: 1.5;
  color: var(--text-secondary);
  word-break: keep-all;
}

@media (max-width: 640px) {
  .hub-card {
    min-height: 0;
    gap: 0.6rem;
    padding: 0.85rem;
  }

  .card-icon {
    width: 32px;
    height: 32px;
  }

  .card-desc {
    display: none;
  }
}
</style>
