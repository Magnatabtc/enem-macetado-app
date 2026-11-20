// Package config loads the service configuration from environment variables,
// applying the defaults documented in the build contract.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Version is the public API version reported by /api/health.
const Version = "0.1.0"

// Config is the fully resolved runtime configuration.
type Config struct {
	Port              string
	DatabaseURL       string
	JWTSecret         string
	AppTimezone       string
	Location          *time.Location
	CORSOrigins       []string
	OpenAIAPIKey      string
	OpenAIBaseURL     string
	TutorModel        string
	STTEnabled        bool
	TTSEnabled        bool
	TTSModel          string
	TTSVoice          string
	SeedQuestionsPath string
}

// Load reads the environment and validates it. Invalid values fail fast with a
// descriptive error instead of being silently ignored.
func Load() (*Config, error) {
	tz := env("APP_TIMEZONE", "America/Sao_Paulo")
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return nil, fmt.Errorf("APP_TIMEZONE inválido (%q): %w", tz, err)
	}

	cfg := &Config{
		Port:              env("PORT", "8080"),
		DatabaseURL:       env("DATABASE_URL", "postgres://enem:enem_dev_password@db:5432/enem?sslmode=disable"),
		JWTSecret:         env("JWT_SECRET", "dev-secret-change-me-in-production"),
		AppTimezone:       tz,
		Location:          loc,
		CORSOrigins:       splitCSV(env("CORS_ORIGINS", "http://localhost:5173,http://localhost:8099")),
		OpenAIAPIKey:      strings.TrimSpace(os.Getenv("OPENAI_API_KEY")),
		OpenAIBaseURL:     strings.TrimRight(env("OPENAI_BASE_URL", "https://api.openai.com/v1"), "/"),
		TutorModel:        env("TUTOR_MODEL", "gpt-4o-mini"),
		STTEnabled:        envBool("STT_ENABLED", false),
		TTSEnabled:        envBool("TTS_ENABLED", false),
		TTSModel:          env("TTS_MODEL", "gpt-4o-mini-tts"),
		TTSVoice:          env("TTS_VOICE", "alloy"),
		SeedQuestionsPath: env("SEED_QUESTIONS_PATH", "/app/content/questions.json"),
	}

	if cfg.Port == "" {
		return nil, fmt.Errorf("PORT não pode ser vazio")
	}
	if cfg.DatabaseURL == "" {
		return nil, fmt.Errorf("DATABASE_URL não pode ser vazia")
	}
	if cfg.JWTSecret == "" {
		return nil, fmt.Errorf("JWT_SECRET não pode ser vazio")
	}
	if cfg.OpenAIBaseURL == "" {
		cfg.OpenAIBaseURL = "https://api.openai.com/v1"
	}
	return cfg, nil
}

func env(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseBool(raw)
	if err != nil {
		return fallback
	}
	return v
}

func splitCSV(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
