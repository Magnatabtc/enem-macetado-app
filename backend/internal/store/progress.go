package store

import (
	"context"
	"fmt"
	"time"

	"github.com/Magnatabtc/enem-macetado/backend/internal/metrics"
	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

// DailyCounts returns today's answered/correct totals for a given instant.
func (s *Store) DailyCounts(ctx context.Context, userID string, day time.Time) (int, int, error) {
	start := metrics.StartOfDay(day, s.loc)
	end := metrics.NextDayStart(day, s.loc)
	return dailyCounts(ctx, s.pool, userID, start, end)
}

func dailyCounts(ctx context.Context, q querier, userID string, from, to time.Time) (int, int, error) {
	var answered, correct int
	err := q.QueryRow(ctx, `
		SELECT count(*)::int, count(*) FILTER (WHERE correct)::int
		FROM attempts
		WHERE user_id = $1::uuid AND answered_at >= $2 AND answered_at < $3`,
		userID, from, to,
	).Scan(&answered, &correct)
	if err != nil {
		return 0, 0, fmt.Errorf("contar respostas do dia: %w", err)
	}
	return answered, correct, nil
}

// Totals returns lifetime answered/correct totals from the attempts log.
func (s *Store) Totals(ctx context.Context, userID string) (model.Totals, error) {
	var t model.Totals
	err := s.pool.QueryRow(ctx, `
		SELECT count(*)::int, count(*) FILTER (WHERE correct)::int
		FROM attempts WHERE user_id = $1::uuid`, userID,
	).Scan(&t.Answered, &t.Correct)
	if err != nil {
		return model.Totals{}, fmt.Errorf("carregar totais: %w", err)
	}
	return t, nil
}

// SubjectCounts aggregates attempts per subject, pre-filling all ten subjects
// so the caller always renders the full set.
func (s *Store) SubjectCounts(ctx context.Context, userID string) (map[string]model.SubjectProgress, error) {
	out := make(map[string]model.SubjectProgress, len(model.Subjects))
	for _, subject := range model.Subjects {
		out[subject.Key] = model.SubjectProgress{Subject: subject.Key, Label: subject.Label}
	}

	rows, err := s.pool.Query(ctx, `
		SELECT q.subject, count(*)::int, count(*) FILTER (WHERE a.correct)::int
		FROM attempts a
		JOIN questions q ON q.id = a.question_id
		WHERE a.user_id = $1::uuid
		GROUP BY q.subject`, userID)
	if err != nil {
		return nil, fmt.Errorf("agregar matérias: %w", err)
	}
	defer rows.Close()

	for rows.Next() {
		var subject string
		var answered, correct int
		if err := rows.Scan(&subject, &answered, &correct); err != nil {
			return nil, fmt.Errorf("ler matérias: %w", err)
		}
		progress := out[subject]
		progress.Subject = subject
		progress.Label = model.SubjectLabel(subject)
		progress.Answered = answered
		progress.Correct = correct
		out[subject] = progress
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ler matérias: %w", err)
	}
	return out, nil
}

// AvgPriorityBySubject returns the mean topic priority per subject.
func (s *Store) AvgPriorityBySubject(ctx context.Context, userID string) (map[string]float64, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT subject, avg(priority)::float8
		FROM topic_stats
		WHERE user_id = $1::uuid
		GROUP BY subject`, userID)
	if err != nil {
		return nil, fmt.Errorf("agregar prioridade: %w", err)
	}
	defer rows.Close()

	out := make(map[string]float64, len(model.Subjects))
	for rows.Next() {
		var subject string
		var avg float64
		if err := rows.Scan(&subject, &avg); err != nil {
			return nil, fmt.Errorf("ler prioridade: %w", err)
		}
		out[subject] = metrics.Round1(avg)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ler prioridade: %w", err)
	}
	return out, nil
}

// WeakTopics lists topics with priority > 0, strongest first.
func (s *Store) WeakTopics(ctx context.Context, userID string, limit int) ([]model.WeakTopic, error) {
	if limit <= 0 {
		limit = 8
	}
	rows, err := s.pool.Query(ctx, `
		SELECT subject, topic, priority, consecutive_wrong, correct_count, wrong_count
		FROM topic_stats
		WHERE user_id = $1::uuid AND priority > 0
		ORDER BY priority DESC, correct_count ASC, subject ASC, topic ASC
		LIMIT $2`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("carregar tópicos fracos: %w", err)
	}
	defer rows.Close()

	topics := make([]model.WeakTopic, 0, limit)
	for rows.Next() {
		var t model.WeakTopic
		if err := rows.Scan(&t.Subject, &t.Topic, &t.Priority, &t.ConsecutiveWrong, &t.CorrectCount, &t.WrongCount); err != nil {
			return nil, fmt.Errorf("ler tópicos fracos: %w", err)
		}
		t.Priority = metrics.Round1(t.Priority)
		topics = append(topics, t)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ler tópicos fracos: %w", err)
	}
	return topics, nil
}

// LastNDays returns exactly n chronological day buckets ending today, filling
// inactive days with zeros.
func (s *Store) LastNDays(ctx context.Context, userID string, now time.Time, n int) ([]model.DayCount, error) {
	if n <= 0 {
		return []model.DayCount{}, nil
	}
	today := metrics.DayKey(now, s.loc)
	days := metrics.DaysBefore(today, n)
	if len(days) != n {
		return nil, fmt.Errorf("intervalo de dias inválido")
	}
	first, err := time.ParseInLocation(metrics.DayLayout, days[0], s.loc)
	if err != nil {
		return nil, fmt.Errorf("intervalo de dias inválido: %w", err)
	}
	end := metrics.NextDayStart(now, s.loc)

	rows, err := s.pool.Query(ctx, `
		SELECT to_char((answered_at AT TIME ZONE $2)::date, 'YYYY-MM-DD') AS day,
		       count(*)::int,
		       count(*) FILTER (WHERE correct)::int
		FROM attempts
		WHERE user_id = $1::uuid AND answered_at >= $3 AND answered_at < $4
		GROUP BY 1`, userID, s.tzName(), first, end)
	if err != nil {
		return nil, fmt.Errorf("carregar últimos dias: %w", err)
	}
	defer rows.Close()

	buckets := make(map[string]model.DayCount, n)
	for rows.Next() {
		var day string
		var answered, correct int
		if err := rows.Scan(&day, &answered, &correct); err != nil {
			return nil, fmt.Errorf("ler últimos dias: %w", err)
		}
		buckets[day] = model.DayCount{Date: day, Answered: answered, Correct: correct}
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ler últimos dias: %w", err)
	}

	out := make([]model.DayCount, 0, n)
	for _, day := range days {
		if bucket, ok := buckets[day]; ok {
			out = append(out, bucket)
			continue
		}
		out = append(out, model.DayCount{Date: day})
	}
	return out, nil
}
