# API — Enem Macetado

Base: `http://localhost:8099/api` (via Nginx) ou `http://localhost:8080/api` (API direta).
Todo JSON usa `snake_case`. Datas em ISO-8601. Erros têm o formato:

```json
{ "error": "mensagem legível" }
```

## Autenticação

As rotas autenticadas exigem:

```
Authorization: Bearer <jwt>
```

O token é um JWT HS256 com `sub` = id do usuário, validade de 30 dias. Senhas usam bcrypt;
o hash nunca sai do banco. Em caso de token ausente, inválido ou expirado: `401`.

## Rotas públicas

### `GET /api/health`

```json
{ "status": "ok", "db": "ok", "version": "0.1.0" }
```

Retorna `503` com `db: "down"` se o Postgres não responder.

### `POST /api/auth/register`

```json
{ "email": "aluno@exemplo.com", "password": "senha-forte", "name": "Ana" }
```

`201`:

```json
{
  "token": "eyJ...",
  "user": { "id": "uuid", "email": "aluno@exemplo.com", "name": "Ana" },
  "onboarded": false
}
```

- `400` e-mail inválido, senha com menos de 8 caracteres ou nome vazio.
- `409` e-mail já cadastrado.

### `POST /api/auth/login`

```json
{ "email": "demo@enem.app", "password": "demo1234" }
```

`200` com o mesmo shape do registro. `401` para credenciais inválidas.

### `POST /api/auth/guest`

Sem body. Cria um usuário novo (`Convidado`, pesos 3, sem onboarding) e devolve `200` com
`token`, `user` e `onboarded: false`. Útil para testar o produto sem cadastro.

## Rotas autenticadas

### `GET /api/me`

```json
{
  "user": { "id": "uuid", "email": "demo@enem.app", "name": "Aluno Demo" },
  "onboarded": true,
  "weights": {
    "matematica": 5, "portugues": 3, "biologia": 4, "quimica": 5, "fisica": 4,
    "historia": 3, "geografia": 3, "filosofia": 2, "sociologia": 2, "ingles": 3
  },
  "streak": { "current": 3, "best": 7, "last_active_date": "2026-11-20" },
  "daily": { "date": "2026-11-20", "answered": 4, "correct": 3, "goal": 12 }
}
```

Sempre retorna as 10 matérias em `weights` (default 3). `last_active_date` pode ser `null`.

### `PATCH /api/me`

```json
{ "name": "Ana Clara", "daily_goal": 20 }
```

Ambos opcionais. `daily_goal` entre 4 e 50. Resposta: `{"ok": true}`.

### `PUT /api/onboarding`

```json
{
  "weights": {
    "matematica": 5, "portugues": 3, "biologia": 4, "quimica": 5, "fisica": 4,
    "historia": 3, "geografia": 3, "filosofia": 2, "sociologia": 2, "ingles": 3
  }
}
```

Exige exatamente as 10 chaves, cada uma inteira de 1 a 5. Resposta:

```json
{ "ok": true, "onboarded": true, "weights": { "...": 3 } }
```

Invalida a fila do usuário para que o novo peso tenha efeito imediato.

### `GET /api/feed?limit=10`

`limit` entre 1 e 20 (default 10).

```json
{
  "questions": [
    {
      "id": "uuid",
      "subject": "matematica",
      "subject_label": "Matemática",
      "topic": "Função afim",
      "statement": "Uma empresa cobra R$ 40 fixos mais R$ 3 por unidade...",
      "alternatives": ["...", "...", "...", "...", "..."],
      "difficulty": 3
    }
  ],
  "generated_at": "2026-11-20T18:00:00Z"
}
```

Nunca inclui `correct_index` nem `explanation`.

### `POST /api/attempts`

```json
{ "question_id": "uuid", "selected_index": 2, "elapsed_ms": 18400, "mode": "feed" }
```

`200`:

```json
{
  "correct": true,
  "correct_index": 2,
  "explanation": "A função é f(x) = 40 + 3x; para 20 unidades, 100.",
  "topic": {
    "subject": "matematica",
    "topic": "Função afim",
    "priority": 38.5,
    "consecutive_wrong": 0,
    "is_priority": false
  },
  "streak": { "current": 4, "best": 7 },
  "daily": { "date": "2026-11-20", "answered": 5, "correct": 4, "goal": 12 }
}
```

- `400` índice fora de 0..4, `elapsed_ms` inválido ou questão inexistente.
- `404` questão não encontrada.
- A gravação é transacional: tentativa + prioridade do tópico + streak/meta.
- `elapsed_ms` é limitado a 0..3.600.000.

### `GET /api/progress`

```json
{
  "streak": { "current": 3, "best": 7, "last_active_date": "2026-11-20" },
  "daily": { "date": "2026-11-20", "answered": 5, "correct": 4, "goal": 12 },
  "totals": { "answered": 42, "correct": 30, "accuracy": 71.4 },
  "subjects": [
    {
      "subject": "matematica", "label": "Matemática", "weight": 5,
      "answered": 10, "correct": 6, "accuracy": 60.0, "avg_priority": 42.1
    }
  ],
  "weak_topics": [
    {
      "subject": "matematica", "topic": "Função afim", "priority": 100.0,
      "consecutive_wrong": 3, "correct": 1, "wrong": 4
    }
  ],
  "last14": [ { "date": "2026-11-07", "answered": 10, "correct": 7 } ]
}
```

Sempre retorna as 10 matérias e exatamente 14 dias (hoje + 13 anteriores), com zeros nos
dias sem atividade. `weak_topics` tem no máximo 8 itens com `priority > 0`.

## WebSocket do tutor

```
ws://localhost:8099/ws/tutor?token=<jwt>
```

O token também pode vir no header `Authorization` em clientes não-browser. O upgrade é
recusado com `401` se o JWT for inválido.

### Servidor → cliente

| Tipo | Payload | Quando |
|---|---|---|
| `ready` | `{"type":"ready","tutor":"local","stt":false,"tts":false}` | conexão aceita |
| `status` | `{"type":"status","status":"thinking"}` | pergunta recebida |
| `delta` | `{"type":"delta","text":"A "}` | streaming da resposta |
| `audio` | `{"type":"audio","mime":"audio/mpeg","data":"<base64>"}` | TTS habilitado |
| `done` | `{"type":"done","text":"resposta completa"}` | fim da resposta |
| `stt_fallback` | `{"type":"stt_fallback"}` | áudio sem STT no servidor |
| `error` | `{"type":"error","error":"..."}` | falha recuperável |
| `pong` | `{"type":"pong"}` | resposta ao ping |

### Cliente → servidor

| Tipo | Payload | Efeito |
|---|---|---|
| `start` | `{"type":"start","question_id":"uuid"}` | carrega o contexto da questão |
| `ask` | `{"type":"ask","text":"por que a resposta é B?"}` | pergunta em texto |
| `audio_chunk` | `{"type":"audio_chunk","mime":"audio/webm","data":"<base64>"}` | acumula áudio |
| `audio_end` | `{"type":"audio_end"}` | transcreve (se STT) e responde |
| `ping` | `{"type":"ping"}` | keepalive |

Exemplo de sessão:

```jsonc
// cliente
{"type":"start","question_id":"9b2f..."}
{"type":"ask","text":"Me explica a ideia de função afim"}

// servidor
{"type":"ready","tutor":"local","stt":false,"tts":false}
{"type":"status","status":"thinking"}
{"type":"delta","text":"Nessa "}
{"type":"delta","text":"questão, "}
{"type":"done","text":"Nessa questão, a taxa de variação é 3..."}
```

Detalhes de voz, STT e TTS em [VOICE.md](VOICE.md).

## Códigos de erro

| Código | Significado |
|---|---|
| `400` | body inválido, validação falhou ou índice fora do intervalo |
| `401` | token ausente/expirado ou credenciais inválidas |
| `404` | recurso inexistente |
| `409` | conflito (e-mail já cadastrado) |
| `429` | limite de requisições do Nginx (rotas de auth) |
| `500` | erro interno (logado no servidor) |
| `503` | banco indisponível no healthcheck |

## Exemplos com curl

```bash
BASE=http://localhost:8099

# convidado
TOKEN=$(curl -s -X POST $BASE/api/auth/guest | jq -r .token)

# onboarding
curl -s -X PUT $BASE/api/onboarding \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"weights":{"matematica":5,"portugues":3,"biologia":4,"quimica":5,"fisica":4,"historia":3,"geografia":3,"filosofia":2,"sociologia":2,"ingles":3}}'

# feed
curl -s "$BASE/api/feed?limit=5" -H "Authorization: Bearer $TOKEN" | jq

# responder a primeira questão
QID=$(curl -s "$BASE/api/feed?limit=1" -H "Authorization: Bearer $TOKEN" | jq -r '.questions[0].id')
curl -s -X POST $BASE/api/attempts -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"question_id\":\"$QID\",\"selected_index\":1,\"elapsed_ms\":12000}" | jq

# progresso
curl -s $BASE/api/progress -H "Authorization: Bearer $TOKEN" | jq
```
