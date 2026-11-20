package auth

import (
	"errors"
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

// TokenTTL is the lifetime of an issued access token.
const TokenTTL = 30 * 24 * time.Hour

// BcryptCost is the cost used for password hashes.
const BcryptCost = 10

// ErrInvalidToken is returned when a token cannot be trusted.
var ErrInvalidToken = errors.New("token inválido")

const issuer = "enem-macetado"

// Manager issues and verifies HS256 access tokens.
type Manager struct {
	secret []byte
	ttl    time.Duration
}

// NewManager creates a token manager. The secret must be non-empty; tokens are
// scoped to this service by an issuer claim.
func NewManager(secret string, ttl time.Duration) (*Manager, error) {
	if secret == "" {
		return nil, fmt.Errorf("segredo JWT vazio")
	}
	if ttl <= 0 {
		ttl = TokenTTL
	}
	return &Manager{secret: []byte(secret), ttl: ttl}, nil
}

// Issue signs a token whose subject is the user id.
func (m *Manager) Issue(userID string, now time.Time) (string, error) {
	if _, err := uuid.Parse(userID); err != nil {
		return "", fmt.Errorf("user id inválido: %w", err)
	}
	claims := jwt.RegisteredClaims{
		Subject:   userID,
		Issuer:    issuer,
		IssuedAt:  jwt.NewNumericDate(now),
		NotBefore: jwt.NewNumericDate(now.Add(-time.Minute)),
		ExpiresAt: jwt.NewNumericDate(now.Add(m.ttl)),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(m.secret)
}

// Verify validates signature, algorithm, issuer, expiry and subject, returning
// the user id.
func (m *Manager) Verify(raw string) (string, error) {
	claims := &jwt.RegisteredClaims{}
	token, err := jwt.ParseWithClaims(raw, claims, func(t *jwt.Token) (any, error) {
		return m.secret, nil
	},
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithIssuer(issuer),
		jwt.WithExpirationRequired(),
		jwt.WithIssuedAt(),
	)
	if err != nil || !token.Valid {
		return "", ErrInvalidToken
	}
	if _, err := uuid.Parse(claims.Subject); err != nil {
		return "", ErrInvalidToken
	}
	return claims.Subject, nil
}

// HashPassword hashes a plaintext password with bcrypt cost 10.
func HashPassword(password string) (string, error) {
	if len(password) > 72 {
		return "", fmt.Errorf("senha muito longa")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), BcryptCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// CheckPassword compares a bcrypt hash with a plaintext password.
func CheckPassword(hash, password string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}
