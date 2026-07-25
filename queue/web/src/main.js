import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import "vue-sonner/style.css";
import "@shared/styles/base.css";
import "@shared/styles/layout.css";
import { initTheme } from "@shared/theme-init.js";
import { initTestBanner } from "@shared/test-banner.js";

initTheme();
initTestBanner();

// meta.role은 App.vue의 클라이언트 게이트가 쓴다. 실제 접근 제어는 서버(API 게이트)가 한다.
const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: () => import("./views/Lookup.vue"), meta: { title: "대기 현황" } },
    { path: "/register", component: () => import("./views/Register.vue"), meta: { title: "대기 등록", role: "official" } },
    { path: "/manage", component: () => import("./views/Manage.vue"), meta: { title: "대기열 관리", role: "official" } },
    { path: "/entries", component: () => import("./views/Entries.vue"), meta: { title: "엔트리 관리", role: "admin" } },
  ],
});

createApp(App).use(router).mount("#app");
