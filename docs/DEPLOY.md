# Deploy em VPS Ubuntu

Guia para colocar o Enem Macetado no ar em uma VPS Ubuntu 22.04/24.04 com Docker.

## Requisitos

- Ubuntu 22.04 ou 24.04, 2 vCPU, 2 GB de RAM e 10 GB de disco (folga confortável).
- Docker Engine 24+ com o plugin `docker compose`.
- Domínio apontando para o IP da VPS (registro `A`), se for usar HTTPS.
- Portas 22, 80 e 443 liberadas. A porta 8099 é interna ao proxy.

## 1. Instalar Docker

```bash
sudo apt update
sudo apt install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
  | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" \
  | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Saia e entre de novo na sessão para o grupo `docker` valer.

## 2. Clonar e configurar

```bash
git clone https://github.com/Magnatabtc/enem-macetado-app.git
cd enem-macetado-app
cp .env.example .env
```

Edite `.env` e troque **obrigatoriamente**:

```env
POSTGRES_PASSWORD=uma-senha-longa-e-aleatoria
JWT_SECRET=outro-segredo-longo-e-aleatorio
```

Gere segredos com:

```bash
openssl rand -base64 48
```

O `DATABASE_URL` do Compose é montado a partir de `POSTGRES_*`; mudar a senha no `.env` já
atualiza a conexão. Só defina `DATABASE_URL` manualmente se a senha tiver caracteres
especiais (`@ : / ?`) ou se o banco for externo.

Para usar o tutor com LLM (opcional):

```env
OPENAI_API_KEY=sk-...
TUTOR_MODEL=gpt-4o-mini
STT_ENABLED=true
TTS_ENABLED=true
```

Sem chave, o tutor local continua funcionando.

## 3. Subir

```bash
docker compose up -d --build
docker compose ps
```

Verifique:

```bash
curl -fsS http://127.0.0.1:8099/api/health
curl -fsS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8099/
```

O primeiro build leva alguns minutos (Go + Vite). A API roda as migrações e o seed
automaticamente no boot. O usuário demo `demo@enem.app` / `demo1234` é criado no primeiro
start.

## 4. Publicar com HTTPS

O container `web` escuta em `8099`. Em produção, não exponha essa porta diretamente:
restrinja ao loopback com um override e coloque um proxy com TLS na frente.

`docker-compose.override.yml`:

```yaml
services:
  web:
    ports: !override
      - "127.0.0.1:8099:80"
```

### Opção A — Caddy (recomendado, TLS automático)

```bash
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile`:

```caddyfile
enem.seudominio.com {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8099
}
```

```bash
sudo systemctl reload caddy
```

O Caddy emite e renova o certificado sozinho. O WebSocket é encaminhado pelo
`reverse_proxy` sem configuração extra.

### Opção B — Nginx do host + certbot

```bash
sudo apt install -y nginx certbot python3-certbot-nginx
```

`/etc/nginx/sites-available/enem`:

```nginx
server {
    listen 80;
    server_name enem.seudominio.com;
    client_max_body_size 12m;

    location / {
        proxy_pass http://127.0.0.1:8099;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 3600s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/enem /etc/nginx/sites-enabled/enem
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d enem.seudominio.com
```

### Firewall

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Não abra 8099 nem 55432 para a internet.

## 5. Backup

O script `deploy/backup.sh` gera um dump comprimido do Postgres em `backups/`:

```bash
./deploy/backup.sh
```

Agende no cron (diário às 3h):

```cron
0 3 * * * cd /home/ubuntu/enem-macetado-app && ./deploy/backup.sh >> /var/log/enem-backup.log 2>&1
```

O script mantém 14 dias localmente. Copie os dumps para um storage externo — backup na mesma
VPS não protege contra perda do servidor.

Restaurar (pare a API antes para evitar escritas concorrentes):

```bash
docker compose stop api
docker compose exec -T db pg_restore -U enem -d enem --clean --if-exists < backups/enem-AAAAMMDD-HHMMSS.dump
docker compose start api
```

## 6. Atualizar

```bash
git pull
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:8099/api/health
```

As migrações são idempotentes e rodam no boot. O seed de questões só roda se a tabela
`questions` estiver vazia, então novas versões não duplicam conteúdo.

## 7. Operação

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f web
docker compose logs -f db
docker stats
```

- **API não sobe:** veja `docker compose logs api`; os erros mais comuns são senha do
  Postgres divergente ou `JWT_SECRET` vazio.
- **Health 503:** o Postgres ainda não aceitou conexões; aguarde o healthcheck ou verifique
  `docker compose logs db`.
- **WebSocket cai:** confirme que o proxy (Caddy/Nginx) repassa `Upgrade`/`Connection` e tem
  timeout alto. O Nginx do container já configura 3600s.
- **Porta 8099 ocupada:** ajuste o mapeamento no compose ou no override.
- **Seed não apareceu:** confirme que `content/questions.json` foi copiado para a imagem
  (`docker compose exec api ls /app/content`). O boot não falha se o arquivo estiver ausente.

## 8. Checklist de produção

- [ ] `JWT_SECRET` e `POSTGRES_PASSWORD` trocados por valores aleatórios.
- [ ] `.env` com permissão `600` e fora do git.
- [ ] HTTPS ativo e HTTP redirecionando para HTTPS.
- [ ] Portas 8099 e 55432 fechadas para a internet.
- [ ] Backup diário + cópia offsite testada.
- [ ] Logs com rotação (Docker já limita por tamanho se configurado; use `log-opts`).
- [ ] Monitoramento externo no `/api/health`.
- [ ] Limite de requisições nas rotas de autenticação (o Nginx já aplica `limit_req`).

## 9. Escala

Para mais tráfego:

1. Aumente as réplicas da API atrás de um balanceador com sticky session para WebSocket.
2. Troque o cache em memória por Redis se precisar de consistência imediata entre réplicas.
3. Considere um Postgres gerenciado e backups automáticos.
4. Separe o frontend em CDN e deixe a API apenas com `/api` e `/ws`.

O contrato da API não muda em nenhum desses passos.
