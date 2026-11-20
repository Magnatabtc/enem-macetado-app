package feed

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

type fakeLoader struct {
	mu    sync.Mutex
	calls int
	items []model.Candidate
	err   error
}

func (f *fakeLoader) LoadCandidates(ctx context.Context, userID string) ([]model.Candidate, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return f.items, nil
}

func (f *fakeLoader) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func TestServiceCachesUntilInvalidated(t *testing.T) {
	loader := &fakeLoader{items: []model.Candidate{
		{ID: "a", Weight: 3},
		{ID: "b", Weight: 3},
		{ID: "c", Weight: 3},
	}}
	clock := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	now := func() time.Time { return clock }

	svc := New(loader, Options{
		TTL:    DefaultTTL,
		Now:    now,
		Jitter: func() float64 { return 0 },
	})

	first, err := svc.Next(context.Background(), "user-1", 2)
	if err != nil {
		t.Fatal(err)
	}
	if len(first) != 2 {
		t.Fatalf("first = %d", len(first))
	}
	if _, err := svc.Next(context.Background(), "user-1", 2); err != nil {
		t.Fatal(err)
	}
	if loader.count() != 1 {
		t.Fatalf("loader calls = %d, want 1 (cache)", loader.count())
	}
	// Different user has an independent queue.
	if _, err := svc.Next(context.Background(), "user-2", 2); err != nil {
		t.Fatal(err)
	}
	if loader.count() != 2 {
		t.Fatalf("loader calls = %d, want 2", loader.count())
	}

	// Invalidation forces a reload for the first user only.
	svc.Invalidate("user-1")
	if _, err := svc.Next(context.Background(), "user-1", 2); err != nil {
		t.Fatal(err)
	}
	if loader.count() != 3 {
		t.Fatalf("loader calls = %d, want 3 after invalidation", loader.count())
	}

	// TTL expiry also forces a reload.
	clock = clock.Add(DefaultTTL + time.Second)
	if _, err := svc.Next(context.Background(), "user-1", 2); err != nil {
		t.Fatal(err)
	}
	if loader.count() != 4 {
		t.Fatalf("loader calls = %d, want 4 after TTL", loader.count())
	}
}

func TestServicePropagatesLoaderError(t *testing.T) {
	loader := &fakeLoader{err: errors.New("boom")}
	svc := New(loader, Options{Jitter: func() float64 { return 0 }})
	if _, err := svc.Next(context.Background(), "user", 5); err == nil {
		t.Fatal("expected error")
	}
}

func TestServiceZeroLimit(t *testing.T) {
	loader := &fakeLoader{}
	svc := New(loader, Options{Jitter: func() float64 { return 0 }})
	items, err := svc.Next(context.Background(), "user", 0)
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 0 || loader.count() != 0 {
		t.Fatalf("zero limit hit loader: items=%d calls=%d", len(items), loader.count())
	}
}

func TestServicePreservesRecencyAcrossTTL(t *testing.T) {
	candidates := make([]model.Candidate, 0, 10)
	for i := 0; i < 10; i++ {
		candidates = append(candidates, model.Candidate{
			ID:     fmt.Sprintf("q%02d", i),
			Weight: 3,
		})
	}
	loader := &fakeLoader{items: candidates}
	clock := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	svc := New(loader, Options{
		TTL:    time.Minute,
		Now:    func() time.Time { return clock },
		Jitter: func() float64 { return 0 },
	})

	first, err := svc.Next(context.Background(), "user", 5)
	if err != nil {
		t.Fatal(err)
	}
	served := make(map[string]bool, 5)
	for _, item := range first {
		served[item.ID] = true
	}

	// Rebuild after the TTL: the recency window must survive.
	clock = clock.Add(2 * time.Minute)
	second, err := svc.Next(context.Background(), "user", 5)
	if err != nil {
		t.Fatal(err)
	}
	if loader.count() != 2 {
		t.Fatalf("loader calls = %d, want 2", loader.count())
	}
	for _, item := range second {
		if served[item.ID] {
			t.Fatalf("id %s repeated right after TTL rebuild", item.ID)
		}
	}
}

func TestServicePurgesIdleQueues(t *testing.T) {
	loader := &fakeLoader{items: []model.Candidate{{ID: "a", Weight: 3}}}
	clock := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	svc := New(loader, Options{
		TTL:    time.Minute,
		Now:    func() time.Time { return clock },
		Jitter: func() float64 { return 0 },
	})
	if _, err := svc.Next(context.Background(), "idle", 1); err != nil {
		t.Fatal(err)
	}
	clock = clock.Add(10 * time.Minute)
	svc.Purge()
	svc.mu.Lock()
	n := len(svc.states)
	svc.mu.Unlock()
	if n != 0 {
		t.Fatalf("states after purge = %d, want 0", n)
	}
}
