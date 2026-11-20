package tutor

import (
	"context"
	"fmt"
	"strings"
	"time"
)

// Local is the deterministic, offline tutor.
type Local struct {
	// ChunkDelay is the pause between streamed words (30ms in production).
	ChunkDelay time.Duration
}

// NewLocal returns a local tutor with the production streaming cadence.
func NewLocal() *Local {
	return &Local{ChunkDelay: 30 * time.Millisecond}
}

// Stream composes an answer and streams it word by word.
func (l *Local) Stream(ctx context.Context, req Request, onDelta EmitFunc) (string, error) {
	text := clampWords(l.compose(req))
	if onDelta == nil {
		return text, nil
	}
	words := strings.Fields(text)
	for i, word := range words {
		if err := ctx.Err(); err != nil {
			return text, err
		}
		chunk := word
		if i < len(words)-1 {
			chunk += " "
		}
		if err := onDelta(chunk); err != nil {
			return text, err
		}
		if l.ChunkDelay > 0 {
			timer := time.NewTimer(l.ChunkDelay)
			select {
			case <-ctx.Done():
				timer.Stop()
				return text, ctx.Err()
			case <-timer.C:
			}
		}
	}
	return text, nil
}

func (l *Local) compose(req Request) string {
	if req.Question == nil {
		return freeAnswer(req.UserText)
	}
	q := req.Question
	lowered := strings.ToLower(req.UserText)

	var b strings.Builder
	fmt.Fprintf(&b, "Vamos destrinchar %s, em %s. ", q.Topic, subjectLabel(q))

	if q.LastAttempt != nil {
		if q.LastAttempt.Correct {
			b.WriteString("Você já acertou esta questão; agora o foco é consolidar o raciocínio. ")
		} else if q.LastAttempt.SelectedIndex >= 0 && q.LastAttempt.SelectedIndex < len(q.Alternatives) {
			fmt.Fprintf(&b, "Na sua última tentativa você marcou a letra %s; o gabarito é a letra %s. ",
				Letter(q.LastAttempt.SelectedIndex), Letter(q.CorrectIndex))
		}
	}

	if q.CorrectIndex >= 0 && q.CorrectIndex < len(q.Alternatives) {
		fmt.Fprintf(&b, "A alternativa correta é a letra %s: “%s”. ", Letter(q.CorrectIndex), q.Alternatives[q.CorrectIndex])
	}
	if explanation := strings.TrimSpace(q.Explanation); explanation != "" {
		fmt.Fprintf(&b, "O motivo é este: %s ", explanation)
	}

	switch {
	case strings.Contains(lowered, "dica"):
		b.WriteString("Dica prática: leia o comando até o fim, sublinhe o que é pedido e elimine as alternativas que contradizem o texto. ")
	case strings.Contains(lowered, "passo"), strings.Contains(lowered, "resolver"), strings.Contains(lowered, "conta"):
		fmt.Fprintf(&b, "Resolução enxuta: primeiro destaque os dados do enunciado, depois aplique o conceito de %s e, por fim, confira unidades e sinais. ", q.Topic)
	case strings.Contains(lowered, "por que"), strings.Contains(lowered, "porque"), strings.Contains(lowered, "explica"):
		fmt.Fprintf(&b, "Repare que o enunciado cobra exatamente o conceito de %s; a explicação acima é o caminho mais curto até o gabarito. ", q.Topic)
	}

	b.WriteString("Quer tentar outra questão ou prefere que eu repita o ponto central?")
	return b.String()
}

func freeAnswer(userText string) string {
	snippet := shortSnippet(userText, 80)
	if snippet == "" {
		return "Ainda não recebi o contexto de uma questão. Abra uma questão no feed e me envie start; aí eu explico o gabarito usando o enunciado e a explicação. Dica geral: comece pelo comando, elimine alternativas absurdas e revise os tópicos em que você erra duas vezes seguidas."
	}
	return fmt.Sprintf("Sobre “%s”: ainda estou sem o enunciado de uma questão, então não vou inventar detalhes. Abra uma questão no feed e me envie start; eu explico o gabarito e o motivo. Dica geral: no ENEM, leia o comando antes do texto, marque palavras-chave e elimine alternativas que extrapolam o pedido. Se quiser, escreva o tópico e eu monto um roteiro de estudo em três passos.", snippet)
}
