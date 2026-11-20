// Package api exposes the REST API and the tutor WebSocket.
package api

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/Magnatabtc/enem-macetado/backend/internal/auth"
	"github.com/Magnatabtc/enem-macetado/backend/internal/config"
	"github.com/Magnatabtc/enem-macetado/backend/internal/feed"
	"github.com/Magnatabtc/enem-macetado/backend/internal/store"
	"github.com/Magnatabtc/enem-macetado/backend/internal/tutor"
)

// Deps are the collaborators injected into the HTTP server.
type Deps struct {
	Store  *store.Store
	Auth   *auth.Manager
	Feed   *feed.Service
	Tutor  *tutor.Engine
	Config *config.Config
	Logger *slog.Logger
}

// Server holds the HTTP dependencies and the per-request clock.
type Server struct {
	store *store.Store
	auth  *auth.Manager
	feed  *feed.Service
	tutor *tutor.Engine
	cfg   *config.Config
	log   *slog.Logger
	now   func() time.Time
}

// New builds the API server.
func New(deps Deps) *Server {
	logger := deps.Logger
	if logger == nil {
		logger = slog.Default()
	}
	return &Server{
		store: deps.Store,
		auth:  deps.Auth,
		feed:  deps.Feed,
		tutor: deps.Tutor,
		cfg:   deps.Config,
		log:   logger,
		now:   time.Now,
	}
}

// Handler builds the full middleware chain.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/health", s.handleHealth)

	mux.HandleFunc("POST /api/auth/register", s.handleRegister)
	mux.HandleFunc("POST /api/auth/login", s.handleLogin)
	mux.HandleFunc("POST /api/auth/guest", s.handleGuest)

	mux.HandleFunc("GET /api/me", s.requireAuth(s.handleMe))
	mux.HandleFunc("PATCH /api/me", s.requireAuth(s.handlePatchMe))
	mux.HandleFunc("PUT /api/onboarding", s.requireAuth(s.handleOnboarding))

	mux.HandleFunc("GET /api/feed", s.requireAuth(s.handleFeed))
	mux.HandleFunc("POST /api/attempts", s.requireAuth(s.handleAttempt))
	mux.HandleFunc("GET /api/progress", s.requireAuth(s.handleProgress))

	mux.HandleFunc("GET /ws/tutor", s.handleTutorWS)

	return s.requestID(s.logging(s.recoverer(s.cors(mux))))
}

type ctxKey int

const (
	ctxUserID ctxKey = iota
	ctxRequestID
)

func userIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(ctxUserID).(string)
	return id
}

func requestIDFrom(ctx context.Context) string {
	id, _ := ctx.Value(ctxRequestID).(string)
	return id
}

// requireAuth validates the Bearer token and injects the user id.
func (s *Server) requireAuth(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		parts := splitBearer(header)
		if parts == "" {
			writeError(w, http.StatusUnauthorized, "não autenticado")
			return
		}
		userID, err := s.auth.Verify(parts)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "token inválido")
			return
		}
		ctx := context.WithValue(r.Context(), ctxUserID, userID)
		next(w, r.WithContext(ctx))
	}
}

func splitBearer(header string) string {
	const prefix = "bearer "
	if len(header) <= len(prefix) || !equalFoldASCII(header[:len(prefix)], prefix) {
		return ""
	}
	token := header[len(prefix):]
	if token == "" {
		return ""
	}
	return token
}

func equalFoldASCII(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := 0; i < len(a); i++ {
		ca, cb := a[i], b[i]
		if 'A' <= ca && ca <= 'Z' {
			ca += 'a' - 'A'
		}
		if 'A' <= cb && cb <= 'Z' {
			cb += 'a' - 'A'
		}
		if ca != cb {
			return false
		}
	}
	return true
}

// serverTimeout bounds database work per request.
const serverTimeout = 5 * time.Second

func (s *Server) withTimeout(r *http.Request, d time.Duration) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), d)
}

func newRequestID() string {
	return uuid.NewString()
}
