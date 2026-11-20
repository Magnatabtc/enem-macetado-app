package api

import (
	"net/http"

	"github.com/Magnatabtc/enem-macetado/backend/internal/metrics"
	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

type totalsDTO struct {
	Answered int     `json:"answered"`
	Correct  int     `json:"correct"`
	Accuracy float64 `json:"accuracy"`
}

type subjectProgressDTO struct {
	Subject     string  `json:"subject"`
	Label       string  `json:"label"`
	Weight      int     `json:"weight"`
	Answered    int     `json:"answered"`
	Correct     int     `json:"correct"`
	Accuracy    float64 `json:"accuracy"`
	AvgPriority float64 `json:"avg_priority"`
}

type weakTopicDTO struct {
	Subject          string  `json:"subject"`
	Topic            string  `json:"topic"`
	Priority         float64 `json:"priority"`
	ConsecutiveWrong int     `json:"consecutive_wrong"`
	CorrectCount     int     `json:"correct"`
	WrongCount       int     `json:"wrong"`
}

type dayCountDTO struct {
	Date     string `json:"date"`
	Answered int    `json:"answered"`
	Correct  int    `json:"correct"`
}

type progressResponse struct {
	Streak     streakDTO            `json:"streak"`
	Daily      dailyDTO             `json:"daily"`
	Totals     totalsDTO            `json:"totals"`
	Subjects   []subjectProgressDTO `json:"subjects"`
	WeakTopics []weakTopicDTO       `json:"weak_topics"`
	Last14     []dayCountDTO        `json:"last14"`
}

func (s *Server) handleProgress(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.withTimeout(r, serverTimeout)
	defer cancel()
	userID := userIDFrom(r.Context())
	now := s.now()

	stats, err := s.store.GetUserStats(ctx, userID)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar estatísticas")
		return
	}
	weights, err := s.store.GetWeights(ctx, userID)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar pesos")
		return
	}
	answeredToday, correctToday, err := s.store.DailyCounts(ctx, userID, now)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar respostas do dia")
		return
	}
	totals, err := s.store.Totals(ctx, userID)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar totais")
		return
	}
	subjectCounts, err := s.store.SubjectCounts(ctx, userID)
	if err != nil {
		s.handleStoreError(w, r, err, "agregar matérias")
		return
	}
	avgPriorities, err := s.store.AvgPriorityBySubject(ctx, userID)
	if err != nil {
		s.handleStoreError(w, r, err, "agregar prioridades")
		return
	}
	weakTopics, err := s.store.WeakTopics(ctx, userID, 8)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar tópicos fracos")
		return
	}
	last14, err := s.store.LastNDays(ctx, userID, now, 14)
	if err != nil {
		s.handleStoreError(w, r, err, "carregar últimos 14 dias")
		return
	}

	subjects := make([]subjectProgressDTO, 0, len(model.Subjects))
	for _, subject := range model.Subjects {
		progress := subjectCounts[subject.Key]
		subjects = append(subjects, subjectProgressDTO{
			Subject:     subject.Key,
			Label:       subject.Label,
			Weight:      weights[subject.Key],
			Answered:    progress.Answered,
			Correct:     progress.Correct,
			Accuracy:    metrics.Accuracy(progress.Correct, progress.Answered),
			AvgPriority: avgPriorities[subject.Key],
		})
	}

	topics := make([]weakTopicDTO, 0, len(weakTopics))
	for _, topic := range weakTopics {
		topics = append(topics, weakTopicDTO{
			Subject:          topic.Subject,
			Topic:            topic.Topic,
			Priority:         topic.Priority,
			ConsecutiveWrong: topic.ConsecutiveWrong,
			CorrectCount:     topic.CorrectCount,
			WrongCount:       topic.WrongCount,
		})
	}

	days := make([]dayCountDTO, 0, len(last14))
	for _, day := range last14 {
		days = append(days, dayCountDTO{Date: day.Date, Answered: day.Answered, Correct: day.Correct})
	}

	writeJSON(w, http.StatusOK, progressResponse{
		Streak: streakFromStats(stats),
		Daily: dailyDTO{
			Date:     metrics.DayKey(now, s.cfg.Location),
			Answered: answeredToday,
			Correct:  correctToday,
			Goal:     goalOrDefault(stats.DailyGoal),
		},
		Totals: totalsDTO{
			Answered: totals.Answered,
			Correct:  totals.Correct,
			Accuracy: metrics.Accuracy(totals.Correct, totals.Answered),
		},
		Subjects:   subjects,
		WeakTopics: topics,
		Last14:     days,
	})
}
