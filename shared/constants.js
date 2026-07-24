// 권한 계층. 숫자가 큰 쪽이 상위 권한이며, 게이트는 ROLE_LEVELS 비교로만 판단한다.
// EV 허브는 official/admin 2단계만 쓴다 — official은 등록 대기열 운영, admin은 그 위에
// 계정 관리와 시스템 로그까지. 역할을 추가할 일이 생기면 여기만 고치면 VALID_ROLES와
// 프론트 userStore의 파생 상태가 함께 따라온다.
export const ROLE_LEVELS = { official: 1, admin: 2 };
