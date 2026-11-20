# syntax=docker/dockerfile:1

# Build context: raiz do repositório (docker-compose usa context "." e
# dockerfile "frontend/Dockerfile").
FROM node:20-alpine AS build
WORKDIR /app

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
ENV COREPACK_INTEGRITY_KEYS=0
ENV CI=1

RUN corepack enable && corepack prepare pnpm@12.18.0 --activate

COPY frontend/package.json frontend/pnpm-lock.yaml frontend/pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY frontend/ ./
RUN pnpm build

FROM nginx:1.27-alpine AS runtime

COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
