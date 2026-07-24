// data-theme을 항상 명시적으로 세팅한다. 라이트가 기본이고, 명시적으로 다크를
// 선호하는 환경에서만 다크로 시작한다.
export function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    document.documentElement.setAttribute("data-theme", prefersDark ? "dark" : "light");
  }

  // 다른 탭/다른 서비스에서 테마를 바꾸면 따라간다
  window.addEventListener("storage", (e) => {
    if (e.key === "theme") {
      document.documentElement.setAttribute("data-theme", e.newValue === "light" ? "light" : "dark");
    }
  });
}
