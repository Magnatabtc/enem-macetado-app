package seed

import (
	"os"
	"testing"
	"time"
)

func TestParseQuestionsValid(t *testing.T) {
	payload := []byte(`[
		{
			"subject": "matematica",
			"topic": "Função afim",
			"statement": "Um taxista cobra R$ 5 fixos mais R$ 2 por km. Qual o custo de 10 km?",
			"alternatives": ["R$ 20", "R$ 25", "R$ 30", "R$ 35", "R$ 40"],
			"correct_index": 1,
			"difficulty": 2,
			"explanation": "O custo é 5 + 2*10 = 25."
		}
	]`)
	questions, problems, err := ParseQuestions(payload)
	if err != nil {
		t.Fatal(err)
	}
	if len(problems) != 0 {
		t.Fatalf("problems = %v", problems)
	}
	if len(questions) != 1 {
		t.Fatalf("len = %d", len(questions))
	}
	q := questions[0]
	if q.Subject != "matematica" || q.CorrectIndex != 1 || len(q.Alternatives) != 5 || q.Difficulty != 2 {
		t.Fatalf("unexpected question: %+v", q)
	}
	if q.Source != "enem-macetado" {
		t.Fatalf("source = %q", q.Source)
	}
}

func TestParseQuestionsInvalid(t *testing.T) {
	payload := []byte(`[
		{"subject":"matematica","topic":"A","statement":"S","alternatives":["1","2","3","4"],"correct_index":0,"explanation":"E"},
		{"subject":"astrologia","topic":"B","statement":"S","alternatives":["1","2","3","4","5"],"correct_index":0,"explanation":"E"},
		{"subject":"fisica","topic":"C","statement":"S","alternatives":["1","2","3","4","5"],"correct_index":5,"explanation":"E"},
		{"subject":"fisica","topic":"D","statement":"","alternatives":["1","2","3","4","5"],"correct_index":1,"explanation":"E"},
		{"subject":"fisica","topic":"E","statement":"S","alternatives":["1","2","3","4","5"],"correct_index":null,"explanation":"E"}
	]`)
	questions, problems, err := ParseQuestions(payload)
	if err != nil {
		t.Fatal(err)
	}
	if len(questions) != 0 {
		t.Fatalf("valid questions = %d, want 0", len(questions))
	}
	if len(problems) != 5 {
		t.Fatalf("problems = %d, want 5 (%v)", len(problems), problems)
	}
}

func TestParseQuestionsMalformed(t *testing.T) {
	if _, _, err := ParseQuestions([]byte(`{"not":"an array"}`)); err == nil {
		t.Fatal("expected decode error")
	}
	if _, _, err := ParseQuestions([]byte(`[`)); err == nil {
		t.Fatal("expected decode error")
	}
}

func TestResolveQuestionsPath(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/questions.json"
	if err := writeTempFile(path, []byte(`[]`)); err != nil {
		t.Fatal(err)
	}
	got, ok := ResolveQuestionsPath(path)
	if !ok || got != path {
		t.Fatalf("ResolveQuestionsPath = %q, %v", got, ok)
	}
}

func TestDemoPlanInvariants(t *testing.T) {
	total, wrong := 0, 0
	for dayIndex, day := range demoPlan {
		seen := make(map[int]bool, len(day))
		for _, answer := range day {
			if answer.question < 0 || answer.question > 39 {
				t.Fatalf("day %d uses question %d outside 0..39", dayIndex, answer.question)
			}
			if seen[answer.question] {
				t.Fatalf("day %d repeats question %d", dayIndex, answer.question)
			}
			seen[answer.question] = true
			total++
			if !answer.correct {
				wrong++
			}
		}
	}
	if total != 36 {
		t.Fatalf("total = %d, want 36", total)
	}
	if wrong != 11 {
		t.Fatalf("wrong = %d, want 11", wrong)
	}
	if len(demoPlan) != 12 {
		t.Fatalf("days = %d, want 12", len(demoPlan))
	}
}

func TestDemoTimestampsTodayNeverBeforeMidnight(t *testing.T) {
	loc := testLocation(t)
	// Just after midnight: the default "now minus 17 minutes" would fall on
	// the previous day, so the function must clamp to today.
	now := time.Date(2026, 11, 20, 0, 5, 0, 0, loc)
	stamps := demoTimestamps(now, loc, 0, 3)
	for i, stamp := range stamps {
		if stamp.Day() != 20 {
			t.Fatalf("stamp %d spilled to day %d", i, stamp.Day())
		}
		if i > 0 && !stamp.After(stamps[i-1]) {
			t.Fatalf("stamps not ascending: %v", stamps)
		}
	}

	history := demoTimestamps(now, loc, 1, 3)
	if history[0].Hour() != 10 || history[2].Hour() != 19 {
		t.Fatalf("history hours = %v", history)
	}
}

func writeTempFile(path string, data []byte) error {
	return os.WriteFile(path, data, 0o600)
}

func testLocation(t *testing.T) *time.Location {
	t.Helper()
	loc, err := time.LoadLocation("America/Sao_Paulo")
	if err != nil {
		t.Skipf("timezone unavailable: %v", err)
	}
	return loc
}
