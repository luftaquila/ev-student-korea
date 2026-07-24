# Build landing page
FROM node:22-alpine AS landing-builder

WORKDIR /home/node/ev-landing

COPY landing/package*.json ./
RUN npm ci

COPY landing/src ./src
COPY landing/public ./public
COPY landing/index.html ./
COPY landing/vite.config.js ./

# 공용 모듈(@shared alias 대상)은 한 단계 위에 둔다 — vite.config.js가 ../shared를 가리킨다
COPY shared ../shared

RUN npm run build

# Final Caddy image
FROM docker.io/library/caddy:alpine

COPY landing/Caddyfile /etc/caddy/Caddyfile
COPY --from=landing-builder /home/node/ev-landing/dist /srv/landing

COPY landing/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

EXPOSE 9000
