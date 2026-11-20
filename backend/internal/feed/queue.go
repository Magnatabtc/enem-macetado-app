package feed

import "github.com/Magnatabtc/enem-macetado/backend/internal/model"

// RecentWindowSize is the number of recently served question ids that the
// queue refuses to serve again immediately.
const RecentWindowSize = 15

// Queue is an in-memory, cursor-driven pool of scored questions for one user.
// It recycles the pool when the cursor reaches the end while avoiding the last
// RecentWindowSize ids.
type Queue struct {
	items     []model.FeedItem
	cursor    int
	recent    []string
	recentSet map[string]struct{}
}

// NewQueue builds a queue from pre-sorted items. Duplicate ids are dropped,
// keeping the best-scored occurrence.
func NewQueue(items []model.FeedItem) *Queue {
	return NewQueueWithRecent(items, nil)
}

// NewQueueWithRecent rebuilds a queue while preserving the recency window, so a
// TTL refresh or invalidation does not immediately repeat served questions.
func NewQueueWithRecent(items []model.FeedItem, recent []string) *Queue {
	seen := make(map[string]struct{}, len(items))
	deduped := make([]model.FeedItem, 0, len(items))
	for _, it := range items {
		if it.ID == "" {
			continue
		}
		if _, ok := seen[it.ID]; ok {
			continue
		}
		seen[it.ID] = struct{}{}
		deduped = append(deduped, it)
	}
	q := &Queue{
		items:     deduped,
		recent:    make([]string, 0, RecentWindowSize),
		recentSet: make(map[string]struct{}, RecentWindowSize),
	}
	for _, id := range recent {
		if id == "" {
			continue
		}
		if _, ok := q.recentSet[id]; ok {
			continue
		}
		q.remember(id)
	}
	return q
}

// Len returns the pool size.
func (q *Queue) Len() int {
	return len(q.items)
}

// Recent returns the ids in the recency window, oldest first.
func (q *Queue) Recent() []string {
	out := make([]string, len(q.recent))
	copy(out, q.recent)
	return out
}

// Next returns up to limit items, advancing the cursor and wrapping around the
// pool. Items still inside the recency window are skipped; if the whole pool is
// inside the window, the window is reset so the feed never stalls.
func (q *Queue) Next(limit int) []model.FeedItem {
	if limit <= 0 || len(q.items) == 0 {
		return []model.FeedItem{}
	}
	picked := make(map[string]struct{}, limit)

	out := q.take(limit, picked)
	if len(out) == 0 {
		q.resetRecent()
		out = q.take(limit, make(map[string]struct{}, limit))
	}
	for _, it := range out {
		q.remember(it.ID)
	}
	return out
}

func (q *Queue) take(limit int, picked map[string]struct{}) []model.FeedItem {
	out := make([]model.FeedItem, 0, limit)
	guard := len(q.items)*2 + limit
	for len(out) < limit && guard > 0 {
		guard--
		if q.cursor >= len(q.items) {
			q.cursor = 0
		}
		it := q.items[q.cursor]
		q.cursor++
		if _, dup := picked[it.ID]; dup {
			continue
		}
		if _, recent := q.recentSet[it.ID]; recent {
			continue
		}
		picked[it.ID] = struct{}{}
		out = append(out, it)
	}
	return out
}

func (q *Queue) remember(id string) {
	q.recent = append(q.recent, id)
	q.recentSet[id] = struct{}{}
	if len(q.recent) > RecentWindowSize {
		drop := q.recent[0]
		q.recent = q.recent[1:]
		delete(q.recentSet, drop)
	}
}

func (q *Queue) resetRecent() {
	q.recent = q.recent[:0]
	q.recentSet = make(map[string]struct{}, RecentWindowSize)
}
