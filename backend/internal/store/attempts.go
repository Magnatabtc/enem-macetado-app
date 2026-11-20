package store

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/Magnatabtc/enem-macetado/backend/internal/feed"
	"github.com/Magnatabtc/enem-macetado/backend/internal/metrics"
	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

// AttemptInput describes one answer to be persisted. AnsweredAt defaults to
// now; the demo seed passes historical timestamps through the same path so
// stats and streaks are built exactly like live answers.
type AttemptInput struct {
	UserID        string
	QuestionID    string
	SelectedIndex int
	ElapsedMS     int
	Mode          string
	AnsweredAt    time.Time
}

// RecordAttempt inserts the attempt and updates topic_stats and user_stats in
// a single transaction, returning the fresh correction payload.
func (s *Store) RecordAttempt(ctx context.Context, in AttemptInput) (model.AttemptResult, error) {
	var zero model.AttemptResult
	if in.AnsweredAt.IsZero() {
		in.AnsweredAt = time.Now()
	}
	if in.Mode == "" {
		in.Mode = "feed"
	}
	if in.SelectedIndex < 0 || in.SelectedIndex > 4 {
		return zero, fmt.Errorf("selected_index fora do intervalo")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return zero, fmt.Errorf("iniciar tentativa: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	question, err := getQuestion(ctx, tx, in.QuestionID)
	if err != nil {
		return zero, err
	}

	if err := ensureUserStatsTx(ctx, tx, in.UserID); err != nil {
		return zero, err
	}
	stats, err := loadUserStatsForUpdate(ctx, tx, in.UserID)
	if err != nil {
		return zero, err
	}

	correct := question.CorrectIndex == in.SelectedIndex
	if _, err := tx.Exec(ctx, `
		INSERT INTO attempts (user_id, question_id, selected_index, correct, elapsed_ms, mode, answered_at)
		VALUES ($1::uuid, $2::uuid, $3, $4, $5, $6, $7)`,
		in.UserID, in.QuestionID, in.SelectedIndex, correct, in.ElapsedMS, in.Mode, in.AnsweredAt,
	); err != nil {
		return zero, normalizeErr(fmt.Errorf("inserir tentativa: %w", err))
	}

	topicStat, err := updateTopicStats(ctx, tx, in.UserID, question.Subject, question.Topic, correct, in.AnsweredAt)
	if err != nil {
		return zero, err
	}

	dayKey := metrics.DayKey(in.AnsweredAt, s.loc)
	streakCurrent, streakBest := stats.StreakDays, stats.BestStreak
	lastActive := stats.LastActiveDate
	// Historical replays (demo seed) must not rewind the streak when they are
	// older than the latest recorded activity.
	if lastActive == nil || dayKey >= *lastActive {
		streakCurrent, streakBest = metrics.NextStreak(streakCurrent, streakBest, lastActive, dayKey)
		lastActive = &dayKey
	}

	totalAnswered := stats.TotalAnswered + 1
	totalCorrect := stats.TotalCorrect
	if correct {
		totalCorrect++
	}

	var lastActiveParam any
	if lastActive != nil {
		lastActiveParam = *lastActive
	}
	if _, err := tx.Exec(ctx, `
		UPDATE user_stats
		   SET streak_days = $2, best_streak = $3, last_active_date = $4::date,
		       total_answered = $5, total_correct = $6, updated_at = now()
		 WHERE user_id = $1::uuid`,
		in.UserID, streakCurrent, streakBest, lastActiveParam, totalAnswered, totalCorrect,
	); err != nil {
		return zero, fmt.Errorf("atualizar user_stats: %w", err)
	}

	dayStart := metrics.StartOfDay(in.AnsweredAt, s.loc)
	dayEnd := metrics.NextDayStart(in.AnsweredAt, s.loc)
	answeredToday, correctToday, err := dailyCounts(ctx, tx, in.UserID, dayStart, dayEnd)
	if err != nil {
		return zero, err
	}

	if err := tx.Commit(ctx); err != nil {
		return zero, fmt.Errorf("commit da tentativa: %w", err)
	}

	return model.AttemptResult{
		Correct:      correct,
		CorrectIndex: question.CorrectIndex,
		Explanation:  question.Explanation,
		Topic:        topicStat,
		Streak: model.Streak{
			Current:        streakCurrent,
			Best:           streakBest,
			LastActiveDate: lastActive,
		},
		Daily: model.Daily{
			Date:     dayKey,
			Answered: answeredToday,
			Correct:  correctToday,
			Goal:     stats.DailyGoal,
		},
	}, nil
}

// CountAttempts returns how many attempts a user has (used by the demo seed
// idempotency check).
func (s *Store) CountAttempts(ctx context.Context, userID string) (int, error) {
	var n int
	err := s.pool.QueryRow(ctx, `SELECT count(*)::int FROM attempts WHERE user_id = $1::uuid`, userID).Scan(&n)
	if err != nil {
		return 0, fmt.Errorf("contar tentativas: %w", err)
	}
	return n, nil
}

func loadUserStatsForUpdate(ctx context.Context, q querier, userID string) (model.UserStats, error) {
	var st model.UserStats
	var lastActive *string
	err := q.QueryRow(ctx, `
		SELECT streak_days, best_streak, to_char(last_active_date, 'YYYY-MM-DD'),
		       daily_goal, total_answered, total_correct
		FROM user_stats WHERE user_id = $1::uuid
		FOR UPDATE`, userID,
	).Scan(&st.StreakDays, &st.BestStreak, &lastActive, &st.DailyGoal, &st.TotalAnswered, &st.TotalCorrect)
	if err != nil {
		return model.UserStats{}, normalizeErr(err)
	}
	st.LastActiveDate = lastActive
	return st, nil
}

func updateTopicStats(ctx context.Context, q querier, userID, subject, topic string, correct bool, answeredAt time.Time) (model.TopicStat, error) {
	var priority float64
	var consecutiveWrong, correctCount, wrongCount int
	err := q.QueryRow(ctx, `
		SELECT priority, consecutive_wrong, correct_count, wrong_count
		FROM topic_stats
		WHERE user_id = $1::uuid AND subject = $2 AND topic = $3
		FOR UPDATE`, userID, subject, topic,
	).Scan(&priority, &consecutiveWrong, &correctCount, &wrongCount)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return model.TopicStat{}, fmt.Errorf("carregar topic_stats: %w", err)
	}

	newPriority, newConsecutive := feed.UpdatePriority(priority, consecutiveWrong, correct)
	if correct {
		correctCount++
	} else {
		wrongCount++
	}

	if _, err := q.Exec(ctx, `
		INSERT INTO topic_stats
			(user_id, subject, topic, priority, consecutive_wrong, correct_count, wrong_count, last_answered_at)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (user_id, subject, topic) DO UPDATE SET
			priority = EXCLUDED.priority,
			consecutive_wrong = EXCLUDED.consecutive_wrong,
			correct_count = EXCLUDED.correct_count,
			wrong_count = EXCLUDED.wrong_count,
			last_answered_at = GREATEST(
				COALESCE(topic_stats.last_answered_at, EXCLUDED.last_answered_at),
				EXCLUDED.last_answered_at
			)`,
		userID, subject, topic, newPriority, newConsecutive, correctCount, wrongCount, answeredAt,
	); err != nil {
		return model.TopicStat{}, fmt.Errorf("atualizar topic_stats: %w", err)
	}

	return model.TopicStat{
		Subject:          subject,
		Topic:            topic,
		Priority:         metrics.Round1(newPriority),
		ConsecutiveWrong: newConsecutive,
		CorrectCount:     correctCount,
		WrongCount:       wrongCount,
	}, nil
}
