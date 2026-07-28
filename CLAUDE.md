# CLAUDE.md

EV Student Korea Service Hub — EV 대회 운영을 위한 서비스 허브. 랜딩 게이트웨이, 인증 서비스,
등록 대기열 서비스로 구성된다.

## Architecture

| Service | Description | Port |
|---------|-------------|------|
| landing/ | 랜딩 페이지 + 리버스 프록시 게이트웨이 (Vue 3 + Caddy) | 9000 |
| auth/ | 인증·계정 관리·시스템 로그 (Express + Vue 3) | 9100 |
| queue/ | 등록 대기열 — 대기 등록·순서 조회·SMS 알림·엔트리 관리 | 9300 |

```
Traefik (TLS, Host(${DOMAIN_NAME})) → Caddy :9000 ─┬─ handle_path /auth/*  → auth:9100
                                                    ├─ handle_path /queue/* → queue:9300
                                                    └─ handle (catch-all) → /srv/landing
```

경로 기반 라우팅(서브도메인 아님). 백엔드는 `Dockerfile.service`(`ARG SERVICE`/`ARG PORT`)를
공유하고, 공용 모듈은 `shared/`에 둔다 — 백엔드는 `../shared/*.mjs`, 프론트는 Vite alias
`@shared`로 참조한다.

### 등록 대기열 (queue/)

학회 등록 줄 대체 서비스. formula-student-korea의 검차 대기열을 단순화한 구조로, 부스·우선순위·
재검 같은 개념 없이 단일 FIFO 대기열 하나만 운영한다.

- 흐름: 학생이 태블릿(`/register`, official 세션)에서 **엔트리 번호+전화번호**를 한 화면에서
  입력(번호를 넣으면 즉시 학교·팀을 표시해 오입력을 막는다) → 대기 N번째 진입 시 사전 안내 SMS
  → 오피셜이 `/manage`에서 호출(호출 SMS 발송) → 완료/취소.
- 공개 페이지 `/`: 엔트리 번호+전화번호 쌍으로 자기 순번·전체 대기 인원 조회 (rate limit 60/min/IP).
- **엔트리는 `번호 · 학교 · 팀`으로 구성**된다(entries 테이블 `num`/`school`/`team`, 학교는 생략
  가능). admin이 `/entries`에서 관리한다(`shared/nav-config.js`의 adminMenu에 등록됨). 대기
  등록은 엔트리 테이블에 있는 번호만 허용된다.
- 설정(settings 테이블, `/manage`에서 변경): `open`(접수), `sms`(알림), `notify_rank`(사전 안내
  순번, 0=끔). 문자 앞머리는 `SMS_PREFIX = "[EV]"`로 코드에 고정이다(설정 아님).
- SMS는 Naver Cloud SENS. credential은 env 4종(`NAVER_CLOUD_ACCESS_KEY` ·
  `NAVER_CLOUD_SECRET_KEY` · `NAVER_CLOUD_SMS_SERVICE_ID` · `PHONE_NUMBER_SMS_SENDER`)이며
  **FSK와 동일한 값**을 쓴다(FSK는 email 서비스 DB에 보관, EV는 env로 직접 주입). 하나라도
  없으면 SMS 없이 동작하고 설정 UI에 미설정 배지가 뜬다. 테스트는 `createQueueApp({ sendSms })`로
  발송을 가로챈다.

## Tech Stack

Frontend: Vue 3, Vite 7, Vue Router 4, vue-sonner · Backend: Node.js 22, Express 5, better-sqlite3
· Auth: Google OAuth 2.0, JWT(HMAC-SHA256) 쿠키, RBAC · Deploy: Docker/Podman Compose + Caddy +
외부 Traefik · Testing: `node:test` + `node:assert`

## Commands

```bash
# 프론트
cd {service}/web && npm run dev|build     # auth·queue (build는 프로덕션 base /<service>/)
cd {service}/web && npm run build:dev     # base 없음 — 백엔드에 직접 붙어 볼 때
cd landing && npm run dev|build           # landing

# 백엔드 (index.mjs는 create*App(options) 팩토리를 export하고 직접 실행 시에만 listen)
cd {service} && node index.mjs

# 로컬 compose (Makefile은 podman compose를 감싸고 dangling 이미지를 자동 정리)
make build                     # 로컬 빌드
make deploy PROFILE=local      # 로컬 (localhost:9000)
make restart                   # 재시작만
```

전제: podman machine, `.env`(최소 `JWT_SECRET`, `INTERNAL_SECRET`).

## Deployment — luftwolke k3s (GitOps)

프로덕션은 compose가 아니라 **luftwolke의 k3s + Flux**다. compose/Makefile은 로컬 확인용.

```
main push → GitHub Actions(build.yml) → ghcr.io/luftaquila/ev-student-korea/{auth,queue,caddy}:latest
          → Flux가 luftaquila/k3s pull → ev 네임스페이스 반영 (~1분)
```

- 매니페스트: `luftaquila/k3s` → `clusters/luftwolke/apps/ev/` (`namespace.yaml` ·
  `configmap.yaml` · `auth.yaml` · `queue.yaml` · `caddy.yaml` · `kustomization.yaml`)
- 외부 노출은 **caddy 하나뿐**. IngressRoute가 `Host(ev.luftaquila.io)` → `caddy:9000`,
  caddy가 `/auth/*` → `auth:9100`, `/queue/*` → `queue:9300`으로 프록시한다(compose와 동일한
  Caddyfile).
- 시크릿은 git에 없다. `ev-secrets`(JWT_SECRET · INTERNAL_SECRET · GOOGLE_CLIENT_SECRET ·
  NAVER_CLOUD_ACCESS_KEY · NAVER_CLOUD_SECRET_KEY · NAVER_CLOUD_SMS_SERVICE_ID ·
  PHONE_NUMBER_SMS_SENDER)를 `kubectl create secret`으로 주입하고 매니페스트는 `secretRef`만
  참조한다. FSK와 같은 값을 쓴다(SENS credential은 FSK email 서비스 설정과 동일).
- 비시크릿은 `ev-config` ConfigMap(NODE_ENV · TEST_SERVER · ADMIN_EMAIL · GOOGLE_CLIENT_ID ·
  PUBLIC_URL · DOMAIN_NAME).
- 데이터는 `/home/k3s-data/ev/{auth,queue}` hostPath. 전 앱 `runAsUser:0` +
  `seLinuxOptions: spc_t` 규칙.
- 같은 `:latest`로 이미지를 새로 밀었으면 `kubectl -n ev rollout restart deploy/auth`
  (또는 `deploy/queue`).
- 상태 확인: `flux get kustomizations` · `kubectl -n ev get pods`.

클러스터 전체 규칙(Flux·TLS·백업·로컬 빌드 검증 절차)은 luftwolke의 `/srv/k3s/README.md`가 권위.

## Auth & Inter-service

**역할**: `public < official < admin`. `shared/constants.js`의 `ROLE_LEVELS`가 단일 소스이며,
각 서비스는 `createApp(deps, authRoleFn)`에 경로→최소권한 매핑 함수를 넘긴다. `/api/*`는
default-close(매칭되지 않으면 최고 권한 요구), 비-API 경로는 401/403에서 `/`로 리다이렉트한다.

**쿠키**: `ev_session`(HttpOnly JWT, 7일, 6일 미만 남으면 자동 슬라이딩 갱신) / `ev_user`(프론트
표시용 `{name, role}`) / `ev_oauth_nonce`(OAuth CSRF, 10분). 이름은 `shared/express-setup.mjs`의
`COOKIE_SESSION`/`COOKIE_USER` 상수로만 참조한다.

**서비스 간 호출**은 `X-Internal-Service: ${INTERNAL_SECRET}` 헤더로 인증되며 자동 admin으로
취급된다. Caddy는 외부 요청에서 이 헤더와 `Authuser`를 제거한다. auth가 아닌 서비스는 매 요청
`AUTH_SERVER`의 `/api/users/role/:email`로 역할을 재검증한다(fail-close: 200만 유효, 404는 쿠키
삭제, 5xx/네트워크 장애는 요청만 거부하고 쿠키 보존).

## Testing

```bash
npm test              # 전체
npm run test:auth     # auth만
```

테스트는 `tests/<service>/<service>.test.mjs`, 유틸은 `tests/helpers/test-utils.mjs`.
`create*App({ dbPath })` 팩토리를 임시 DB로 직접 띄우므로 포트 충돌이 없다.
**코드 변경 시 테스트를 함께 추가·수정한다.**

## Logging Policy

모든 백엔드는 `shared/logger.mjs`의 `createLogger(db, serviceName)`을 사용한다. 로그는 서비스별
SQLite `logs` 테이블에 쌓이고 auth의 `GET /api/admin/logs`가 `LOG_SERVICES`를 팬아웃해 집계한다.

```js
logger.log(req, action, detail, target, actorOverride)    // level: info (성공)
logger.warn(req, action, detail, target, actorOverride)   // level: warn (실패·경고)
```

- `action`: `resource.operation` 점 구분 (예: `user.create`, `auth.rate_limit`)
- `target`: 영향받는 대상 식별자 (예: 이메일, `#123`)
- `detail`: 객체면 자동 JSON.stringify, 문자열은 그대로. null 허용
- `actorOverride`: 다른 사용자 대신 기록할 때 `{ email, name, role }`

### 필수 로깅 원칙

1. **모든 쓰기 작업(CUD)의 실패는 반드시 로깅한다.** `dbRun` 실패 시 에러 응답 전에 `logger.warn`:
   ```js
   const result = dbRun(() => { ... });
   if (!result.success) {
     logger.warn(req, "resource.operation", { error: result.error }, target);
     return res.status(result.status).send(result.error);
   }
   ```
   단, 핸들러 진입부의 단순 입력 검증 400(형식·누락)은 로깅 선택.
2. **같은 액션의 성공/실패는 레벨로 구분한다.** action 문자열은 같아도 성공은 `log`, 실패는 `warn`
   — 로그 뷰어에서 레벨 필터로 장애를 찾을 수 있어야 한다.
3. **catch 블록에서 `console.error` 대신 `logger.warn`을 쓴다.** `console.*`은 로그 뷰어에 안 보인다.
   서버 시작·마이그레이션 등 logger 사용 전 시점에만 허용.
4. **서비스 간 통신 실패는 반드시 로깅한다.** fetch 실패·타임아웃을 `logger.warn`으로 남긴다.
5. **파괴적 작업(삭제, 내부 API)은 성공·실패 모두 로깅한다.**
6. **detail에는 사람이 이해할 맥락을 누락 없이 담는다.** 실패는 `{ error: "..." }`, 성공은 변경된
   값·대상·조건. ID만 남기고 이름을 빠뜨리지 않는다.

## Design System

`shared/styles/`가 단일 소스: `tokens.css`(CSS 변수) → `base.css`(리셋·컴포넌트) →
`layout.css`(헤더·본문·푸터 골격). **라이트가 기본**(`:root`)이고 `[data-theme="dark"]`가 대안이다.

원칙: 실제 서비스처럼 보이는 절제된 UI. 장식적 요소(네온 액센트, 모노스페이스 대문자 라벨,
배경 텍스처, 글로우)를 쓰지 않는다.

- 폰트는 Pretendard(`--font-body`, cdn.jsdelivr.net — Caddyfile CSP에 허용됨). 모노스페이스
  (`--font-mono`)는 이메일·타임스탬프·코드 값에만 쓴다.
- 액센트는 파랑 `--accent-primary`(라이트 `#2f6fed` / 다크 `#5c8ffa`) 하나. 링크·주 버튼·
  활성 탭에만 쓰고 그 외에는 무채색을 유지한다.
- 깊이는 1px 보더 + 은은한 그림자(`--shadow-card`/`--shadow-hover`/`--shadow-modal`).
- 모서리는 `--radius`(8px, 버튼·입력) / `--radius-lg`(12px, 카드·패널·모달).
- UI 카피는 자연스러운 한국어로 쓴다. 영문 대문자 디스플레이 타이포를 쓰지 않는다.
- **이모지 아이콘 금지.** `shared/icons.js`의 stroke SVG를 `<AppIcon name="..." />`로 렌더한다.

## References

`.env.example`(환경변수), `README.md`(개요·배포). 참고 원본 프로젝트: `../formula-student-korea`.
