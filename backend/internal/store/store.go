// Package store is the PostgreSQL access layer. Every query is parameterized
// and every multi-row mutation runs inside a transaction.
package store

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotFound is returned when a requested row does not exist.
var ErrNotFound = errors.New("não encontrado")

// ErrEmailTaken is returned when a unique e-mail constraint is violated.
var ErrEmailTaken = errors.New("e-mail já cadastrado")

// Store wraps the pgx pool.
type Store struct {
	pool *pgxpool.Pool
	loc  *time.Location
}

// Connect opens a pool and pings it, retrying until attempts are exhausted.
func Connect(ctx context.Context, dsn string, loc *time.Location, attempts int, delay time.Duration, logger *slog.Logger) (*Store, error) {
	if loc == nil {
		loc = time.UTC
	}
	if attempts <= 0 {
		attempts = 1
	}
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("DATABASE_URL inválida: %w", err)
	}
	cfg.MaxConns = 10
	cfg.MinConns = 1
	cfg.MaxConnLifetime = 30 * time.Minute
	cfg.MaxConnIdleTime = 5 * time.Minute
	cfg.HealthCheckPeriod = 30 * time.Second
	if cfg.ConnConfig.ConnectTimeout <= 0 {
		cfg.ConnConfig.ConnectTimeout = 5 * time.Second
	}

	var lastErr error
	for attempt := 1; attempt <= attempts; attempt++ {
		pool, err := pgxpool.NewWithConfig(ctx, cfg)
		if err == nil {
			pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
			err = pool.Ping(pingCtx)
			cancel()
			if err == nil {
				return &Store{pool: pool, loc: loc}, nil
			}
			pool.Close()
		}
		lastErr = err
		if logger != nil {
			logger.Warn("database indisponível", "attempt", attempt, "max_attempts", attempts, "error", err)
		}
		if attempt == attempts {
			break
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(delay):
		}
	}
	return nil, fmt.Errorf("não foi possível conectar ao banco após %d tentativas: %w", attempts, lastErr)
}

// Close releases every pooled connection.
func (s *Store) Close() {
	s.pool.Close()
}

// Ping checks database connectivity.
func (s *Store) Ping(ctx context.Context) error {
	return s.pool.Ping(ctx)
}

// querier is satisfied by both pgxpool.Pool and pgx.Tx.
type querier interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func (s *Store) tzName() string {
	name := s.loc.String()
	if name == "" || name == "Local" {
		return "UTC"
	}
	return name
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

func normalizeErr(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if isForeignKeyViolation(err) {
		return ErrNotFound
	}
	return err
}
