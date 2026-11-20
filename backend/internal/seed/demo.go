package seed

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/Magnatabtc/enem-macetado/backend/internal/auth"
	"github.com/Magnatabtc/enem-macetado/backend/internal/metrics"
	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
	"github.com/Magnatabtc/enem-macetado/backend/internal/store"
)

// Demo account constants are part of the product contract: the login screen
// advertises these credentials.
const (
	DemoEmail    = "demo@enem.app"
	DemoPassword = "demo1234"
	DemoName     = "Aluno Demo"
)

// DemoWeights is the onboarding profile of the demo account.
var DemoWeights = map[string]int{
	"matematica": 5,
	"portugues":  3,
	"biologia":   4,
	"quimica":    5,
	"fisica":     4,
	"historia":   3,
	"geografia":  3,
	"filosofia":  2,
	"sociologia": 2,
	"ingles":     3,
}

type replayAnswer struct {
	question int
	correct  bool
}

// demoPlan spreads 36 answers over 12 days (3 per day) using distinct
// questions per day. Question 0 is answered wrong three times to produce a
// max-priority weak topic; a handful of other misses keep accuracy realistic.
var demoPlan = [12][3]replayAnswer{
	{{0, false}, {1, true}, {2, true}},
	{{0, false}, {30, true}, {31, false}},
	{{3, true}, {4, false}, {5, true}},
	{{6, true}, {7, true}, {8, false}},
	{{9, true}, {10, true}, {11, true}},
	{{12, false}, {13, true}, {14, true}},
	{{15, true}, {16, false}, {17, true}},
	{{18, true}, {19, true}, {20, false}},
	{{21, true}, {22, true}, {23, true}},
	{{24, false}, {25, true}, {26, true}},
	{{27, true}, {28, false}, {29, true}},
	{{0, false}, {32, true}, {33, true}},
}

// EnsureDemo creates demo@enem.app when missing and replays the historical
// answers through store.RecordAttempt the first time, so topic stats, streaks
// and totals are computed exactly like live activity.
func EnsureDemo(ctx context.Context, st *store.Store, loc *time.Location, logger *slog.Logger) error {
	user, _, err := st.GetUserByEmail(ctx, DemoEmail)
	if errors.Is(err, store.ErrNotFound) {
		hash, hashErr := auth.HashPassword(DemoPassword)
		if hashErr != nil {
			return fmt.Errorf("hash da senha demo: %w", hashErr)
		}
		user, err = st.CreateUser(ctx, store.NewUser{
			Email:        DemoEmail,
			PasswordHash: hash,
			Name:         DemoName,
			Onboarded:    true,
			Weights:      DemoWeights,
			DailyGoal:    12,
		})
		if err != nil {
			return fmt.Errorf("criar usuário demo: %w", err)
		}
		logger.Info("usuário demo criado", "email", DemoEmail)
	} else if err != nil {
		return fmt.Errorf("carregar usuário demo: %w", err)
	}

	count, err := st.CountAttempts(ctx, user.ID)
	if err != nil {
		return fmt.Errorf("contar tentativas do demo: %w", err)
	}
	if count > 0 {
		return nil
	}

	questionIDs, err := st.ListQuestionIDs(ctx)
	if err != nil {
		return fmt.Errorf("listar questões do demo: %w", err)
	}
	if len(questionIDs) == 0 {
		logger.Warn("sem questões para o histórico do demo")
		return nil
	}

	cache := make(map[string]model.Question, len(questionIDs))
	getQuestion := func(id string) (model.Question, error) {
		if q, ok := cache[id]; ok {
			return q, nil
		}
		q, err := st.GetQuestion(ctx, id)
		if err != nil {
			return model.Question{}, err
		}
		cache[id] = q
		return q, nil
	}

	now := time.Now().In(loc)
	replayed := 0
	for dayIndex, answers := range demoPlan {
		daysAgo := len(demoPlan) - 1 - dayIndex
		timestamps := demoTimestamps(now, loc, daysAgo, len(answers))
		for i, answer := range answers {
			id := questionIDs[answer.question%len(questionIDs)]
			question, err := getQuestion(id)
			if err != nil {
				logger.Warn("demo: questão indisponível, tentativa ignorada", "question_id", id, "error", err)
				continue
			}
			selected := question.CorrectIndex
			if !answer.correct {
				selected = (question.CorrectIndex + 1 + answer.question) % 5
				if selected == question.CorrectIndex {
					selected = (selected + 1) % 5
				}
			}
			_, err = st.RecordAttempt(ctx, store.AttemptInput{
				UserID:        user.ID,
				QuestionID:    id,
				SelectedIndex: selected,
				ElapsedMS:     15000 + (answer.question*137)%20000,
				Mode:          "feed",
				AnsweredAt:    timestamps[i],
			})
			if err != nil {
				logger.Warn("demo: falha ao registrar tentativa", "question_id", id, "error", err)
				continue
			}
			replayed++
		}
	}
	logger.Info("histórico do demo semeado", "attempts", replayed)
	return nil
}

func demoTimestamps(now time.Time, loc *time.Location, daysAgo, count int) []time.Time {
	dayStart := metrics.StartOfDay(now.AddDate(0, 0, -daysAgo), loc)
	out := make([]time.Time, 0, count)
	if daysAgo == 0 {
		for i := 0; i < count; i++ {
			// Spread today's answers shortly before "now", but never before
			// midnight nor in the future, so daily counts and streaks hold.
			candidate := now.Add(-time.Duration(count-i) * 17 * time.Minute)
			if candidate.Before(dayStart) {
				candidate = dayStart.Add(time.Duration(i) * time.Second)
			}
			if candidate.After(now) {
				candidate = now
			}
			out = append(out, candidate)
		}
		return out
	}
	hours := []int{10, 14, 19}
	minutes := []int{0, 0, 30}
	for i := 0; i < count; i++ {
		hour := hours[i%len(hours)]
		minute := minutes[i%len(minutes)]
		y, m, d := dayStart.Date()
		out = append(out, time.Date(y, m, d, hour, minute, 0, 0, loc))
	}
	return out
}
