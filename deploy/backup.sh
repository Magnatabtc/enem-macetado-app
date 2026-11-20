#!/usr/bin/env bash
#
# Backup lógico do PostgreSQL do Enem Macetado.
#
# Gera backups/enem-YYYYmmdd-HHMMSS.dump em formato custom (-Fc, restore com
# pg_restore), valida o arquivo e remove dumps com mais de RETENTION_DAYS dias.
#
# Uso:
#   ./deploy/backup.sh
#   BACKUP_DIR=/mnt/backups RETENTION_DAYS=30 ./deploy/backup.sh
#
# Requer a stack no ar (serviço db rodando) e docker compose v2.

set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-${ROOT_DIR}/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

cd "$ROOT_DIR"

# Mesmas variáveis que o compose usa; .env é opcional (há defaults).
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

POSTGRES_USER="${POSTGRES_USER:-enem}"
POSTGRES_DB="${POSTGRES_DB:-enem}"
read -r -a COMPOSE_CMD <<< "${COMPOSE:-docker compose}"

# Dumps contêm dados de usuários: nada de leitura por outros usuários do host.
umask 077

mkdir -p "$BACKUP_DIR"

stamp="$(date +%Y%m%d-%H%M%S)"
target="${BACKUP_DIR}/enem-${stamp}.dump"
tmp="${target}.partial"

cleanup() {
  rm -f "$tmp"
}
trap cleanup EXIT

echo "==> pg_dump de '${POSTGRES_DB}' (usuário '${POSTGRES_USER}')"
"${COMPOSE_CMD[@]}" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc >"$tmp"

size="$(wc -c <"$tmp" | tr -d '[:space:]')"
if [[ -z "$size" || "$size" -le 0 ]]; then
  echo "erro: dump vazio; nada foi salvo" >&2
  exit 1
fi

# Assinatura do formato custom do pg_dump: evita salvar saída de erro como dump.
if [[ "$(head -c 5 "$tmp")" != "PGDMP" ]]; then
  echo "erro: arquivo gerado não é um dump custom válido (-Fc)" >&2
  exit 1
fi

mv "$tmp" "$target"
trap - EXIT

echo "==> retenção: removendo dumps com mais de ${RETENTION_DAYS} dias"
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'enem-*.dump' \
  -mtime +"$RETENTION_DAYS" -print -delete

echo "backup ok: $(du -h "$target" | cut -f1) em ${target}"
printf '%s\n' "$target"
