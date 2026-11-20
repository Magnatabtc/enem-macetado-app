package store

import (
	"context"
	"fmt"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

const questionColumns = `id::text, subject, topic, statement, alternatives, correct_index, difficulty, explanation, source`

// CountQuestions returns how many questions exist.
func (s *Store) CountQuestions(ctx context.Context) (int, error) {
	var n int
	if err := s.pool.QueryRow(ctx, `SELECT count(*)::int FROM questions`).Scan(&n); err != nil {
		return 0, fmt.Errorf("contar questões: %w", err)
	}
	return n, nil
}

// InsertQuestions inserts the seed only when the questions table is empty.
// Returns the number of inserted rows (0 when the table already had data).
func (s *Store) InsertQuestions(ctx context.Context, questions []model.Question) (int, error) {
	if len(questions) == 0 {
		return 0, nil
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return 0, fmt.Errorf("iniciar seed de questões: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize boots so two replicas cannot seed twice.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(927352)`); err != nil {
		return 0, fmt.Errorf("travar seed: %w", err)
	}

	var existing int
	if err := tx.QueryRow(ctx, `SELECT count(*)::int FROM questions`).Scan(&existing); err != nil {
		return 0, fmt.Errorf("verificar questões: %w", err)
	}
	if existing > 0 {
		return 0, nil
	}

	for _, q := range questions {
		difficulty := q.Difficulty
		if difficulty < 1 || difficulty > 5 {
			difficulty = 3
		}
		source := q.Source
		if source == "" {
			source = "enem-macetado"
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO questions
				(subject, topic, statement, alternatives, correct_index, difficulty, explanation, source)
			VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)`,
			q.Subject, q.Topic, q.Statement, q.Alternatives, q.CorrectIndex, difficulty, q.Explanation, source,
		); err != nil {
			return 0, fmt.Errorf("inserir questão (%s/%s): %w", q.Subject, q.Topic, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return 0, fmt.Errorf("commit do seed: %w", err)
	}
	return len(questions), nil
}

// GetQuestion loads one question, including its answer key.
func (s *Store) GetQuestion(ctx context.Context, questionID string) (model.Question, error) {
	return getQuestion(ctx, s.pool, questionID)
}

func getQuestion(ctx context.Context, q querier, questionID string) (model.Question, error) {
	var out model.Question
	err := q.QueryRow(ctx, `
		SELECT `+questionColumns+` FROM questions WHERE id = $1::uuid`, questionID,
	).Scan(&out.ID, &out.Subject, &out.Topic, &out.Statement, &out.Alternatives,
		&out.CorrectIndex, &out.Difficulty, &out.Explanation, &out.Source)
	if err != nil {
		return model.Question{}, normalizeErr(err)
	}
	return out, nil
}

// ListQuestionIDs returns every question id in a stable pseudo-random order
// (md5 of the uuid), which keeps the demo seed deterministic between boots.
func (s *Store) ListQuestionIDs(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT id::text FROM questions ORDER BY md5(id::text)`)
	if err != nil {
		return nil, fmt.Errorf("listar questões: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("ler questões: %w", err)
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ler questões: %w", err)
	}
	return ids, nil
}

// LastAttempt summarizes the most recent answer to a question.
type LastAttempt struct {
	SelectedIndex int
	Correct       bool
}

// QuestionWithLastAttempt loads the tutor context for one question.
func (s *Store) QuestionWithLastAttempt(ctx context.Context, userID, questionID string) (model.Question, *LastAttempt, error) {
	question, err := s.GetQuestion(ctx, questionID)
	if err != nil {
		return model.Question{}, nil, err
	}
	var last LastAttempt
	err = s.pool.QueryRow(ctx, `
		SELECT selected_index, correct
		FROM attempts
		WHERE user_id = $1::uuid AND question_id = $2::uuid
		ORDER BY answered_at DESC, id DESC
		LIMIT 1`, userID, questionID,
	).Scan(&last.SelectedIndex, &last.Correct)
	if err != nil {
		if normalizeErr(err) == ErrNotFound {
			return question, nil, nil
		}
		return model.Question{}, nil, fmt.Errorf("carregar última tentativa: %w", err)
	}
	return question, &last, nil
}
