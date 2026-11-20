# Build context is the repository root: docker build -f backend/Dockerfile .
FROM golang:1.22-alpine AS build

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /src
COPY backend/go.mod backend/go.sum ./
RUN go mod download

COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/api ./cmd/api

FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata wget \
    && addgroup -S app \
    && adduser -S -G app app

WORKDIR /app
COPY --from=build /out/api /app/api
COPY content/ /app/content/

ENV PORT=8080 \
    APP_TIMEZONE=America/Sao_Paulo \
    SEED_QUESTIONS_PATH=/app/content/questions.json

USER app
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
    CMD wget -qO- http://127.0.0.1:8080/api/health >/dev/null || exit 1

ENTRYPOINT ["/app/api"]
