package auth

import (
	"testing"
	"time"
)

func TestIssueVerify(t *testing.T) {
	m, err := NewManager("test-secret", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	now := time.Now()
	id := "11111111-2222-3333-4444-555555555555"
	token, err := m.Issue(id, now)
	if err != nil {
		t.Fatal(err)
	}
	got, err := m.Verify(token)
	if err != nil {
		t.Fatal(err)
	}
	if got != id {
		t.Fatalf("subject = %q, want %q", got, id)
	}

	other, _ := NewManager("another-secret", time.Hour)
	if _, err := other.Verify(token); err == nil {
		t.Fatal("token accepted with wrong secret")
	}

	expired, err := NewManager("test-secret", time.Hour)
	if err != nil {
		t.Fatal(err)
	}
	expiredToken, err := expired.Issue(id, now.Add(-3*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := m.Verify(expiredToken); err == nil {
		t.Fatal("expired token accepted")
	}

	if _, err := m.Verify("garbage"); err == nil {
		t.Fatal("garbage token accepted")
	}
	if _, err := m.Issue("not-a-uuid", now); err == nil {
		t.Fatal("invalid subject accepted")
	}
}

func TestPasswordHashing(t *testing.T) {
	hash, err := HashPassword("demo1234")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "demo1234" {
		t.Fatal("password stored in clear")
	}
	if !CheckPassword(hash, "demo1234") {
		t.Fatal("valid password rejected")
	}
	if CheckPassword(hash, "wrong") {
		t.Fatal("invalid password accepted")
	}
	if _, err := HashPassword(string(make([]byte, 80))); err == nil {
		t.Fatal("overlong password accepted")
	}
}
