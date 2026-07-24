<script setup>
import { computed } from "vue";
import { icons } from "./icons.js";

const props = defineProps({
  name: { type: String, required: true },
  // stroke 두께만 노출한다. 크기는 CSS(.icon)로 제어해 호출부가 폰트 스케일과 맞출 수 있게 한다.
  width: { type: [Number, String], default: 1.75 },
});

// icons.js의 정적 리터럴만 v-html로 넣는다(사용자 입력이 닿지 않으므로 XSS 경로 없음).
// 미등록 이름은 빈 아이콘으로 두어 레이아웃만 유지한다.
const markup = computed(() => icons[props.name] || "");
</script>

<template>
  <svg
    class="icon"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="width"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="markup"
  />
</template>

<style scoped>
.icon {
  width: 20px;
  height: 20px;
  flex: none;
}
</style>
