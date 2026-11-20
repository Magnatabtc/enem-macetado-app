package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"

	"github.com/Magnatabtc/enem-macetado/backend/internal/feed"
	"github.com/Magnatabtc/enem-macetado/backend/internal/store"
)

type attemptRequest struct {
	QuestionID    string `json:"question_id"`
	SelectedIndex *int   `json:"selected_index"`
	ElapsedMS     int    `json:"elapsed_ms"`
	Mode          string `json:"mode"`
}

type attemptTopicDTO struct {
	Subject          string  `json:"subject"`
	Topic            string  `json:"topic"`
	Priority         float64 `json:"priority"`
	ConsecutiveWrong int     `json:"consecutive_wrong"`
	IsPriority       bool    `json:"is_priority"`
}

type attemptStreakDTO struct {
	Current int `json:"current"`
	Best    int `json:"best"`
}

type attemptResponse struct {
	Correct      bool             `json:"correct"`
	CorrectIndex int              `json:"correct_index"`
	Explanation  string           `json:"explanation"`
	Topic        attemptTopicDTO  `json:"topic"`
	Streak       attemptStreakDTO `json:"streak"`
	Daily        dailyDTO         `json:"daily"`
}

func (s *Server) handleAttempt(w http.ResponseWriter, r *http.Request) {
	var req attemptRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "corpo inválido")
		return
	}
	if _, err := uuid.Parse(req.QuestionID); err != nil {
		writeError(w, http.StatusBadRequest, "question_id inválido")
		return
	}
	if req.SelectedIndex == nil {
		writeError(w, http.StatusBadRequest, "selected_index é obrigatório")
		return
	}
	if *req.SelectedIndex < 0 || *req.SelectedIndex > 4 {
		writeError(w, http.StatusBadRequest, "selected_index deve estar entre 0 e 4")
		return
	}

	elapsed := req.ElapsedMS
	if elapsed < 0 {
		elapsed = 0
	}
	if elapsed > 3_600_000 {
		elapsed = 3_600_000
	}
	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "feed"
	}
	if len(mode) > 32 {
		writeError(w, http.StatusBadRequest, "mode muito longo")
		return
	}

	ctx, cancel := s.withTimeout(r, serverTimeout)
	defer cancel()
	userID := userIDFrom(r.Context())
	result, err := s.store.RecordAttempt(ctx, store.AttemptInput{
		UserID:        userID,
		QuestionID:    req.QuestionID,
		SelectedIndex: *req.SelectedIndex,
		ElapsedMS:     elapsed,
		Mode:          mode,
		AnsweredAt:    s.now(),
	})
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "questão não encontrada")
			return
		}
		s.log.Error("registrar tentativa", "error", err, "request_id", requestIDFrom(r.Context()))
		writeError(w, http.StatusInternalServerError, "não foi possível registrar a resposta")
		return
	}
	s.feed.Invalidate(userID)

	writeJSON(w, http.StatusOK, attemptResponse{
		Correct:      result.Correct,
		CorrectIndex: result.CorrectIndex,
		Explanation:  result.Explanation,
		Topic: attemptTopicDTO{
			Subject:          result.Topic.Subject,
			Topic:            result.Topic.Topic,
			Priority:         result.Topic.Priority,
			ConsecutiveWrong: result.Topic.ConsecutiveWrong,
			IsPriority:       feed.IsPriority(result.Topic.Priority),
		},
		Streak: attemptStreakDTO{
			Current: result.Streak.Current,
			Best:    result.Streak.Best,
		},
		Daily: dailyDTO{
			Date:     result.Daily.Date,
			Answered: result.Daily.Answered,
			Correct:  result.Daily.Correct,
			Goal:     result.Daily.Goal,
		},
	})
}
