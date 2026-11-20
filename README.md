# Enem Macetado

**Estude para o ENEM no ritmo do feed.** Questões em tela cheia, um swipe por vez, tutor por
voz em tempo real e um algoritmo que aprende com os seus erros para colocar no topo
exatamente o assunto que você precisa revisar.

[![CI](https://github.com/Magnatabtc/enem-macetado-app/actions/workflows/ci.yml/badge.svg)](https://github.com/Magnatabtc/enem-macetado-app/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-C8FF4D.svg)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.22-00ADD8?logo=go&logoColor=white)](backend)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](frontend)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](docker-compose.yml)

![Feed do Enem Macetado](docs/screenshots/feed.png)

## O que é

- **Feed vertical estilo TikTok/Reels** — uma questão por tela, swipe, teclado ou botão.
  Timer sutil de 60s, feedback imediato e explicação depois da resposta.
- **Tutor por voz** — fale com o tutor pelo microfone; a resposta volta em texto streaming e
  em áudio. Funciona sem chave de API no modo local determinístico e pode usar um LLM
  compatível com OpenAI quando configurado.
- **Algoritmo de prioridade** — o onboarding define o peso de cada matéria; erros seguidos no
  mesmo tópico levam a prioridade ao máximo; acertos reduzem a prioridade gradualmente.
- **Streak e meta diária** — barra de progresso, chama de sequência e painel de evolução por
  matéria e por tópico.
- **Stack completa e reproduzível** — React + TypeScript + Tailwind, API Go, PostgreSQL 16,
  WebSocket, Nginx e Docker Compose.

## Demo

O app sobe com um usuário de demonstração já com histórico:

| E-mail | Senha |
|---|---|
| `demo@enem.app` | `demo1234` |

Também é possível entrar como convidado em um clique, sem cadastro.

```bash
git clone https://github.com/Magnatabtc/enem-macetado-app.git
cd enem-macetado-app
docker compose up -d --build
```

Abra **http://localhost:8099**. O primeiro boot cria o banco, roda as migrações, importa as
40 questões seed e monta o usuário demo. Não é necessário criar `.env` para testar.

> Requisitos: Docker Engine 24+ com `docker compose`. O build inicial leva alguns minutos.

## Telas

| Onboarding | Feed respondido |
|---|---|
| ![Onboarding](docs/screenshots/onboarding.png) | ![Feedback](docs/screenshots/feedback.png) |

| Progresso | Tutor por voz |
|---|---|
| ![Progresso](docs/screenshots/progresso.png) | ![Tutor](docs/screenshots/tutor.png) |

## Como funciona

### 1. Onboarding

Você diz, de 1 a 5, o quanto precisa evoluir em cada uma das 10 matérias. Isso vira a base do
score de prioridade. Os pesos são editáveis depois, no perfil.

### 2. Feed priorizado

Cada questão recebe:

```
score = peso_da_matéria × 10
      + prioridade_do_tópico      // 0..100
      + bônus_de_inédita          // +12
      + penalidade_de_recência    // -40 (6h) / -8 (já respondida)
      + jitter                    // 0..4
```

A fila é montada em memória por usuário, com cache de 120s e um anel dos últimos 15 IDs para
não repetir questão em sequência. Responder invalida a fila e o próximo lote já reflete o novo
estado.

### 3. Erro vira prioridade

- Errou: `prioridade += 15 + 10 × erros_seguidos`.
- **2 erros seguidos no mesmo assunto:** prioridade = **100** (topo do feed).
- Acertou depois de errar: `prioridade = prioridade × 0,6 − 5`, caindo aos poucos.
- Acertou sem sequência de erro: `prioridade = max(0, prioridade − 6)`.

A lógica completa, com exemplos numéricos e testes, está em
[docs/ALGORITHM.md](docs/ALGORITHM.md).

### 4. Tutor por voz

O microfone abre um canal WebSocket autenticado. O navegador transcreve a fala (Web Speech
API em pt-BR) e envia a pergunta; a API responde em streaming e o navegador fala a resposta.

- **Sem chave:** tutor local monta a explicação a partir do enunciado, alternativas, gabarito
  e explicação da questão.
- **Com `OPENAI_API_KEY`:** chat completions com streaming, com fallback automático para o
  modo local. STT (whisper) e TTS no servidor são opcionais.

Detalhes em [docs/VOICE.md](docs/VOICE.md).

## Stack

| Camada | Tecnologia |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 3, React Router, lucide-react |
| API | Go 1.22, `net/http`, pgx/v5, JWT, bcrypt, gorilla/websocket |
| Banco | PostgreSQL 16, migrações idempotentes no boot |
| Infra | Docker Compose, Nginx (SPA + proxy reverso), healthchecks, CI no GitHub Actions |
| Voz | Web Speech API, MediaRecorder, speechSynthesis; OpenAI opcional |

## Arquitetura

```mermaid
flowchart LR
    U[Aluno] -->|HTTPS| N[Nginx :8099]
    N --> SPA[React SPA]
    N -->|/api| API[Go API :8080]
    N -->|/ws/tutor| API
    API --> DB[(PostgreSQL 16)]
    API -. opcional .-> LLM[OpenAI]
```

O conteúdo estático e o proxy vivem no mesmo container Nginx. A API é stateless para REST e
mantém a fila do feed em memória. O Postgres não é exposto publicamente. Mais em
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## API

| Método | Rota | Descrição |
|---|---|---|
| `GET` | `/api/health` | Healthcheck com ping no banco |
| `POST` | `/api/auth/register` | Cadastro |
| `POST` | `/api/auth/login` | Login |
| `POST` | `/api/auth/guest` | Sessão de convidado |
| `GET` | `/api/me` | Perfil, pesos, streak e meta |
| `PATCH` | `/api/me` | Nome e meta diária |
| `PUT` | `/api/onboarding` | Salva os 10 pesos |
| `GET` | `/api/feed` | Próximas questões priorizadas |
| `POST` | `/api/attempts` | Registra resposta e recebe correção |
| `GET` | `/api/progress` | Estatísticas por matéria/tópico e 14 dias |
| `WS` | `/ws/tutor` | Tutor por voz em tempo real |

Contrato completo, exemplos de request/response e protocolo WebSocket em
[docs/API.md](docs/API.md).

## Banco de dados

- `users` e `subject_weights` — conta e pesos do onboarding.
- `questions` — enunciado, alternativas (JSONB), gabarito, matéria, tópico, dificuldade e explicação.
- `attempts` — histórico append-only de respostas com tempo e origem.
- `topic_stats` — prioridade, sequência de erros e acertos por tópico.
- `user_stats` — streak, recorde, meta diária e totais.

O gabarito nunca é enviado pelo `/api/feed`; ele só aparece na resposta de `/api/attempts`,
depois que a tentativa foi registrada.

## Rodando em desenvolvimento

```bash
# banco
docker compose up -d db

# API (terminal 1)
cd backend
DATABASE_URL='postgres://enem:enem_dev_password@127.0.0.1:55432/enem?sslmode=disable' \
JWT_SECRET=dev-secret \
SEED_QUESTIONS_PATH=../content/questions.json \
go run ./cmd/api

# frontend (terminal 2)
cd frontend
pnpm install
pnpm dev
```

O Vite roda em `http://localhost:5173` e faz proxy de `/api` e `/ws` para `127.0.0.1:8080`.

## Testes

```bash
# backend
cd backend && go test ./... && go vet ./...

# frontend
cd frontend && pnpm build

# tudo pelo Makefile
make test
```

O CI roda os mesmos passos em cada push para `main`, além de validar o Compose.

## Deploy

O guia completo para VPS Ubuntu (Docker, TLS com Caddy ou Nginx + certbot, backup, atualização
e checklist de segurança) está em [docs/DEPLOY.md](docs/DEPLOY.md).

Resumo:

```bash
cp .env.example .env        # troque JWT_SECRET e POSTGRES_PASSWORD
docker compose up -d --build
curl -fsS http://127.0.0.1:8099/api/health
```

## Estrutura do repositório

```
backend/        API Go: auth, feed em memória, tentativas, progresso, WebSocket
frontend/       React + Vite + Tailwind: auth, onboarding, feed, tutor, progresso
content/        40 questões seed em JSON
deploy/         Nginx do container, backup
docs/           Arquitetura, algoritmo, API, voz e deploy
```

## Configuração

Todas as variáveis estão documentadas em [`.env.example`](.env.example). As principais:

| Variável | Default | Descrição |
|---|---|---|
| `JWT_SECRET` | dev | Assinatura dos tokens — troque em produção |
| `POSTGRES_PASSWORD` | enem_dev_password | Senha do banco — troque em produção |
| `APP_TIMEZONE` | America/Sao_Paulo | Fuso de streak e meta diária |
| `OPENAI_API_KEY` | vazio | Ativa o tutor com LLM |
| `STT_ENABLED` / `TTS_ENABLED` | false | Transcrição e fala no servidor |
| `SEED_QUESTIONS_PATH` | /app/content/questions.json | Caminho do seed |

## Limites e próximos passos

- O catálogo inicial tem 40 questões; a API e o algoritmo suportam um catálogo muito maior.
- A fila em memória é por instância; para múltiplas réplicas, o próximo passo é Redis.
- O Web Speech API tem melhor suporte em Chrome/Edge; em outros navegadores o tutor cai para
  texto ou para o STT do servidor, se habilitado.
- Logout é stateless (o token expira em 30 dias); revogação exigiria uma lista de bloqueio.

## Licença

MIT © 2026 Magnatabtc. Veja [LICENSE](LICENSE).
