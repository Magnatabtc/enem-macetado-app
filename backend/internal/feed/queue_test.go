package feed

import (
	"fmt"
	"testing"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

func makeItems(n int) []model.FeedItem {
	items := make([]model.FeedItem, 0, n)
	for i := 0; i < n; i++ {
		items = append(items, model.FeedItem{ID: fmt.Sprintf("q%02d", i), Score: float64(n - i)})
	}
	return items
}

func TestQueueNoImmediateRepetition(t *testing.T) {
	q := NewQueue(makeItems(20))

	first := q.Next(10)
	if len(first) != 10 {
		t.Fatalf("first batch = %d", len(first))
	}
	second := q.Next(10)
	if len(second) != 10 {
		t.Fatalf("second batch = %d", len(second))
	}

	seen := make(map[string]bool, 20)
	for _, it := range append(first, second...) {
		if seen[it.ID] {
			t.Fatalf("id %s served twice before wrapping", it.ID)
		}
		seen[it.ID] = true
	}
	if first[0].ID != "q00" || second[0].ID != "q10" {
		t.Fatalf("cursor order = %s, %s", first[0].ID, second[0].ID)
	}

	// Third call starts at the top but must skip the 15 most recent ids.
	third := q.Next(10)
	if len(third) != 5 {
		t.Fatalf("third batch = %d, want 5 (rest is inside the recency window)", len(third))
	}
	for _, it := range third {
		if it.ID >= "q06" {
			t.Fatalf("recent id %s served again", it.ID)
		}
	}
}

func TestQueueCyclesWhenPoolFitsInWindow(t *testing.T) {
	q := NewQueue(makeItems(5))
	if got := len(q.Next(5)); got != 5 {
		t.Fatalf("first = %d", got)
	}
	if got := len(q.Next(5)); got != 5 {
		t.Fatalf("second = %d, want 5 after recency reset", got)
	}
	if len(q.Recent()) != 5 {
		t.Fatalf("recent = %d", len(q.Recent()))
	}
}

func TestQueueDedupesAndHandlesEmpty(t *testing.T) {
	q := NewQueue([]model.FeedItem{{ID: "a"}, {ID: "a"}, {ID: "b"}})
	if q.Len() != 2 {
		t.Fatalf("len = %d", q.Len())
	}
	if got := NewQueue(nil).Next(3); len(got) != 0 {
		t.Fatalf("empty queue returned %d", len(got))
	}
	if got := q.Next(0); len(got) != 0 {
		t.Fatalf("zero limit returned %d", len(got))
	}
}

func TestQueueRecentWindowCaps(t *testing.T) {
	q := NewQueue(makeItems(40))
	for i := 0; i < 5; i++ {
		q.Next(4)
	}
	if got := len(q.Recent()); got != RecentWindowSize {
		t.Fatalf("recent size = %d, want %d", got, RecentWindowSize)
	}
}
