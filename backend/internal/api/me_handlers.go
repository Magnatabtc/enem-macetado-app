package api

import (
	"errors"
	"net/http"

	"github.com/Magnatabtc/enem-macetado/backend/internal/metrics"
	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
	"github.com/Magnatabtc/enem-macetado/backend/internal/store"
)

type streakDTO struct {
	Current        int     `json:"current"`
	Best           int     `json:"best"`
	LastActiveDate *string `json:"last_active_date"`
}

type dailyDTO struct {
	Date     string `json:"date"`
	Answered int    `json:"answered"`
	Correct  int    `json:"correct"`
	Goal     int    `json:"goal"`
}

type meResponse struct {
	User      userDTO        `json:"user"`
	Onboarded bool           `json:"onboarded"`
	Weights   map[string]int `json:"weights"`
	Streak    streakDTO      `json:"streak"`
	Daily     dailyDTO       `json:"daily"`
}

type patchMeRequest struct {
	Name      *string `json:"name"`
	DailyGoal *int    `json:"daily_goal"`
}

type onboardingRequest struct {
	Weights map[string]int `json:"weights"`
}

type onboardingResponse struct {
	OK        bool           `json:"ok"`
	Onboarded bool           `json:"onboarded"`
	Weights   map[string]int `json:"weights"`
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.withTimeout(r, serverTimeout)
	defer cancel()
	userID := userIDFrom(r.Context())

	user, err := s.store.GetUserByID(ctx, userID)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar usuário")
		return
	}
	weights, err := s.store.GetWeights(ctx, userID)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar pesos")
		return
	}
	stats, err := s.store.GetUserStats(ctx, userID)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar estatísticas")
		return
	}
	now := s.now()
	answered, correct, err := s.store.DailyCounts(ctx, userID, now)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar respostas do dia")
		return
	}

	writeJSON(w, http.StatusOK, meResponse{
		User: userDTO{
			ID:    user.ID,
			Email: user.Email,
			Name:  user.Name,
		},
		Onboarded: user.Onboarded,
		Weights:   weights,
		Streak:    streakFromStats(stats),
		Daily: dailyDTO{
			Date:     metrics.DayKey(now, s.cfg.Location),
			Answered: answered,
			Correct:  correct,
			Goal:     goalOrDefault(stats.DailyGoal),
		},
	})
}

func (s *Server) handlePatchMe(w http.ResponseWriter, r *http.Request) {
	var req patchMeRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "corpo inválido")
		return
	}
	if req.Name == nil && req.DailyGoal == nil {
		writeError(w, http.StatusBadRequest, "informe nome ou meta diária")
		return
	}
	if req.Name != nil {
		name, err := validateName(*req.Name)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		req.Name = &name
	}
	if req.DailyGoal != nil && (*req.DailyGoal < 4 || *req.DailyGoal > 50) {
		writeError(w, http.StatusBadRequest, "a meta diária deve estar entre 4 e 50")
		return
	}

	ctx, cancel := s.withTimeout(r, serverTimeout)
	defer cancel()
	if err := s.store.UpdateProfile(ctx, userIDFrom(r.Context()), req.Name, req.DailyGoal); err != nil {
		s.handleStoreError(w, r, err, "atualizar perfil")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (s *Server) handleOnboarding(w http.ResponseWriter, r *http.Request) {
	var req onboardingRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "corpo inválido")
		return
	}
	weights, err := model.ValidateWeights(req.Weights)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx, cancel := s.withTimeout(r, serverTimeout)
	defer cancel()
	userID := userIDFrom(r.Context())
	if err := s.store.SetOnboarding(ctx, userID, weights); err != nil {
		s.handleStoreError(w, r, err, "salvar onboarding")
		return
	}
	s.feed.Invalidate(userID)
	writeJSON(w, http.StatusOK, onboardingResponse{OK: true, Onboarded: true, Weights: weights})
}

func streakFromStats(stats model.UserStats) streakDTO {
	return streakDTO{
		Current:        stats.StreakDays,
		Best:           stats.BestStreak,
		LastActiveDate: stats.LastActiveDate,
	}
}

func goalOrDefault(goal int) int {
	if goal < 4 || goal > 50 {
		return 12
	}
	return goal
}

// handleStoreError maps store errors to HTTP responses and logs the rest.
func (s *Server) handleStoreError(w http.ResponseWriter, r *http.Request, err error, action string) {
	if errors.Is(err, store.ErrNotFound) {
		writeError(w, http.StatusNotFound, "não encontrado")
		return
	}
	s.log.Error(action, "error", err, "request_id", requestIDFrom(r.Context()))
	writeError(w, http.StatusInternalServerError, "erro interno")
}
