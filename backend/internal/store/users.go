package store

import (
	"context"
	"fmt"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

// NewUser is the input for account creation.
type NewUser struct {
	Email        string
	PasswordHash string
	Name         string
	Onboarded    bool
	Weights      map[string]int
	DailyGoal    int
}

// CreateUser inserts the user, the ten subject weights and the user_stats row
// in one transaction. Returns ErrEmailTaken on a duplicate e-mail.
func (s *Store) CreateUser(ctx context.Context, in NewUser) (model.User, error) {
	weights := in.Weights
	if len(weights) == 0 {
		weights = model.DefaultWeights()
	}
	goal := in.DailyGoal
	if goal < 4 || goal > 50 {
		goal = 12
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return model.User{}, fmt.Errorf("iniciar criação de usuário: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var user model.User
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, name, onboarded)
		VALUES ($1, $2, $3, $4)
		RETURNING id::text, email, name, onboarded, created_at`,
		in.Email, in.PasswordHash, in.Name, in.Onboarded,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Onboarded, &user.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return model.User{}, ErrEmailTaken
		}
		return model.User{}, fmt.Errorf("inserir usuário: %w", err)
	}

	for _, subject := range model.Subjects {
		w := weights[subject.Key]
		if w < 1 || w > 5 {
			w = 3
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO subject_weights (user_id, subject, weight)
			VALUES ($1::uuid, $2, $3)
			ON CONFLICT (user_id, subject) DO UPDATE SET weight = EXCLUDED.weight`,
			user.ID, subject.Key, w,
		); err != nil {
			return model.User{}, fmt.Errorf("inserir pesos: %w", err)
		}
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO user_stats (user_id, daily_goal)
		VALUES ($1::uuid, $2)
		ON CONFLICT (user_id) DO UPDATE SET daily_goal = EXCLUDED.daily_goal`,
		user.ID, goal,
	); err != nil {
		return model.User{}, fmt.Errorf("inserir user_stats: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return model.User{}, fmt.Errorf("commit da criação de usuário: %w", err)
	}
	return user, nil
}

// GetUserByEmail returns the user and its password hash.
func (s *Store) GetUserByEmail(ctx context.Context, email string) (model.User, string, error) {
	var user model.User
	var hash string
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, email, name, onboarded, created_at, password_hash
		FROM users WHERE email = $1`, email,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Onboarded, &user.CreatedAt, &hash)
	if err != nil {
		return model.User{}, "", normalizeErr(err)
	}
	return user, hash, nil
}

// GetUserByID returns a user by primary key.
func (s *Store) GetUserByID(ctx context.Context, userID string) (model.User, error) {
	var user model.User
	err := s.pool.QueryRow(ctx, `
		SELECT id::text, email, name, onboarded, created_at
		FROM users WHERE id = $1::uuid`, userID,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Onboarded, &user.CreatedAt)
	if err != nil {
		return model.User{}, normalizeErr(err)
	}
	return user, nil
}

// UpdateProfile updates the optional name and/or daily goal.
func (s *Store) UpdateProfile(ctx context.Context, userID string, name *string, dailyGoal *int) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("iniciar atualização de perfil: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	if name != nil {
		tag, err := tx.Exec(ctx, `UPDATE users SET name = $2 WHERE id = $1::uuid`, userID, *name)
		if err != nil {
			return fmt.Errorf("atualizar nome: %w", err)
		}
		if tag.RowsAffected() == 0 {
			return ErrNotFound
		}
	}
	if dailyGoal != nil {
		if err := ensureUserStatsTx(ctx, tx, userID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			UPDATE user_stats SET daily_goal = $2, updated_at = now() WHERE user_id = $1::uuid`,
			userID, *dailyGoal,
		); err != nil {
			return fmt.Errorf("atualizar meta diária: %w", err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit do perfil: %w", err)
	}
	return nil
}

// GetWeights returns all ten subject weights, filling gaps with 3.
func (s *Store) GetWeights(ctx context.Context, userID string) (map[string]int, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT subject, weight FROM subject_weights WHERE user_id = $1::uuid`, userID)
	if err != nil {
		return nil, fmt.Errorf("carregar pesos: %w", err)
	}
	defer rows.Close()

	raw := make(map[string]int, len(model.Subjects))
	for rows.Next() {
		var subject string
		var weight int
		if err := rows.Scan(&subject, &weight); err != nil {
			return nil, fmt.Errorf("ler pesos: %w", err)
		}
		raw[subject] = weight
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("ler pesos: %w", err)
	}
	return model.CompleteWeights(raw), nil
}

// SetOnboarding stores the validated weights and marks the user onboarded.
func (s *Store) SetOnboarding(ctx context.Context, userID string, weights map[string]int) error {
	validated, err := model.ValidateWeights(weights)
	if err != nil {
		return err
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("iniciar onboarding: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	tag, err := tx.Exec(ctx, `UPDATE users SET onboarded = true WHERE id = $1::uuid`, userID)
	if err != nil {
		return fmt.Errorf("marcar onboarding: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}

	for _, subject := range model.Subjects {
		if _, err := tx.Exec(ctx, `
			INSERT INTO subject_weights (user_id, subject, weight)
			VALUES ($1::uuid, $2, $3)
			ON CONFLICT (user_id, subject) DO UPDATE SET weight = EXCLUDED.weight`,
			userID, subject.Key, validated[subject.Key],
		); err != nil {
			return fmt.Errorf("salvar pesos: %w", err)
		}
	}

	if err := ensureUserStatsTx(ctx, tx, userID); err != nil {
		return err
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit do onboarding: %w", err)
	}
	return nil
}

// GetUserStats returns the aggregate stats, creating the row when missing.
func (s *Store) GetUserStats(ctx context.Context, userID string) (model.UserStats, error) {
	if err := ensureUserStats(ctx, s.pool, userID); err != nil {
		return model.UserStats{}, err
	}
	return loadUserStats(ctx, s.pool, userID)
}

func loadUserStats(ctx context.Context, q querier, userID string) (model.UserStats, error) {
	var st model.UserStats
	var lastActive *string
	err := q.QueryRow(ctx, `
		SELECT streak_days, best_streak, to_char(last_active_date, 'YYYY-MM-DD'),
		       daily_goal, total_answered, total_correct
		FROM user_stats WHERE user_id = $1::uuid`, userID,
	).Scan(&st.StreakDays, &st.BestStreak, &lastActive, &st.DailyGoal, &st.TotalAnswered, &st.TotalCorrect)
	if err != nil {
		return model.UserStats{}, normalizeErr(err)
	}
	st.LastActiveDate = lastActive
	return st, nil
}

func ensureUserStats(ctx context.Context, q querier, userID string) error {
	if err := ensureUserStatsTx(ctx, q, userID); err != nil {
		return normalizeErr(err)
	}
	return nil
}

func ensureUserStatsTx(ctx context.Context, q querier, userID string) error {
	_, err := q.Exec(ctx, `
		INSERT INTO user_stats (user_id) VALUES ($1::uuid)
		ON CONFLICT (user_id) DO NOTHING`, userID)
	if err != nil {
		return normalizeErr(err)
	}
	return nil
}
