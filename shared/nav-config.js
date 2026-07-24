// 허브 메뉴의 단일 소스. 랜딩 카드와 헤더 탭이 같은 목록을 참조하므로 여기만 고치면 된다.

// 이 저장소가 직접 운영하는 서비스. 등록 대기열은 아직 미구현이라 카드만 노출한다 —
// queue 서비스를 추가하면 disabled/badge 두 줄만 지우면 활성화된다.
export const services = [
  {
    name: "등록 대기열",
    desc: "팀 등록 접수 및 대기 현황",
    icon: "queue",
    href: "/queue",
    disabled: true,
    badge: "준비 중",
  },
];

// 별도로 운영되는 외부 서비스. 전부 새 탭으로 열린다.
export const externals = [
  { name: "에너지미터", desc: "실시간 전력 계측 모니터링", icon: "energy", href: "https://fsk-energymeter.luftaquila.io" },
  { name: "공지 알림봇", desc: "대회 공지 실시간 수신", icon: "notice", href: "https://ksae-notice.luftaquila.io" },
  { name: "AI 규정 챗봇", desc: "규정 질의응답", icon: "chatbot", href: "https://ksae-qna.luftaquila.io" },
  { name: "자작자동차포럼", desc: "커뮤니티", icon: "forum", href: "https://dnf.luftaquila.io" },
];

// 관리자 전용 메뉴 (auth 서비스 SPA). 랜딩 카드와 auth 헤더 탭이 공유한다.
// href = 허브 루트 기준 절대 경로(랜딩 카드용), route = auth SPA 내부 라우트 경로.
// auth는 route를 vite base와 합쳐 dev(base "/")와 프로덕션(base "/auth/") 양쪽에서 동작시킨다.
export const adminMenu = [
  { name: "계정 관리", desc: "오피셜·관리자 계정과 권한", icon: "users", href: "/auth", route: "/" },
  { name: "시스템 로그", desc: "전체 서비스 감사 로그", icon: "logs", href: "/auth/logs", route: "/logs" },
];
