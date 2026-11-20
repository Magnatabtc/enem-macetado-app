# Algoritmo de prioridade — Enem Macetado

O feed não é aleatório nem apenas cronológico. Cada questão recebe um score que combina o
peso que o aluno deu à matéria, a prioridade acumulada do tópico e o histórico daquela
questão. Erros repetidos no mesmo assunto aceleram a subida do tópico; acertos o trazem de
volta gradualmente.

## 1. Pesos do onboarding

No onboarding o aluno define, de 1 a 5, o quanto precisa evoluir em cada uma das 10 matérias.
Esse peso é a base do score:

```
subjectBase = weight × 10        // 10 a 50
```

Um peso 5 em Matemática vale 50 pontos de base; um peso 1 vale 10. O peso não muda sozinho:
ele representa a intenção declarada do aluno e é editável no perfil.

## 2. Score da questão

```
unseenBonus    = 12 se o aluno nunca respondeu esta questão, senão 0
recencyPenalty = -40 se respondeu nas últimas 6h
                 -8  se já respondeu alguma vez
                  0  se nunca respondeu
jitter         = rand() × 4

score = subjectBase + topic.priority + unseenBonus + recencyPenalty + jitter
```

O `jitter` evita que o feed seja idêntico a cada atualização. A penalidade de recência evita
repetir a mesma questão logo depois de respondida, mas permite revisão depois de algumas horas.

O `topic.priority` é a memória do algoritmo: começa em 0 e vive no intervalo [0, 100].

## 3. Atualização do tópico

### Errou

```
consecutive_wrong += 1
priority = min(100, priority + 15 + 10 × consecutive_wrong)

se consecutive_wrong >= 2:
    priority = 100
```

Exemplo com prioridade inicial 0:

| Evento | consecutive_wrong | priority |
|---|---|---|
| 1º erro | 1 | 25 |
| 2º erro seguido | 2 | 100 (regra de prioridade máxima) |
| 3º erro seguido | 3 | 100 |

Dois erros seguidos no mesmo assunto colocam o tópico no topo do feed. É intencional: o
produto aposta que corrigir o erro logo depois da primeira falha vale mais do que insistir
em conteúdo que o aluno já domina.

### Acertou

```
se consecutive_wrong > 0:
    priority = max(0, priority × 0.6 − 5)
senão:
    priority = max(0, priority − 6)

consecutive_wrong = 0
```

Continuando o exemplo:

| Evento | consecutive_wrong | priority |
|---|---|---|
| Acertou depois de 3 erros | 0 | 100 × 0.6 − 5 = 55 |
| Acertou de novo | 0 | 49 |
| Acertou de novo | 0 | 43 |

A queda é gradual de propósito. Um acerto isolado não prova domínio; três ou quatro acertos
consistentes é que tiram o tópico do topo. Um erro no meio do caminho zera a sequência e
volta a subir a prioridade.

### Prioridade máxima

```
is_priority = priority >= 80
```

A UI mostra o selo **prioridade máxima** para esses tópicos em `/progresso`.

## 4. Ordenação e fila

1. A API carrega todos os candidatos e as prioridades do aluno.
2. Calcula o score de cada candidato.
3. Ordena do maior para o menor (empate: id crescente, para manter o comportamento determinístico).
4. Mantém um cursor e um anel com os últimos 15 IDs servidos.
5. `Next(userID, limit)` percorre a lista ordenada, pulando IDs no anel enquanto houver
   alternativa; se o pool esgotar, reinicia o cursor e libera o anel.
6. O cache expira em 120s ou é invalidado quando o aluno responde ou salva o onboarding.

Isso garante que o aluno veja primeiro os tópicos que mais precisa, sem repetir a mesma
questão em sequência e sem uma consulta ao banco por swipe.

## 5. Streak diário

O streak é calculado no fuso `APP_TIMEZONE` (default `America/Sao_Paulo`):

| Situação | Novo streak |
|---|---|
| Primeira atividade | 1 |
| Já estudou hoje | mantém |
| Última atividade foi ontem | atual + 1 |
| Última atividade foi antes de ontem | 1 |
| Nunca estudou | 0 até a primeira resposta |

`best_streak` guarda o recorde. A meta diária (`daily_goal`, default 12) é contada por
tentativas registradas no dia; acertos aparecem separados na barra.

## 6. Complexidade

- Cálculo de score: O(n) por refresh, com n = número de questões candidatas.
- Ordenação: O(n log n), feita uma vez a cada 120s por aluno ativo.
- `Next`: O(limit) no caso comum.
- Escrita de tentativa: uma transação com três statements indexados.

Com 40 questões seed o custo é irrelevante. A estrutura suporta dezenas de milhares de
questões sem mudar o desenho; o limite prático passa a ser a memória do cache por usuário.

## 7. Onde está no código

- `backend/internal/feed/score.go` — constantes, score e atualização de prioridade.
- `backend/internal/feed/engine.go` — cache, cursor, anel de repetição e `Next`.
- `backend/internal/feed/*_test.go` — testes das regras acima.
- `backend/internal/store` — persistência transacional da tentativa.

Os testes cobrem explicitamente: dois erros seguidos → 100, acerto após erro → queda
gradual, streak ontem → +1, streak antigo → reset, fila sem repetição imediata.
