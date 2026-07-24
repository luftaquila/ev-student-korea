#!/bin/sh
# 빌드는 한 번, 배포는 여러 번이므로 런타임 환경변수는 정적 파일로 주입한다.
echo "window.__TEST_SERVER__ = ${TEST_SERVER:-false};" > /srv/landing/env-config.js
exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile
