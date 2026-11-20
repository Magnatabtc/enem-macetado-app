package metrics

import (
	"testing"
	"time"
)

func TestNextStreak(t *testing.T) {
	day := "2026-11-20"
	yesterday := "2026-11-19"
	twoDaysAgo := "2026-11-18"
	same := day

	tests := []struct {
		name        string
		current     int
		best        int
		lastActive  *string
		wantCurrent int
		wantBest    int
	}{
		{"first ever", 0, 0, nil, 1, 1},
		{"same day keeps", 4, 7, &same, 4, 7},
		{"same day repairs zero", 0, 5, &same, 1, 5},
		{"yesterday increments", 3, 3, &yesterday, 4, 4},
		{"gap resets", 9, 9, &twoDaysAgo, 1, 9},
		{"best preserved", 2, 10, &yesterday, 3, 10},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			cur, best := NextStreak(tc.current, tc.best, tc.lastActive, day)
			if cur != tc.wantCurrent || best != tc.wantBest {
				t.Fatalf("NextStreak() = (%d,%d), want (%d,%d)", cur, best, tc.wantCurrent, tc.wantBest)
			}
		})
	}
}

func TestDayHelpers(t *testing.T) {
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		t.Skipf("timezone unavailable: %v", err)
	}
	// 2026-11-21T02:30Z is still 2026-11-20 in São Paulo (UTC-3).
	instant := time.Date(2026, 11, 21, 2, 30, 0, 0, time.UTC)
	if got := DayKey(instant, loc); got != "2026-11-20" {
		t.Fatalf("DayKey = %q, want 2026-11-20", got)
	}
	start := StartOfDay(instant, loc)
	if start.Hour() != 0 || start.Day() != 20 {
		t.Fatalf("StartOfDay = %v", start)
	}
	if next := NextDayStart(instant, loc); next.Day() != 21 || next.Hour() != 0 {
		t.Fatalf("NextDayStart = %v", next)
	}
	if AddDays("2026-03-01", -1) != "2026-02-28" {
		t.Fatalf("AddDays failed")
	}
}

func TestAccuracyAndRound(t *testing.T) {
	if got := Accuracy(0, 0); got != 0 {
		t.Fatalf("Accuracy(0,0) = %v", got)
	}
	if got := Accuracy(30, 42); got != 71.4 {
		t.Fatalf("Accuracy(30,42) = %v, want 71.4", got)
	}
	if got := Round1(38.46); got != 38.5 {
		t.Fatalf("Round1 = %v", got)
	}
	if got := DayKey(time.Now(), nil); len(got) != 10 {
		t.Fatalf("DayKey with nil loc = %q", got)
	}
}

func TestDaysBefore(t *testing.T) {
	days := DaysBefore("2026-11-20", 14)
	if len(days) != 14 {
		t.Fatalf("len = %d", len(days))
	}
	if days[0] != "2026-11-07" || days[13] != "2026-11-20" {
		t.Fatalf("range = %s..%s", days[0], days[13])
	}
}
