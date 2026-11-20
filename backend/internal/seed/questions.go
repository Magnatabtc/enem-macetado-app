// Package seed loads the question bank and the demo account at boot.
package seed

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
	"github.com/Magnatabtc/enem-macetado/backend/internal/store"
)

type rawQuestion struct {
	Subject      string   `json:"subject"`
	Topic        string   `json:"topic"`
	Statement    string   `json:"statement"`
	Alternatives []string `json:"alternatives"`
	CorrectIndex *int     `json:"correct_index"`
	Difficulty   *int     `json:"difficulty"`
	Explanation  string   `json:"explanation"`
	Source       string   `json:"source"`
}

// ParseQuestions decodes and validates a questions.json payload. It returns
// the valid questions, one human-readable problem per invalid entry and an
// error only when the JSON itself cannot be decoded.
func ParseQuestions(data []byte) ([]model.Question, []string, error) {
	var raw []rawQuestion
	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, nil, fmt.Errorf("JSON de questões inválido: %w", err)
	}

	valid := make([]model.Question, 0, len(raw))
	var problems []string
	for i, r := range raw {
		question, problem := validateQuestion(i, r)
		if problem != "" {
			problems = append(problems, problem)
			continue
		}
		valid = append(valid, question)
	}
	return valid, problems, nil
}

func validateQuestion(index int, r rawQuestion) (model.Question, string) {
	subject := strings.TrimSpace(r.Subject)
	topic := strings.TrimSpace(r.Topic)
	statement := strings.TrimSpace(r.Statement)
	explanation := strings.TrimSpace(r.Explanation)

	if !model.ValidSubject(subject) {
		return model.Question{}, fmt.Sprintf("questão %d: matéria inválida %q", index, subject)
	}
	if topic == "" {
		return model.Question{}, fmt.Sprintf("questão %d: tópico vazio", index)
	}
	if statement == "" {
		return model.Question{}, fmt.Sprintf("questão %d: enunciado vazio", index)
	}
	if len(r.Alternatives) != 5 {
		return model.Question{}, fmt.Sprintf("questão %d: esperadas 5 alternativas, encontradas %d", index, len(r.Alternatives))
	}
	alternatives := make([]string, 5)
	for i, alt := range r.Alternatives {
		alt = strings.TrimSpace(alt)
		if alt == "" {
			return model.Question{}, fmt.Sprintf("questão %d: alternativa %d vazia", index, i+1)
		}
		alternatives[i] = alt
	}
	if r.CorrectIndex == nil {
		return model.Question{}, fmt.Sprintf("questão %d: correct_index ausente", index)
	}
	if *r.CorrectIndex < 0 || *r.CorrectIndex > 4 {
		return model.Question{}, fmt.Sprintf("questão %d: correct_index %d fora de 0..4", index, *r.CorrectIndex)
	}
	difficulty := 3
	if r.Difficulty != nil {
		if *r.Difficulty < 1 || *r.Difficulty > 5 {
			return model.Question{}, fmt.Sprintf("questão %d: difficulty %d fora de 1..5", index, *r.Difficulty)
		}
		difficulty = *r.Difficulty
	}
	if explanation == "" {
		return model.Question{}, fmt.Sprintf("questão %d: explicação vazia", index)
	}

	source := strings.TrimSpace(r.Source)
	if source == "" {
		source = "enem-macetado"
	}
	return model.Question{
		Subject:      subject,
		Topic:        topic,
		Statement:    statement,
		Alternatives: alternatives,
		CorrectIndex: *r.CorrectIndex,
		Difficulty:   difficulty,
		Explanation:  explanation,
		Source:       source,
	}, ""
}

// ResolveQuestionsPath returns the first readable questions.json path. The
// configured path wins; the dev fallbacks are tried afterwards.
func ResolveQuestionsPath(configured string) (string, bool) {
	candidates := make([]string, 0, 4)
	if configured != "" {
		candidates = append(candidates, configured)
	}
	for _, fallback := range []string{
		"../content/questions.json",
		"./content/questions.json",
		"content/questions.json",
	} {
		candidates = append(candidates, fallback)
	}

	seen := make(map[string]struct{}, len(candidates))
	for _, candidate := range candidates {
		clean := filepath.Clean(candidate)
		if _, ok := seen[clean]; ok {
			continue
		}
		seen[clean] = struct{}{}
		info, err := os.Stat(clean)
		if err == nil && !info.IsDir() {
			return clean, true
		}
	}
	return "", false
}

// EnsureQuestions seeds the questions table when it is empty. A missing file is
// a warning, never a boot failure.
func EnsureQuestions(ctx context.Context, st *store.Store, configuredPath string, logger *slog.Logger) error {
	path, ok := ResolveQuestionsPath(configuredPath)
	if !ok {
		logger.Warn("arquivo de questões não encontrado; seed ignorado", "configured", configuredPath)
		return nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		logger.Warn("não foi possível ler o arquivo de questões; seed ignorado", "path", path, "error", err)
		return nil
	}

	questions, problems, err := ParseQuestions(data)
	if err != nil {
		logger.Warn("arquivo de questões inválido; seed ignorado", "path", path, "error", err)
		return nil
	}
	for _, problem := range problems {
		logger.Warn("questão inválida descartada", "path", path, "problem", problem)
	}
	if len(questions) == 0 {
		logger.Warn("nenhuma questão válida para semear", "path", path)
		return nil
	}

	inserted, err := st.InsertQuestions(ctx, questions)
	if err != nil {
		return fmt.Errorf("semear questões: %w", err)
	}
	if inserted > 0 {
		logger.Info("questões semeadas", "count", inserted, "path", path)
	} else {
		logger.Info("questões já presentes; seed ignorado", "path", path)
	}
	return nil
}
