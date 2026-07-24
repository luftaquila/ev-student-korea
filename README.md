# EV Student Korea Service Hub

EV 대회 운영 서비스 허브. https://ev.luftaquila.io

| 구성 | 설명 | 포트 |
|---|---|---|
| `landing/` | 허브 랜딩 페이지 + Caddy 리버스 프록시 게이트웨이 (Vue 3 + Caddy) | 9000 |
| `auth/` | Google 로그인 · 계정 관리 · 시스템 로그 (Express 5 + Vue 3) | 9100 |
| `queue/` | 등록 대기열 — **미구현** (랜딩에 `준비 중` 카드만) | 9300 (예약) |

외부 서비스는 랜딩에서 링크로만 연결한다: 에너지미터, 공지 알림봇, AI 규정 챗봇, 자작자동차포럼.

## 구조

```
브라우저 → Traefik (TLS, Host 라우팅) → Caddy :9000 ─┬─ /auth/* → auth:9100
                                                     └─ /*      → 랜딩 정적 파일
```

권한은 `official < admin` 2단계. 등록 대기열에서만 쓰이며 나머지 서비스는 모두 공개 링크다.
인증은 Google OAuth 2.0 + 자체 HMAC-SHA256 JWT 쿠키(`ev_session`), 역할은 매 요청 auth 서비스에
재검증한다(fail-close).

## 개발

```bash
# 의존성
cd auth && npm install && cd web && npm install && cd ../..
cd landing && npm install && cd ..

# 프론트 개발 서버 (HMR, /api 와 /auth/api 를 백엔드로 프록시)
cd auth/web && npm run dev      # :5173
cd landing && npm run dev       # :9000

# 백엔드 (프론트를 먼저 빌드해야 정적 파일이 서빙된다)
# 주의: `npm run build`는 프로덕션 base(/auth/)로 빌드하므로 :9100 직접 접속 시 자산이 404다.
# 백엔드에 직접 붙어 확인할 때는 base가 없는 dev 빌드를 쓴다.
cd auth/web && npm run build:dev && cd ..
JWT_SECRET=dev INTERNAL_SECRET=dev ADMIN_EMAIL=you@example.com node index.mjs

# 테스트
npm test
```

Google OAuth 없이 UI를 보려면 개발용 세션 쿠키를 직접 발급한다:

```bash
node -e 'import("./shared/express-setup.mjs").then(m=>console.log(m.createJWT({email:"you@example.com",name:"DEV",role:"admin"},"dev")))'
# 출력값을 브라우저 쿠키 ev_session 에, ev_user 에는 {"name":"DEV","role":"admin"} 를 URL 인코딩해 넣는다
```

## 배포

프로덕션은 **luftwolke의 k3s + Flux GitOps**다. compose는 로컬 확인용으로만 쓴다.

```
코드 push → GitHub Actions가 ghcr.io/luftaquila/ev-student-korea/{auth,caddy}:latest 빌드
         → Flux가 luftaquila/k3s 를 pull → luftwolke의 ev 네임스페이스에 반영
```

- 매니페스트: `luftaquila/k3s` → `clusters/luftwolke/apps/ev/`
- 시크릿: git이 아니라 `kubectl`로 주입한 `ev-secrets`(JWT_SECRET · INTERNAL_SECRET ·
  GOOGLE_CLIENT_SECRET). 비시크릿 설정은 `ev-config` ConfigMap.
- 데이터: `/home/k3s-data/ev/auth` hostPath (백업은 클러스터의 `stateful-backup` CronJob이 담당)
- TLS/DNS: Porkbun 와일드카드 인증서 + Traefik `TLSStore default`, `ev.luftaquila.io` CNAME은 이미 등록됨

같은 `:latest` 태그로 이미지를 새로 밀었을 때 반영: `kubectl -n ev rollout restart deploy/auth`
(또는 `deploy/caddy`). 자세한 규칙은 luftwolke의 `/srv/k3s/README.md`.

```bash
# 로컬 compose (선택)
cp .env.example .env    # 시크릿·Google OAuth 키 입력
make build && make deploy PROFILE=local   # http://localhost:9000
```

Google OAuth 클라이언트는 FSK와 공유하며, 승인된 리디렉션 URI에
`https://ev.luftaquila.io/auth/api/callback`이 등록되어 있어야 로그인이 동작한다.

자세한 내용은 `CLAUDE.md` 참고.
