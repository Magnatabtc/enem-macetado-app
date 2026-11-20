package model

import "time"

// User is the public representation of an account.
type User struct {
	ID        string
	Email     string
	Name      string
	Onboarded bool
	CreatedAt time.Time
}

// UserStats mirrors the user_stats table.
type UserStats struct {
	StreakDays     int
	BestStreak     int
	LastActiveDate *string // YYYY-MM-DD in APP_TIMEZONE, nil when never active
	DailyGoal      int
	TotalAnswered  int
	TotalCorrect   int
}

// Question mirrors the questions table (including the answer key, which must
// never be exposed by the feed endpoints).
type Question struct {
	ID           string
	Subject      string
	Topic        string
	Statement    string
	Alternatives []string
	CorrectIndex int
	Difficulty   int
	Explanation  string
	Source       string
}

// Candidate is a question enriched with per-user signals used by the feed
// scorer.
type Candidate struct {
	ID             string
	Subject        string
	Topic          string
	Statement      string
	Alternatives   []string
	Difficulty     int
	Weight         int
	TopicPriority  float64
	LastAnsweredAt *time.Time
}

// FeedItem is a scored candidate ready to be served to a client.
type FeedItem struct {
	ID           string
	Subject      string
	Topic        string
	Statement    string
	Alternatives []string
	Difficulty   int
	Score        float64
}

// Daily summarizes today's activity.
type Daily struct {
	Date     string
	Answered int
	Correct  int
	Goal     int
}

// Streak is the current/best day streak.
type Streak struct {
	Current        int
	Best           int
	LastActiveDate *string
}

// TopicStat mirrors topic_stats after an update.
type TopicStat struct {
	Subject          string
	Topic            string
	Priority         float64
	ConsecutiveWrong int
	CorrectCount     int
	WrongCount       int
}

// AttemptResult is the outcome of recording an attempt.
type AttemptResult struct {
	Correct      bool
	CorrectIndex int
	Explanation  string
	Topic        TopicStat
	Streak       Streak
	Daily        Daily
}

// SubjectProgress aggregates attempts for one subject.
type SubjectProgress struct {
	Subject     string
	Label       string
	Weight      int
	Answered    int
	Correct     int
	AvgPriority float64
}

// WeakTopic is a topic with priority above zero.
type WeakTopic struct {
	Subject          string
	Topic            string
	Priority         float64
	ConsecutiveWrong int
	CorrectCount     int
	WrongCount       int
}

// DayCount is the per-day activity used by the 14-day sparkline.
type DayCount struct {
	Date     string
	Answered int
	Correct  int
}

// Totals is the lifetime answered/correct aggregate.
type Totals struct {
	Answered int
	Correct  int
}
