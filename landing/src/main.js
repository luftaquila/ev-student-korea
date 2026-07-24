import { createApp } from "vue";
import App from "./App.vue";
import "vue-sonner/style.css";
import "@shared/styles/base.css";
import "@shared/styles/layout.css";
import { initTheme } from "@shared/theme-init.js";
import { initTestBanner } from "@shared/test-banner.js";

initTheme();
initTestBanner();

createApp(App).mount("#app");
