# Spec — Fila de questões erradas em Redis

**Status:** pronta para implementação (não implementada)
**Dono:** backend
**Última atualização:** 2026-11-20
**Client Go:** `github.com/redis/go-redis/v9`

> Correção importante: não existe `github.com/redis/go-redis/v8`. O módulo Go atual é o
> **v9**. A major do servidor Redis é outra coisa; este documento não fixa uma versão de
> servidor além da que o projeto já usa (hoje não há Redis no Compose, então a referência é
> `redis:7-alpine`).

## 1. Objetivo

Manter, por usuário, uma fila persistente das questões erradas, ordenada por prioridade, para
que o feed coloque a revisão dessas questões na frente das questões novas.

O Postgres continua sendo a **fonte da verdade** (tentativas, acertos, pesos e histórico). O
Redis é um **índice de prioridade reconstruível**: se cair ou perder dados, a API continua
funcionando e o feed usa o algoritmo atual.

### Não-objetivos

- Substituir o algoritmo de prioridade por tópico que já existe em `backend/internal/feed`.
- Guardar enunciado, alternativas ou gabarito no Redis.
- Criar um segundo cadastro de questões ou uma migration de conteúdo.
- Expor Redis fora da rede do Compose.

## 2. Estado atual e pontos de integração

| Peça | Arquivo | Papel |
|---|---|---|
| Registro da tentativa | `backend/internal/store/attempts.go` | `RecordAttempt` grava no Postgres em transação |
| Handler da resposta | `backend/internal/api/attempt_handlers.go` | valida, chama `RecordAttempt` e invalida o feed |
| Fila do feed | `backend/internal/feed/service.go` | cache em memória por usuário |
| Pesos do onboarding | `backend/internal/store/users.go` | tabela `subject_weights` |
| Feed HTTP | `backend/internal/api/feed_handlers.go` | `GET /api/feed` |
| Onboarding | `backend/internal/api/me_handlers.go` | `PUT /api/onboarding` |
| Config | `backend/internal/config/config.go` | variáveis de ambiente |

Hoje não existe Redis no `docker-compose.yml`. Esta spec adiciona o serviço e o client.

## 3. Modelo de dados no Redis

Todas as chaves são namespaced por usuário. O `{userID}` é hash tag para manter as chaves do
mesmo usuário no mesmo slot caso o Redis seja Cluster.

| Chave | Tipo | Conteúdo | TTL |
|---|---|---|---|
| `wrongq:v1:{userID}` | ZSET | `question_id` → score | 90 dias |
| `wrongq:v1:{userID}:streak` | HASH | `question_id` → erros consecutivos | 90 dias |
| `wrongq:v1:attempt:{attemptID}` | STRING | idempotência (`1`) | 24 horas |

Por que o HASH além do ZSET: o ZSET guarda apenas o score. Para o próximo erro é preciso saber
o streak atual, e derivar o streak de volta do score seria frágil (principalmente quando o peso
da matéria muda). O HASH é a memória do streak; o ZSET é a ordenação.

### Convenções

- `streak` é o número de **erros consecutivos daquela questão**. Não é o streak diário.
- `streak` é limitado a `10` (cap).
- `subject_weight` é o peso `1..5` do onboarding da matéria da questão (o `user_weight` da
  fórmula original); default `3`.
- Maior score = maior prioridade.
- Empates: o feed pode desempatar por `question_id` para ser determinístico.

> Se o produto quiser streak por tópico em vez de por questão, o desenho do ZSET não muda:
> o caller passa o streak do tópico e o rescore precisa atualizar todos os membros daquele
> tópico. A implementação inicial desta spec é por questão.

## 4. Fórmula do score

```
score = subject_weight * (1 + streak * 1.5)
```

Consequências:

| Erros consecutivos | Score |
|---|---|
| 1 | `2,5 × peso` |
| 2 | `4,0 × peso` |
| 3 | `5,5 × peso` |
| 10 (cap) | `16,0 × peso` |

- Peso 5, primeiro erro: `12,5`.
- Peso 5, segundo erro: `20,0`.
- Peso 5, cap: `80,0`.

O peso vem do Postgres (`subject_weights`), nunca do corpo da requisição. Se a matéria não
tiver peso salvo, use `3`.

## 5. Escrita

Toda escrita acontece **depois** do commit da tentativa no Postgres. O Redis é atualizado
depois; uma falha nele não pode reverter nem falhar a resposta HTTP.

### 5.1 Errou

Incrementar o streak, aplicar o cap, recalcular o score e gravar o membro no ZSET. Fazer tudo
em um único script Lua para não existir estado intermediário entre HASH e ZSET.

```lua
-- KEYS[1] = wrongq:v1:{userID}
-- KEYS[2] = wrongq:v1:{userID}:streak
-- KEYS[3] = wrongq:v1:attempt:{attemptID}
-- ARGV[1] = questionID
-- ARGV[2] = subject_weight
-- ARGV[3] = max_streak (10)
-- ARGV[4] = ttl_seconds (7776000 = 90d)

-- Idempotência: se a tentativa já foi processada, não incrementa de novo.
if redis.call('SET', KEYS[3], '1', 'NX', 'EX', 86400) == false then
  return {-1, '0'}
end

local streak = redis.call('HINCRBY', KEYS[2], ARGV[1], 1)
local max = tonumber(ARGV[3])
if streak > max then
  streak = max
  redis.call('HSET', KEYS[2], ARGV[1], streak)
end

local score = tonumber(ARGV[2]) * (1 + streak * 1.5)
redis.call('ZADD', KEYS[1], score, ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[4])
return {streak, tostring(score)}
```

O handler deve chamar `RecordAttempt` primeiro. Se o script falhar, registrar log estruturado e
seguir com a resposta normal; a fila será repopulada pelos próximos erros ou por rebuild.

### 5.2 Acertou

Acerto reduz a prioridade gradualmente, não remove na hora. O streak cai 1; quando chega a 0,
a questão sai do ZSET e do HASH.

```lua
-- KEYS[1] = wrongq:v1:{userID}
-- KEYS[2] = wrongq:v1:{userID}:streak
-- ARGV[1] = questionID
-- ARGV[2] = subject_weight
-- ARGV[3] = ttl_seconds

local raw = redis.call('HGET', KEYS[2], ARGV[1])
if not raw then
  return 0
end

local streak = tonumber(raw) - 1
if streak <= 0 then
  redis.call('ZREM', KEYS[1], ARGV[1])
  redis.call('HDEL', KEYS[2], ARGV[1])
  if redis.call('ZCARD', KEYS[1]) == 0 then
    redis.call('DEL', KEYS[1], KEYS[2])
  end
  return 0
end

redis.call('HSET', KEYS[2], ARGV[1], streak)
local score = tonumber(ARGV[2]) * (1 + streak * 1.5)
redis.call('ZADD', KEYS[1], score, ARGV[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return streak
```

Exemplo: dois erros → streak 2 / score `4 × peso`; um acerto → streak 1 / `2,5 × peso`; outro
acerto → remove.

### 5.3 Peso alterado no onboarding

`PUT /api/onboarding` já invalida a fila em memória (`feed.Invalidate`). Também deve chamar
`wrongqueue.RescoreUser(ctx, userID)`: ler o HASH de streaks, buscar as matérias das questões e
recalcular o score com os novos pesos em pipeline. Sem isso, o ZSET fica com score antigo até o
próximo erro.

### 5.4 Idempotência

A chave `wrongq:v1:attempt:{attemptID}` evita que um retry do mesmo evento incremente o streak
duas vezes. O `attemptID` deve ser o id da linha em `attempts` (bigserial), não um timestamp.
Para expor esse id sem mudar o contrato público:

- adicionar `AttemptID int64` em `model.AttemptResult` (uso interno);
- no `INSERT` de `attempts`, usar `RETURNING id` e preencher o campo;
- o DTO HTTP de `/api/attempts` continua exatamente como está.

### 5.5 Redis indisponível

A resposta de `POST /api/attempts` não pode depender do Redis. O fluxo correto é:

1. Postgres commit OK.
2. Tentar atualizar a fila no Redis com timeout curto.
3. Se falhar, logar `wrongqueue_redis_error`, incrementar métrica (se existir) e responder
   normalmente.
4. O feed cai no algoritmo atual; a fila é reconstruível a partir de `attempts`.

## 6. Leitura e integração com o feed

### 6.1 Consulta

```
ZREVRANGE wrongq:v1:{userID} 0 <limit-1> WITHSCORES
```

Retorna os maiores scores primeiro. Para cada id, o handler busca a questão no Postgres
(`store.QuestionsByIDs`) preservando a ordem do ZSET. O Redis não guarda enunciado nem
alternativas.

### 6.2 Merge no `GET /api/feed`

1. Buscar até `limit` questões erradas de maior score.
2. Buscar o lote normal em `feed.Service.Next`.
3. Deduplicar por `question_id`.
4. Retornar as erradas primeiro e completar o restante com o feed normal, respeitando `limit`.
5. Nunca enviar `correct_index` ou `explanation` no feed.

Se a fila tiver `>= limit` itens, o lote pode ser só de erradas. Se o Redis estiver vazio ou
indisponível, retornar apenas o feed atual, sem erro 500.

### 6.3 Repetição imediata

O feed não deve devolver a mesma questão errada duas vezes seguidas se houver outras
disponíveis. Reutilizar o mecanismo de recência existente; se não houver, usar um marcador
temporário `wrongq:v1:{userID}:served:{questionID}` com TTL de 10 minutos e pular para o
próximo membro. O marcador é só uma ajuda de UX; não substitui o ZSET.

## 7. Infraestrutura e configuração

Adicionar ao `docker-compose.yml`:

```yaml
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes"]
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10
    # sem ports: acesso apenas pela rede interna do Compose
```

- `api.depends_on` deve incluir `redis` com `condition: service_healthy`.
- Volume nomeado `redisdata`.
- Não publicar a porta do Redis.

Variáveis novas em `config.Config` e `.env.example`:

```env
REDIS_URL=redis://redis:6379/0
REDIS_PASSWORD=
REDIS_DB=0
WRONGQ_TTL=2160h
REDIS_DIAL_TIMEOUT=500ms
REDIS_READ_TIMEOUT=1s
REDIS_WRITE_TIMEOUT=1s
```

- `REDIS_URL` vazio é permitido: a API sobe em modo degradado, sem fila Redis.
- No boot, fazer `PING` com timeout curto e logar `wrongqueue_disabled` se falhar.
- Fechar o client no shutdown.
- Pool pequeno é suficiente (`PoolSize` entre 10 e 20); a fila é leve.

## 8. Estrutura de código sugerida

```
backend/internal/wrongqueue/
├── client.go      # conexão, config, ping, close
├── store.go       # RecordWrong, RecordCorrect, Top, RescoreUser
├── scripts.go     # go:embed dos .lua ou consts
├── types.go
└── store_test.go
```

- `wrongqueue.Store` recebe `*redis.Client` e `*store.Store` (para pesos e questões) via injeção.
- Adicionar ao `api.Deps` um campo `WrongQueue *wrongqueue.Store`.
- Chamar no `handleAttempt` depois de `RecordAttempt` e antes/depois de `feed.Invalidate`.
- No `handleFeed`, tentar o merge; se o serviço for nil ou falhar, seguir com `feed.Next`.

## 9. Testes

### 9.1 Unitários (sem Docker)

Usar `github.com/alicebob/miniredis/v2` em `internal/wrongqueue`. Casos mínimos:

1. Primeiro erro grava streak 1 e score `2,5 × peso`.
2. Segundo erro grava streak 2 e score `4 × peso`.
3. Terceiro erro consecutivo continua subindo; cap em 10.
4. Acerto depois de erro cai 1 e mantém na fila enquanto streak > 0.
5. Acerto que zera o streak remove do ZSET e do HASH.
6. `ZREVRANGE` devolve o maior score primeiro.
7. Mesmo `attemptID` duas vezes = um único incremento (idempotência).
8. Concorrência: N goroutines no mesmo usuário não perdem atualização.
9. Redis fora: `RecordWrong` retorna erro, mas o fluxo da tentativa não falha.
10. `RescoreUser` aplica o peso novo e mantém a ordem.
11. Merge do feed deduplica e não vaza gabarito.

### 9.2 Integração (Redis real)

Com build tag `integration` e `testcontainers-go` ou o serviço Redis do CI:

- executar os mesmos cenários com `EVAL`/`EVALSHA` reais;
- validar TTL de 90 dias (ou TTL menor injetado para o teste);
- validar que as duas chaves têm o mesmo hash tag e caem no mesmo slot (se Cluster).

### 9.3 Comandos

```bash
go mod tidy
go test ./... -count=1
go test -race ./... -count=1
go vet ./...
go build ./...

# integração
docker compose up -d redis
REDIS_URL=redis://127.0.0.1:6379/0 go test -tags=integration ./... -count=1
```

### 9.4 CI

Adicionar um service `redis:7-alpine` com healthcheck ao job de backend e rodar também o teste
com `-tags=integration`. O job atual de backend continua rodando os unitários sem Redis.

## 10. Critérios de aceite

- [ ] `github.com/redis/go-redis/v9` no `go.mod`; nenhuma referência a `go-redis/v8`.
- [ ] Redis no Compose com healthcheck, volume e sem porta pública.
- [ ] ZSET e HASH criados/atualizados atomicamente por Lua.
- [ ] Fórmula `peso × (1 + streak × 1,5)`, cap 10, primeiro erro em `2,5 × peso`.
- [ ] Acerto decrementa 1; remove só quando o streak chega a 0.
- [ ] Duas respostas erradas na mesma questão aumentam o score e ela vem antes no feed.
- [ ] `GET /api/feed` mantém o contrato, deduplica e não vaza gabarito.
- [ ] `attemptID` idempotente; retry não incrementa duas vezes.
- [ ] Redis indisponível não derruba `POST /api/attempts`; feed cai no fallback.
- [ ] `PUT /api/onboarding` recalcula os scores.
- [ ] Testes unitários, `-race`, `go vet` e `go build` verdes.
- [ ] Testes de integração com Redis real verdes no CI.
- [ ] README/docs atualizados com chaves, fórmula e comandos.

## 11. Prompt para o Devin

Copiar o bloco abaixo para o bot, trocando apenas `REPO_URL` e `BRANCH`.

```text
Você é um engenheiro Go sênior no repositório <REPO_URL>, branch <BRANCH>.

Leia primeiro docs/REDIS_SPEC.md inteiro e os arquivos que ele cita:
backend/internal/api/attempt_handlers.go, backend/internal/store/attempts.go,
backend/internal/feed/service.go, backend/internal/api/feed_handlers.go,
backend/internal/config/config.go e docker-compose.yml.

Implemente exatamente o escopo de docs/REDIS_SPEC.md. Não reescreva a arquitetura,
não altere o contrato público dos endpoints e não invente versões de biblioteca.

REGRAS
- Client obrigatório: github.com/redis/go-redis/v9. NÃO usar go-redis/v8.
- Rode `go get github.com/redis/go-redis/v9@latest` e deixe o go.mod/go.sum
  registrarem a versão real. Não chute versão.
- Postgres é a fonte da verdade; Redis é índice. Falha do Redis não pode falhar
  POST /api/attempts.
- Use Lua para atualizar HASH + ZSET atomicamente, com idempotência por attemptID.
- Preserve o feed e os testes atuais; adicione a fila de erradas como prioridade
  antes do feed normal, com fallback quando o Redis estiver vazio/indisponível.
- Se o repo divergir do descrito, adapte a implementação e registre a decisão no
  PR; não invente API, tabela ou versão.

ENTREGÁVEIS
1. Serviço Redis no docker-compose com healthcheck/volume e sem porta pública.
2. Pacote backend/internal/wrongqueue com RecordWrong, RecordCorrect, Top e
   RescoreUser, usando go-redis/v9 e scripts Lua.
3. Integração no handler de tentativa, no feed e no onboarding.
4. Config/env e README/docs atualizados.
5. Testes unitários com miniredis e teste de integração com Redis real
   (build tag `integration`), incluindo concorrência e idempotência.
6. PR pequeno, commits descritivos e a saída real dos comandos no corpo:
   go test ./... -count=1
   go test -race ./... -count=1
   go vet ./...
   go build ./...
   REDIS_URL=redis://127.0.0.1:6379/0 go test -tags=integration ./... -count=1

CRITÉRIOS DE ACEITE
- Fórmula do score e cap exatamente como docs/REDIS_SPEC.md.
- Dois erros consecutivos aumentam a prioridade e a questão vem antes no feed.
- Acerto decrementa; remove só ao zerar.
- Redis fora não derruba a API; feed usa fallback.
- Nenhum endpoint existente quebra; testes atuais continuam passando.
```

## 12. Rollout e rollback

1. Subir o Redis e a API com `REDIS_URL` configurada; validar `/api/health`.
2. Ativar a fila primeiro para um usuário de teste; conferir `ZREVRANGE` e o feed.
3. Liberar geral; monitorar erros de Redis e latência do `POST /api/attempts`.
4. Rollback: remover `REDIS_URL` do ambiente da API. O modo degradado ignora a fila e o
   feed continua com o algoritmo atual; nenhum dado do Postgres é perdido.
