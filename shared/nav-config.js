// 허브 메뉴의 단일 소스. 랜딩 카드와 헤더 탭이 같은 목록을 참조하므로 여기만 고치면 된다.

// 이 저장소가 직접 운영하는 서비스.
export const services = [
  { name: "등록 대기열", icon: "queue", href: "/queue" },
];

// 별도로 운영되는 외부 서비스. 전부 새 탭으로 열린다.
export const externals = [
  { name: "에너지미터", icon: "energy", href: "https://fsk-energymeter.luftaquila.io" },
  { name: "공지 알림봇", icon: "notice", href: "https://ksae-notice.luftaquila.io" },
  { name: "AI 규정 챗봇", icon: "chatbot", href: "https://ksae-qna.luftaquila.io" },
  { name: "자작자동차포럼", icon: "forum", href: "https://dnf.luftaquila.io" },
];

// 관리자 전용 메뉴. 랜딩 카드와 auth 헤더 탭이 공유한다.
// href = 허브 루트 기준 절대 경로(랜딩 카드용), route = auth SPA 내부 라우트 경로.
// auth는 route를 vite base와 합쳐 dev(base "/")와 프로덕션(base "/auth/") 양쪽에서 동작시킨다.
// route가 없는 항목은 다른 서비스의 화면이라 auth 탭에서는 href 그대로 연다.
export const adminMenu = [
  { name: "계정 관리", icon: "users", href: "/auth", route: "/" },
  { name: "시스템 로그", icon: "logs", href: "/auth/logs", route: "/logs" },
  { name: "엔트리 관리", icon: "list", href: "/queue/entries" },
];
