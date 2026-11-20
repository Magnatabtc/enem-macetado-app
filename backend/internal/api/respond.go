package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

const maxBodyBytes = 1 << 20

// writeJSON serializes v with the snake_case DTOs declared in this package.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError uses the contract error shape.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

// decodeJSON enforces a single, well-formed JSON object under 1 MiB and rejects
// unknown fields so typos in clients are caught early.
func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) error {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		return err
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("corpo deve conter um único objeto JSON")
	}
	return nil
}
