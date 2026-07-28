#!/bin/sh
if [ "$(id -u)" -eq 0 ]; then
  chown -R node:node data 2>/dev/null || true
fi
# 런타임 환경변수를 정적 프론트엔드에 주입한다 (빌드 한 번, 배포 여러 번)
printf '%s\n' "window.__TEST_SERVER__ = ${TEST_SERVER:-false};" > web/dist/env-config.js

# bind mount 권한 정리와 런타임 설정 기록까지만 root로 수행하고, 실제 Node 프로세스는
# 이미지의 node 사용자로 내린다. 이미 비root로 시작된 환경에서는 그대로 실행한다.
if [ "$(id -u)" -eq 0 ]; then
  exec su-exec node:node "$@"
fi
exec "$@"
