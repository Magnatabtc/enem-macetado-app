package feed

import (
	"testing"
	"time"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

func TestScore(t *testing.T) {
	now := time.Date(2026, 11, 20, 18, 0, 0, 0, time.UTC)
	oneHourAgo := now.Add(-time.Hour)
	exactlySixHours := now.Add(-RecentWindow)
	sevenHoursAgo := now.Add(-7 * time.Hour)

	tests := []struct {
		name     string
		weight   int
		priority float64
		last     *time.Time
		jitter   float64
		want     float64
	}{
		{"unseen default weight", 3, 0, nil, 0, 42},
		{"unseen high weight", 5, 0, nil, 0, 62},
		{"recent answer", 5, 100, &oneHourAgo, 2, 112},
		{"seen long ago", 1, 10, &sevenHoursAgo, 0, 12},
		{"six hour boundary is recent", 3, 0, &exactlySixHours, 0, -10},
		{"priority clamped", 3, 250, nil, 0, 142},
		{"weight clamped down", 9, 0, nil, 0, 62},
		{"weight clamped up", 0, 0, nil, 3.5, 45.5},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := Score(tc.weight, tc.priority, tc.last, now, tc.jitter)
			if got != tc.want {
				t.Fatalf("Score() = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestScoreJitterBounds(t *testing.T) {
	now := time.Now()
	low := Score(3, 0, nil, now, -10)
	high := Score(3, 0, nil, now, 99)
	if low != 42 {
		t.Fatalf("negative jitter not clamped: %v", low)
	}
	if high > 46 {
		t.Fatalf("large jitter not clamped: %v", high)
	}
}

func TestBuildItemsOrder(t *testing.T) {
	now := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	candidates := []model.Candidate{
		{ID: "low", Subject: "matematica", Topic: "A", TopicPriority: 0, Weight: 1},
		{ID: "high", Subject: "matematica", Topic: "B", TopicPriority: 100, Weight: 5},
		{ID: "mid", Subject: "fisica", Topic: "C", TopicPriority: 20, Weight: 3},
	}
	items := BuildItems(candidates, now, func() float64 { return 0 })
	if len(items) != 3 {
		t.Fatalf("len = %d", len(items))
	}
	if items[0].ID != "high" || items[1].ID != "mid" || items[2].ID != "low" {
		t.Fatalf("order = %s, %s, %s", items[0].ID, items[1].ID, items[2].ID)
	}
	if items[0].Score != 162 {
		t.Fatalf("high score = %v, want 162", items[0].Score)
	}
}

func TestIsPriority(t *testing.T) {
	if !IsPriority(80) || !IsPriority(100) || IsPriority(79.9) {
		t.Fatal("threshold mismatch")
	}
}
