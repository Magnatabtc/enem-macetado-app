package feed

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

// DefaultTTL is the user queue lifetime before it is rebuilt from the database.
const DefaultTTL = 120 * time.Second

// Loader loads the scored candidates for one user. The store implements it.
type Loader interface {
	LoadCandidates(ctx context.Context, userID string) ([]model.Candidate, error)
}

// Options tunes the service. Zero values pick production defaults.
type Options struct {
	TTL    time.Duration
	Now    func() time.Time
	Jitter func() float64
	Logger *slog.Logger
}

type entry struct {
	queue   *Queue
	builtAt time.Time
}

type userState struct {
	mu       sync.Mutex
	entry    *entry
	recent   []string
	lastUsed time.Time
}

// Service keeps one queue per user and rebuilds it from the database when the
// TTL expires or after an explicit invalidation.
type Service struct {
	mu     sync.Mutex
	states map[string]*userState

	loader Loader
	ttl    time.Duration
	now    func() time.Time
	jitter func() float64
	logger *slog.Logger
}

// New creates a feed service. A nil logger disables janitor logging.
func New(loader Loader, opts Options) *Service {
	ttl := opts.TTL
	if ttl <= 0 {
		ttl = DefaultTTL
	}
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	jitter := opts.Jitter
	if jitter == nil {
		jitter = defaultJitter
	}
	return &Service{
		states: make(map[string]*userState),
		loader: loader,
		ttl:    ttl,
		now:    now,
		jitter: jitter,
		logger: opts.Logger,
	}
}

func defaultJitter() float64 {
	return randFloat() * MaxJitter
}

// Next returns up to limit scored questions for the user, reusing the cached
// queue when it is still fresh.
func (s *Service) Next(ctx context.Context, userID string, limit int) ([]model.FeedItem, error) {
	if limit <= 0 {
		return []model.FeedItem{}, nil
	}
	st := s.state(userID)
	st.mu.Lock()
	defer st.mu.Unlock()

	if st.entry != nil {
		age := s.now().Sub(st.entry.builtAt)
		if age >= 0 && age < s.ttl {
			items := st.entry.queue.Next(limit)
			st.recent = st.entry.queue.Recent()
			return items, nil
		}
	}

	candidates, err := s.loader.LoadCandidates(ctx, userID)
	if err != nil {
		return nil, err
	}
	items := BuildItems(candidates, s.now(), s.jitter)
	queue := NewQueueWithRecent(items, st.recent)
	st.entry = &entry{queue: queue, builtAt: s.now()}
	out := queue.Next(limit)
	st.recent = queue.Recent()
	return out, nil
}

// Invalidate drops the cached queue for a user (after an attempt or onboarding
// change).
func (s *Service) Invalidate(userID string) {
	s.mu.Lock()
	st := s.states[userID]
	s.mu.Unlock()
	if st == nil {
		return
	}
	st.mu.Lock()
	st.entry = nil
	st.mu.Unlock()
}

// Run starts the janitor that evicts idle user queues until ctx is done.
func (s *Service) Run(ctx context.Context) {
	interval := 2 * s.ttl
	if interval < time.Minute {
		interval = time.Minute
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.purge()
		}
	}
}

// Purge removes expired queues. It is exported for tests and operational tools.
func (s *Service) Purge() {
	s.purge()
}

func (s *Service) purge() {
	cutoff := s.now().Add(-5 * s.ttl)
	removed := 0
	s.mu.Lock()
	defer s.mu.Unlock()
	for id, st := range s.states {
		if st.lastUsed.After(cutoff) {
			continue
		}
		if st.mu.TryLock() {
			st.mu.Unlock()
			delete(s.states, id)
			removed++
		}
	}
	if removed > 0 && s.logger != nil {
		s.logger.Debug("feed queues evicted", "count", removed)
	}
}

func (s *Service) state(userID string) *userState {
	s.mu.Lock()
	defer s.mu.Unlock()
	st := s.states[userID]
	if st == nil {
		st = &userState{}
		s.states[userID] = st
	}
	st.lastUsed = s.now()
	return st
}
