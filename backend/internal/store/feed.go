package store

import (
	"context"
	"fmt"
	"time"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

// LoadCandidates returns every question enriched with the user's subject
// weight, topic priority and last attempt timestamp. It feeds the in-memory
// scorer; the question count is small (dozens), so a full scan is cheap.
func (s *Store) LoadCandidates(ctx context.Context, userID string) ([]model.Candidate, error) {
	weights, err := s.GetWeights(ctx, userID)
	if err != nil {
		return nil, err
	}

	rows, err := s.pool.Query(ctx, `
		SELECT q.id::text, q.subject, q.topic, q.statement, q.alternatives, q.difficulty,
		       COALESCE(ts.priority, 0),
		       (SELECT max(a.answered_at)
		          FROM attempts a
		         WHERE a.user_id = $1::uuid AND a.question_id = q.id)
		FROM questions q
		LEFT JOIN topic_stats ts
		       ON ts.user_id = $1::uuid AND ts.subject = q.subject AND ts.topic = q.topic
		ORDER BY q.subject, q.topic, q.statement, q.id`, userID)
	if err != nil {
		return nil, fmt.Errorf("carregar candidatos: %w", err)
	}
	defer rows.Close()

	candidates := make([]model.Candidate, 0, 64)
	for rows.Next() {
		var c model.Candidate
		var lastAnswered *time.Time
		if err := rows.Scan(&c.ID, &c.Subject, &c.Topic, &c.Statement, &c.Alternatives,
			&c.Difficulty, &c.TopicPriority, &lastAnswered); err != nil {
			return nil, fmt.Errorf("ler candidatos: %w", err)
		}
		c.LastAnsweredAt = lastAnswered
		c.Weight = weights[c.Subject]
		if c.Weight == 0 {
			c.Weight = 3
		}
		candidates = append(candidates, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ler candidatos: %w", err)
	}
	return candidates, nil
}
