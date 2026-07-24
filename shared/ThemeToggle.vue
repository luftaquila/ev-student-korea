<script setup>
import { ref, onMounted, onUnmounted, watch } from "vue";
import AppIcon from "./AppIcon.vue";

const isDark = ref(true);
let storageHandler;

onMounted(() => {
  isDark.value = document.documentElement.getAttribute("data-theme") !== "light";
  storageHandler = (e) => {
    if (e.key === "theme") isDark.value = e.newValue !== "light";
  };
  window.addEventListener("storage", storageHandler);
});

onUnmounted(() => {
  if (storageHandler) window.removeEventListener("storage", storageHandler);
});

watch(isDark, () => {
  const theme = isDark.value ? "dark" : "light";
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("theme", theme);
  // 같은 브라우저의 다른 탭/서비스에 즉시 반영 (같은 탭에서는 storage 이벤트가 안 뜬다)
  window.dispatchEvent(new StorageEvent("storage", { key: "theme", newValue: theme }));
});
</script>

<template>
  <button
    class="btn btn-icon"
    type="button"
    :title="isDark ? '라이트 모드로 전환' : '다크 모드로 전환'"
    :aria-label="isDark ? '라이트 모드로 전환' : '다크 모드로 전환'"
    @click="isDark = !isDark"
  >
    <AppIcon :name="isDark ? 'moon' : 'sun'" />
  </button>
</template>

<style scoped>
.icon {
  width: 18px;
  height: 18px;
}
</style>
