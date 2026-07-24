<script setup>
import { ref, onMounted, onUnmounted } from "vue";
import { Toaster } from "vue-sonner";

// sonner Toaster의 theme prop을 사이트 테마(documentElement[data-theme])에 묶는다.
// 토글/다른 탭/초기화 등 모든 경로의 변경을 MutationObserver로 감지해 동기화한다.
function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

const theme = ref(currentTheme());
let observer;

onMounted(() => {
  theme.value = currentTheme();
  observer = new MutationObserver(() => { theme.value = currentTheme(); });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
});

onUnmounted(() => observer?.disconnect());
</script>

<template>
  <Toaster rich-colors :theme="theme" position="bottom-right" :duration="3500" />
</template>
