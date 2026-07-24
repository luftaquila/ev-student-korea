import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "path";
import { fileURLToPath } from "url";

const here = resolve(fileURLToPath(new URL(".", import.meta.url)));

export default defineConfig({
  plugins: [vue()],

  server: {
    port: 9000,
    proxy: {
      // HubHeader가 /auth/api/login·logout·session을 절대 경로로 호출한다.
      // 프로덕션에서는 Caddy가 /auth 접두사를 떼고 auth로 넘기므로 dev도 동일하게 맞춘다.
      "/auth/api": {
        target: "http://localhost:9100",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/auth/, ""),
      },
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  resolve: {
    alias: [
      { find: "@shared", replacement: resolve(here, "../shared") },
      // shared/SonnerToaster.vue·useNotification.js가 bare import하는 vue-sonner는
      // landing/ 바깥(shared/)이라 rollup이 해석하지 못한다(landing Docker 이미지엔
      // node_modules 심링크도 없다). 정확히 "vue-sonner"만 매칭해 /style.css 하위
      // exports는 건드리지 않는다.
      { find: /^vue-sonner$/, replacement: resolve(here, "node_modules/vue-sonner") },
    ],
  },
});
