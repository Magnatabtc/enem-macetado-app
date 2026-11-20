package api

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"net/mail"
	"strings"

	"github.com/google/uuid"

	"github.com/Magnatabtc/enem-macetado/backend/internal/auth"
	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
	"github.com/Magnatabtc/enem-macetado/backend/internal/store"
)

type userDTO struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
}

type authResponse struct {
	Token     string  `json:"token"`
	User      userDTO `json:"user"`
	Onboarded bool    `json:"onboarded"`
}

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func (s *Server) handleRegister(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "corpo inválido")
		return
	}
	email, err := validateEmail(req.Email)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err := validatePassword(req.Password); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	name, err := validateName(req.Name)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		s.log.Error("hash de senha", "error", err, "request_id", requestIDFrom(r.Context()))
		writeError(w, http.StatusInternalServerError, "erro interno")
		return
	}

	ctx, cancel := s.withTimeout(r, serverTimeout)
	defer cancel()
	user, err := s.store.CreateUser(ctx, store.NewUser{
		Email:        email,
		PasswordHash: hash,
		Name:         name,
		Onboarded:    false,
	})
	if err != nil {
		if errors.Is(err, store.ErrEmailTaken) {
			writeError(w, http.StatusConflict, "e-mail já cadastrado")
			return
		}
		s.log.Error("criar usuário", "error", err, "request_id", requestIDFrom(r.Context()))
		writeError(w, http.StatusInternalServerError, "erro interno")
		return
	}

	s.respondWithToken(w, http.StatusCreated, user)
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "corpo inválido")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if _, err := validateEmail(email); err != nil || req.Password == "" {
		writeError(w, http.StatusUnauthorized, "e-mail ou senha inválidos")
		return
	}

	ctx, cancel := s.withTimeout(r, serverTimeout)
	defer cancel()
	user, hash, err := s.store.GetUserByEmail(ctx, email)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusUnauthorized, "e-mail ou senha inválidos")
			return
		}
		s.log.Error("buscar usuário", "error", err, "request_id", requestIDFrom(r.Context()))
		writeError(w, http.StatusInternalServerError, "erro interno")
		return
	}
	if !auth.CheckPassword(hash, req.Password) {
		writeError(w, http.StatusUnauthorized, "e-mail ou senha inválidos")
		return
	}
	s.respondWithToken(w, http.StatusOK, user)
}

func (s *Server) handleGuest(w http.ResponseWriter, r *http.Request) {
	random := make([]byte, 24)
	if _, err := rand.Read(random); err != nil {
		s.log.Error("gerar senha de convidado", "error", err, "request_id", requestIDFrom(r.Context()))
		writeError(w, http.StatusInternalServerError, "erro interno")
		return
	}
	hash, err := auth.HashPassword(hex.EncodeToString(random))
	if err != nil {
		s.log.Error("hash de convidado", "error", err, "request_id", requestIDFrom(r.Context()))
		writeError(w, http.StatusInternalServerError, "erro interno")
		return
	}

	ctx, cancel := s.withTimeout(r, serverTimeout)
	defer cancel()
	user, err := s.store.CreateUser(ctx, store.NewUser{
		Email:        "guest_" + uuid.NewString() + "@enem.local",
		PasswordHash: hash,
		Name:         "Convidado",
		Onboarded:    false,
		Weights:      model.DefaultWeights(),
		DailyGoal:    12,
	})
	if err != nil {
		s.log.Error("criar convidado", "error", err, "request_id", requestIDFrom(r.Context()))
		writeError(w, http.StatusInternalServerError, "erro interno")
		return
	}
	s.respondWithToken(w, http.StatusOK, user)
}

func (s *Server) respondWithToken(w http.ResponseWriter, status int, user model.User) {
	token, err := s.auth.Issue(user.ID, s.now())
	if err != nil {
		s.log.Error("emitir token", "error", err)
		writeError(w, http.StatusInternalServerError, "erro interno")
		return
	}
	writeJSON(w, status, authResponse{
		Token: token,
		User: userDTO{
			ID:    user.ID,
			Email: user.Email,
			Name:  user.Name,
		},
		Onboarded: user.Onboarded,
	})
}

func validateEmail(raw string) (string, error) {
	email := strings.ToLower(strings.TrimSpace(raw))
	if email == "" || len(email) > 254 || strings.ContainsAny(email, " \t\r\n") {
		return "", errors.New("e-mail inválido")
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email {
		return "", errors.New("e-mail inválido")
	}
	at := strings.LastIndex(email, "@")
	domain := email[at+1:]
	if !strings.Contains(domain, ".") ||
		strings.HasPrefix(domain, ".") ||
		strings.HasSuffix(domain, ".") ||
		strings.Contains(domain, "..") {
		return "", errors.New("e-mail inválido")
	}
	return email, nil
}

func validatePassword(password string) error {
	if len(password) < 8 {
		return errors.New("a senha deve ter pelo menos 8 caracteres")
	}
	if len(password) > 72 {
		return errors.New("a senha deve ter no máximo 72 caracteres")
	}
	if strings.TrimSpace(password) == "" {
		return errors.New("senha inválida")
	}
	return nil
}

func validateName(raw string) (string, error) {
	name := strings.TrimSpace(raw)
	if name == "" {
		return "", errors.New("informe seu nome")
	}
	if len([]rune(name)) > 80 {
		return "", errors.New("o nome deve ter no máximo 80 caracteres")
	}
	return name, nil
}
