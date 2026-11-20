package store

import (
	"context"
	"fmt"
)

// migrationStatements is the exact DDL from the build contract, split into
// individual statements so pgx can run them through the extended protocol.
var migrationStatements = []string{
	`CREATE EXTENSION IF NOT EXISTS pgcrypto`,

	`CREATE TABLE IF NOT EXISTS users (
		id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
		email text NOT NULL UNIQUE,
		password_hash text NOT NULL,
		name text NOT NULL,
		onboarded boolean NOT NULL DEFAULT false,
		created_at timestamptz NOT NULL DEFAULT now()
	)`,

	`CREATE TABLE IF NOT EXISTS subject_weights (
		user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		subject text NOT NULL,
		weight int NOT NULL CHECK (weight BETWEEN 1 AND 5),
		PRIMARY KEY (user_id, subject)
	)`,

	`CREATE TABLE IF NOT EXISTS questions (
		id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
		subject text NOT NULL,
		topic text NOT NULL,
		statement text NOT NULL,
		alternatives jsonb NOT NULL,
		correct_index int NOT NULL CHECK (correct_index BETWEEN 0 AND 4),
		difficulty int NOT NULL DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5),
		explanation text NOT NULL,
		source text NOT NULL DEFAULT 'enem-macetado',
		created_at timestamptz NOT NULL DEFAULT now()
	)`,

	`CREATE INDEX IF NOT EXISTS questions_subject_idx ON questions(subject)`,

	`CREATE TABLE IF NOT EXISTS attempts (
		id bigserial PRIMARY KEY,
		user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
		selected_index int NOT NULL CHECK (selected_index BETWEEN 0 AND 4),
		correct boolean NOT NULL,
		elapsed_ms int NOT NULL DEFAULT 0,
		mode text NOT NULL DEFAULT 'feed',
		answered_at timestamptz NOT NULL DEFAULT now()
	)`,

	`CREATE INDEX IF NOT EXISTS attempts_user_time_idx ON attempts(user_id, answered_at DESC)`,
	`CREATE INDEX IF NOT EXISTS attempts_user_question_idx ON attempts(user_id, question_id)`,

	`CREATE TABLE IF NOT EXISTS topic_stats (
		user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		subject text NOT NULL,
		topic text NOT NULL,
		priority double precision NOT NULL DEFAULT 0,
		consecutive_wrong int NOT NULL DEFAULT 0,
		correct_count int NOT NULL DEFAULT 0,
		wrong_count int NOT NULL DEFAULT 0,
		last_answered_at timestamptz,
		PRIMARY KEY (user_id, subject, topic)
	)`,

	`CREATE TABLE IF NOT EXISTS user_stats (
		user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
		streak_days int NOT NULL DEFAULT 0,
		best_streak int NOT NULL DEFAULT 0,
		last_active_date date,
		daily_goal int NOT NULL DEFAULT 12,
		total_answered int NOT NULL DEFAULT 0,
		total_correct int NOT NULL DEFAULT 0,
		updated_at timestamptz NOT NULL DEFAULT now()
	)`,
}

// Migrate applies the idempotent schema. It is safe to run on every boot.
func (s *Store) Migrate(ctx context.Context) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("iniciar migração: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Serialize concurrent boots of multiple API instances.
	if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(927351)`); err != nil {
		return fmt.Errorf("travar migração: %w", err)
	}

	for i, stmt := range migrationStatements {
		if _, err := tx.Exec(ctx, stmt); err != nil {
			return fmt.Errorf("migração (statement %d): %w", i+1, err)
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit da migração: %w", err)
	}
	return nil
}
