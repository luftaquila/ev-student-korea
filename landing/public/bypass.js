// 카카오톡 인앱 브라우저(WebView)에서는 Google OAuth가 "disallowed_useragent"로 차단된다.
// 링크가 카톡으로 공유되는 일이 많으므로 진입 즉시 외부 브라우저로 넘긴다.
(function () {
  function run() {
    if (/kakaotalk/i.test(navigator.userAgent)) {
      location.href = "kakaotalk://web/openExternal?url=" + encodeURIComponent(location.href);
    }
  }
  if (document.readyState !== "loading") run();
  else document.addEventListener("DOMContentLoaded", run);
})();
