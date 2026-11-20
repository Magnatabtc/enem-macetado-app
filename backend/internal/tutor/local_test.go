package tutor

import (
	"context"
	"strings"
	"testing"
	"time"
)

func testQuestion() *QuestionContext {
	return &QuestionContext{
		Subject:      "matematica",
		SubjectLabel: "Matemática",
		Topic:        "Função afim",
		Statement:    "Um taxista cobra R$ 5 fixos mais R$ 2 por km. Qual o custo de 10 km?",
		Alternatives: []string{"R$ 20", "R$ 25", "R$ 30", "R$ 35", "R$ 40"},
		CorrectIndex: 1,
		Explanation:  "O custo é 5 + 2*10 = 25.",
		LastAttempt:  &AttemptContext{SelectedIndex: 0, Correct: false},
	}
}

func wordCount(s string) int {
	return len(strings.Fields(s))
}

func TestLocalAnswerUsesQuestionContext(t *testing.T) {
	local := &Local{}
	text, err := local.Stream(context.Background(), Request{Question: testQuestion()}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, "Função afim") || !strings.Contains(text, "25") {
		t.Fatalf("answer misses context: %q", text)
	}
	if !strings.Contains(text, "explicação") && !strings.Contains(text, "O custo é") {
		t.Fatalf("answer misses explanation: %q", text)
	}
	if !strings.Contains(text, "letra B") {
		t.Fatalf("answer misses correct letter: %q", text)
	}
	if wordCount(text) > MaxWords {
		t.Fatalf("answer has %d words", wordCount(text))
	}
}

func TestLocalAnswerWithoutQuestion(t *testing.T) {
	local := &Local{}
	text, err := local.Stream(context.Background(), Request{UserText: "como estudo matemática?"}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, "questão") || wordCount(text) > MaxWords {
		t.Fatalf("unexpected free answer: %q", text)
	}
	empty, err := local.Stream(context.Background(), Request{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(empty) == "" {
		t.Fatal("empty answer")
	}
}

func TestLocalStreamsConcatenatedText(t *testing.T) {
	local := &Local{ChunkDelay: 0}
	var chunks []string
	text, err := local.Stream(context.Background(), Request{Question: testQuestion(), UserText: "me dá uma dica"}, func(chunk string) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if joined := strings.Join(chunks, ""); joined != text {
		t.Fatalf("stream mismatch:\n%q\n%q", joined, text)
	}
	if len(chunks) < 5 {
		t.Fatalf("too few chunks: %d", len(chunks))
	}
	if !strings.Contains(text, "Dica prática") {
		t.Fatalf("dica intent not handled: %q", text)
	}
}

func TestLocalRespectsCancellation(t *testing.T) {
	local := &Local{ChunkDelay: 5 * time.Millisecond}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := local.Stream(ctx, Request{Question: testQuestion()}, func(string) error { return nil })
	if err == nil {
		t.Fatal("expected cancellation error")
	}
}

func TestLetter(t *testing.T) {
	if Letter(0) != "A" || Letter(4) != "E" || Letter(9) != "?" || Letter(-1) != "?" {
		t.Fatal("letter mapping broken")
	}
}

func TestClampWords(t *testing.T) {
	words := make([]string, 0, MaxWords+20)
	for i := 0; i < MaxWords+20; i++ {
		words = append(words, "x")
	}
	if got := wordCount(clampWords(strings.Join(words, " "))); got != MaxWords {
		t.Fatalf("clamp = %d words", got)
	}
}
