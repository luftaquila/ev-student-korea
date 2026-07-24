import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

// 서비스 프론트엔드 공통 Vite 설정. 프로덕션 base는 `/<service>/`여야 한다 —
// Caddy가 경로 접두사로 라우팅하므로 base가 틀리면 자산이 전부 404가 된다.
export function createViteConfig(serviceName, servicePort, options = {}) {
  const { server = {}, build = {}, aliases = {} } = options;

  // @shared는 이 파일이 있는 디렉터리(= shared/)로 해석한다
  const sharedDir = resolve(dirname(fileURLToPath(import.meta.url)));

  const proxy = {
    "/api": {
      target: `http://localhost:${servicePort}`,
      changeOrigin: true,
    },
    // HubHeader는 /auth/api/login·logout을 절대 경로로 호출한다(프로덕션에서는 Caddy가
    // /auth 접두사를 떼고 auth로 넘긴다). dev 서버에서도 같은 코드가 동작하도록 동일하게
    // 프록시한다. `/api` 규칙과는 겹치지 않는다(prefix 매칭).
    "/auth/api": {
      target: "http://localhost:9100",
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/auth/, ""),
    },
  };

  return ({ mode }) => {
    const isProduction = mode === "production";

    return {
      base: isProduction ? `/${serviceName}/` : "",
      server: {
        ...server,
        proxy: {
          ...proxy,
          ...server.proxy,
        },
      },
      build: {
        outDir: "dist",
        emptyOutDir: true,
        ...build,
      },
      resolve: {
        alias: [
          { find: "@shared", replacement: sharedDir },
          // shared/ 모듈(useNotification.js, SonnerToaster.vue)이 bare import하는 vue-sonner는
          // web/ 바깥에 있어 rollup이 해석하지 못한다(vue와 달리 자동 optimizeDeps 대상이 아님).
          // 빌드 cwd(= 각 서비스 web/)의 node_modules로 고정한다. 정확히 "vue-sonner"만
          // 매칭(정규식 $)해야 한다 — 문자열 alias는 "vue-sonner/style.css"까지 잡아
          // exports 맵(./lib/index.css)을 우회해 깨진다.
          { find: /^vue-sonner$/, replacement: resolve(process.cwd(), "node_modules/vue-sonner") },
          ...Object.entries(aliases).map(([find, replacement]) => ({ find, replacement })),
        ],
      },
    };
  };
}
