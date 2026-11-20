// Package metrics contains pure date, streak and accuracy helpers shared by
// the store and the HTTP layer. All date keys use the APP_TIMEZONE calendar.
package metrics

import (
	"math"
	"time"
)

// DayLayout is the canonical day-key layout (YYYY-MM-DD).
const DayLayout = "2006-01-02"

// DayKey formats t as a YYYY-MM-DD calendar day in loc.
func DayKey(t time.Time, loc *time.Location) string {
	if loc == nil {
		loc = time.UTC
	}
	return t.In(loc).Format(DayLayout)
}

// StartOfDay returns midnight of t's calendar day in loc.
func StartOfDay(t time.Time, loc *time.Location) time.Time {
	if loc == nil {
		loc = time.UTC
	}
	local := t.In(loc)
	return time.Date(local.Year(), local.Month(), local.Day(), 0, 0, 0, 0, loc)
}

// NextDayStart returns midnight of the day after t's calendar day in loc.
func NextDayStart(t time.Time, loc *time.Location) time.Time {
	return StartOfDay(t, loc).AddDate(0, 0, 1)
}

// AddDays shifts a YYYY-MM-DD day key by n days. Invalid keys return "".
func AddDays(dayKey string, n int) string {
	parsed, err := time.Parse(DayLayout, dayKey)
	if err != nil {
		return ""
	}
	return parsed.AddDate(0, 0, n).Format(DayLayout)
}

// NextStreak applies the daily-streak rules for an activity that happened at
// dayKey (already in APP_TIMEZONE):
//
//   - no previous activity -> 1
//   - same day -> unchanged
//   - yesterday -> +1
//   - older than yesterday -> reset to 1
//
// best is always raised to at least the new current streak.
func NextStreak(current, best int, lastActive *string, dayKey string) (int, int) {
	if current < 0 {
		current = 0
	}
	if best < 0 {
		best = 0
	}
	if lastActive == nil || *lastActive == "" {
		current = 1
	} else if *lastActive == dayKey {
		if current < 1 {
			current = 1
		}
	} else if *lastActive == AddDays(dayKey, -1) {
		current++
	} else {
		current = 1
	}
	if current > best {
		best = current
	}
	return current, best
}

// Round1 rounds v to one decimal place.
func Round1(v float64) float64 {
	return math.Round(v*10) / 10
}

// Accuracy returns correct/answered as a percentage rounded to one decimal.
// It returns 0 when there are no answers.
func Accuracy(correct, answered int) float64 {
	if answered <= 0 {
		return 0
	}
	return Round1(float64(correct) * 100 / float64(answered))
}

// DaysBefore returns n chronological day keys ending at today (oldest first).
func DaysBefore(today string, n int) []string {
	if n <= 0 {
		return nil
	}
	parsed, err := time.Parse(DayLayout, today)
	if err != nil {
		return nil
	}
	days := make([]string, 0, n)
	for i := n - 1; i >= 0; i-- {
		days = append(days, parsed.AddDate(0, 0, -i).Format(DayLayout))
	}
	return days
}
