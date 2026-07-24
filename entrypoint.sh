#!/bin/sh
chown -R node:node data 2>/dev/null || true
# 런타임 환경변수를 정적 프론트엔드에 주입한다 (빌드 한 번, 배포 여러 번)
echo "window.__TEST_SERVER__ = ${TEST_SERVER:-false};" > web/dist/env-config.js
exec "$@"
