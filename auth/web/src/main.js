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

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", component: () => import("./views/Users.vue"), meta: { title: "계정 관리" } },
    { path: "/logs", component: () => import("./views/Logs.vue"), meta: { title: "시스템 로그" } },
  ],
});

createApp(App).use(router).mount("#app");
