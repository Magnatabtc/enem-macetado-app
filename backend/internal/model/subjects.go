package model

import "fmt"

// Subject is a canonical ENEM subject used across the API.
type Subject struct {
	Key   string
	Label string
}

// Subjects is the canonical, ordered list of the ten subjects.
var Subjects = []Subject{
	{Key: "matematica", Label: "Matemática"},
	{Key: "portugues", Label: "Português"},
	{Key: "biologia", Label: "Biologia"},
	{Key: "quimica", Label: "Química"},
	{Key: "fisica", Label: "Física"},
	{Key: "historia", Label: "História"},
	{Key: "geografia", Label: "Geografia"},
	{Key: "filosofia", Label: "Filosofia"},
	{Key: "sociologia", Label: "Sociologia"},
	{Key: "ingles", Label: "Inglês"},
}

var subjectLabels = func() map[string]string {
	m := make(map[string]string, len(Subjects))
	for _, s := range Subjects {
		m[s.Key] = s.Label
	}
	return m
}()

// SubjectLabel returns the pt-BR label for a subject key. Unknown keys are
// returned unchanged so callers never render an empty pill.
func SubjectLabel(key string) string {
	if label, ok := subjectLabels[key]; ok {
		return label
	}
	return key
}

// ValidSubject reports whether key is one of the ten canonical subjects.
func ValidSubject(key string) bool {
	_, ok := subjectLabels[key]
	return ok
}

// DefaultWeights returns a fresh map with weight 3 for all ten subjects.
func DefaultWeights() map[string]int {
	m := make(map[string]int, len(Subjects))
	for _, s := range Subjects {
		m[s.Key] = 3
	}
	return m
}

// CompleteWeights returns a fresh map containing all ten subjects. Values in
// the input outside 1..5 (or missing keys) fall back to 3.
func CompleteWeights(in map[string]int) map[string]int {
	out := make(map[string]int, len(Subjects))
	for _, s := range Subjects {
		w := in[s.Key]
		if w < 1 || w > 5 {
			w = 3
		}
		out[s.Key] = w
	}
	return out
}

// ValidateWeights enforces exactly the ten canonical keys with integer
// weights between 1 and 5.
func ValidateWeights(in map[string]int) (map[string]int, error) {
	if len(in) != len(Subjects) {
		return nil, fmt.Errorf("informe exatamente as %d matérias", len(Subjects))
	}
	out := make(map[string]int, len(Subjects))
	for _, s := range Subjects {
		w, ok := in[s.Key]
		if !ok {
			return nil, fmt.Errorf("matéria ausente: %s", s.Key)
		}
		if w < 1 || w > 5 {
			return nil, fmt.Errorf("peso de %s deve estar entre 1 e 5", s.Key)
		}
		out[s.Key] = w
	}
	return out, nil
}
