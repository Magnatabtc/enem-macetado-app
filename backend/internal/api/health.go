package api

import (
	"net/http"
	"time"

	"github.com/Magnatabtc/enem-macetado/backend/internal/config"
)

// handleHealth is used by Docker and the reverse proxy.
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := s.withTimeout(r, 2*time.Second)
	defer cancel()
	if err := s.store.Ping(ctx); err != nil {
		s.log.Warn("health check falhou", "error", err, "request_id", requestIDFrom(r.Context()))
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status":  "degraded",
			"db":      "error",
			"version": config.Version,
			"error":   "banco indisponível",
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"status":  "ok",
		"db":      "ok",
		"version": config.Version,
	})
}
