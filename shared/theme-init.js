// data-theme을 항상 명시적으로 세팅한다. tokens.css의 :root가 다크 기본이므로
// 미설정 상태로 두면 라이트 선호 사용자도 다크를 보게 된다.
export function initTheme() {
  const saved = localStorage.getItem("theme");
  if (saved === "light" || saved === "dark") {
    document.documentElement.setAttribute("data-theme", saved);
  } else {
    const prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.setAttribute("data-theme", prefersLight ? "light" : "dark");
  }

  // 다른 탭/다른 서비스에서 테마를 바꾸면 따라간다
  window.addEventListener("storage", (e) => {
    if (e.key === "theme") {
      document.documentElement.setAttribute("data-theme", e.newValue === "light" ? "light" : "dark");
    }
  });
}
