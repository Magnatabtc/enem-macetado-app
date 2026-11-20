// Package feed implements the ENEM priority algorithm: a pure scorer, the
// priority update rules, and a per-user in-memory queue with a recency window.
package feed

import (
	"math"
	"sort"
	"time"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
)

// Algorithm constants. They live in this single block on purpose so the
// priority model can be audited without hunting through handlers.
const (
	// SubjectWeightMultiplier turns the onboarding weight (1..5) into points.
	SubjectWeightMultiplier = 10.0
	// UnseenBonus rewards questions the user has never answered.
	UnseenBonus = 12.0
	// RecentWrongPenalty pushes down questions answered in the last window.
	RecentPenalty = -40.0
	// SeenPenalty pushes down questions answered at any point in the past.
	SeenPenalty = -8.0
	// RecentWindow is how long a question is considered "just answered".
	RecentWindow = 6 * time.Hour
	// MaxPriority caps topic priority.
	MaxPriority = 100.0
	// PriorityThreshold marks a topic as maximum priority.
	PriorityThreshold = 80.0
	// MaxJitter keeps random variety below 4 points.
	MaxJitter = 4.0
)

// SubjectBase converts an onboarding weight into the base score.
func SubjectBase(weight int) float64 {
	if weight < 1 {
		weight = 3
	}
	if weight > 5 {
		weight = 5
	}
	return float64(weight) * SubjectWeightMultiplier
}

// RecencyPenalty returns the penalty for a question answered at lastAnswered.
// Never answered -> 0; answered within RecentWindow -> -40; otherwise -8.
func RecencyPenalty(lastAnswered *time.Time, now time.Time) float64 {
	if lastAnswered == nil {
		return 0
	}
	delta := now.Sub(*lastAnswered)
	if delta < 0 {
		delta = -delta
	}
	if delta <= RecentWindow {
		return RecentPenalty
	}
	return SeenPenalty
}

// Score is the documented priority formula:
//
//	subjectBase + topicPriority + unseenBonus + recencyPenalty + jitter
func Score(weight int, topicPriority float64, lastAnswered *time.Time, now time.Time, jitter float64) float64 {
	priority := clampPriority(topicPriority)
	unseen := 0.0
	if lastAnswered == nil {
		unseen = UnseenBonus
	}
	return SubjectBase(weight) + priority + unseen + RecencyPenalty(lastAnswered, now) + clampJitter(jitter)
}

// IsPriority reports whether a topic priority is at max priority.
func IsPriority(priority float64) bool {
	return priority >= PriorityThreshold
}

// BuildItems scores candidates and returns them sorted by descending score.
// Ties are broken by ascending id so behavior is deterministic. jitter must
// return a value in [0, 4); nil means no jitter (useful in tests).
func BuildItems(candidates []model.Candidate, now time.Time, jitter func() float64) []model.FeedItem {
	items := make([]model.FeedItem, 0, len(candidates))
	for _, c := range candidates {
		j := 0.0
		if jitter != nil {
			j = jitter()
		}
		items = append(items, model.FeedItem{
			ID:           c.ID,
			Subject:      c.Subject,
			Topic:        c.Topic,
			Statement:    c.Statement,
			Alternatives: c.Alternatives,
			Difficulty:   c.Difficulty,
			Score:        Score(c.Weight, c.TopicPriority, c.LastAnsweredAt, now, j),
		})
	}
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Score == items[j].Score {
			return items[i].ID < items[j].ID
		}
		return items[i].Score > items[j].Score
	})
	return items
}

func clampPriority(p float64) float64 {
	if math.IsNaN(p) || p < 0 {
		return 0
	}
	if p > MaxPriority {
		return MaxPriority
	}
	return p
}

func clampJitter(j float64) float64 {
	if math.IsNaN(j) || j < 0 {
		return 0
	}
	if j >= MaxJitter {
		return math.Nextafter(MaxJitter, 0)
	}
	return j
}
