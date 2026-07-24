// TEST_SERVER 배포에서 브랜드·탭 타이틀·파비콘에 경고 표시를 붙인다. 테스트 서버는 모든
// Google 로그인을 admin으로 자동 등록하므로, 프로덕션과 착각하지 않도록 한눈에 구분되어야 한다.
export function initTestBanner() {
  if (!window.__TEST_SERVER__) return;

  document.documentElement.classList.add("test-server");

  const style = document.createElement("style");
  style.textContent =
    ".test-server .brand-name::after { content: \" \\00B7 TEST\"; color: var(--accent-warning); }" +
    ".test-server .app-header { border-bottom-color: var(--accent-warning); }";
  document.head.appendChild(style);

  const prefixTitle = () => {
    if (!document.title.startsWith("TEST ")) document.title = `TEST ${document.title}`;
  };
  prefixTitle();
  const titleEl = document.querySelector("title");
  if (titleEl) new MutationObserver(prefixTitle).observe(titleEl, { childList: true });

  const link = document.querySelector('link[rel="icon"]') || document.createElement("link");
  link.rel = "icon";
  link.href =
    "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>%E2%9A%A0%EF%B8%8F</text></svg>";
  if (!link.parentElement) document.head.appendChild(link);
}
