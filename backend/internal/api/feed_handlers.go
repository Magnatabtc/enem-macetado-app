package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

type feedQuestionDTO struct {
	ID           string   `json:"id"`
	Subject      string   `json:"subject"`
	SubjectLabel string   `json:"subject_label"`
	Topic        string   `json:"topic"`
	Statement    string   `json:"statement"`
	Alternatives []string `json:"alternatives"`
	Difficulty   int      `json:"difficulty"`
}

type feedResponse struct {
	Questions   []feedQuestionDTO `json:"questions"`
	GeneratedAt string            `json:"generated_at"`
}

func (s *Server) handleFeed(w http.ResponseWriter, r *http.Request) {
	limit := 10
	if raw := r.URL.Query().Get("limit"); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 20 {
			writeError(w, http.StatusBadRequest, "limit deve estar entre 1 e 20")
			return
		}
		limit = parsed
	}

	ctx, cancel := s.withTimeout(r, serverTimeout)
	defer cancel()
	items, err := s.feed.Next(ctx, userIDFrom(r.Context()), limit)
	if err != nil {
		s.log.Error("carregar feed", "error", err, "request_id", requestIDFrom(r.Context()))
		writeError(w, http.StatusInternalServerError, "não foi possível carregar o feed")
		return
	}

	questions := make([]feedQuestionDTO, 0, len(items))
	for _, item := range items {
		questions = append(questions, feedQuestionDTO{
			ID:           item.ID,
			Subject:      item.Subject,
			SubjectLabel: model.SubjectLabel(item.Subject),
			Topic:        item.Topic,
			Statement:    item.Statement,
			Alternatives: item.Alternatives,
			Difficulty:   item.Difficulty,
		})
	}

	writeJSON(w, http.StatusOK, feedResponse{
		Questions:   questions,
		GeneratedAt: s.now().UTC().Format(time.RFC3339),
	})
}
