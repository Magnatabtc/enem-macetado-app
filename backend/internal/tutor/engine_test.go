package tutor

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func zeroDelay() *time.Duration {
	d := time.Duration(0)
	return &d
}

func TestEngineLocalMode(t *testing.T) {
	engine := New(Config{LocalChunkDelay: zeroDelay()})
	if engine.Mode() != "local" {
		t.Fatalf("mode = %s", engine.Mode())
	}
	if engine.STT() || engine.TTS() {
		t.Fatal("STT/TTS must be off without a key")
	}
	if _, err := engine.Transcribe(context.Background(), []byte("x"), "audio/webm"); err == nil {
		t.Fatal("transcribe without STT should fail")
	}
	if _, err := engine.Speak(context.Background(), "oi"); err == nil {
		t.Fatal("speak without TTS should fail")
	}
	text, err := engine.Stream(context.Background(), Request{Question: testQuestion()}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, "Função afim") {
		t.Fatalf("unexpected answer: %q", text)
	}
}

func TestEngineOpenAIStreams(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/chat/completions" {
			http.NotFound(w, r)
			return
		}
		if got := r.Header.Get("Authorization"); got != "Bearer test-key" {
			t.Errorf("authorization = %q", got)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"Olá \"}}]}\n\n")
		fmt.Fprint(w, "data: {\"choices\":[{\"delta\":{\"content\":\"aluno\"}}]}\n\n")
		fmt.Fprint(w, "data: [DONE]\n\n")
	}))
	defer server.Close()

	engine := New(Config{
		OpenAIAPIKey:    "test-key",
		OpenAIBaseURL:   server.URL,
		HTTPClient:      server.Client(),
		LocalChunkDelay: zeroDelay(),
	})
	if engine.Mode() != "openai" {
		t.Fatalf("mode = %s", engine.Mode())
	}
	var chunks []string
	text, err := engine.Stream(context.Background(), Request{Question: testQuestion(), UserText: "e aí?"}, func(chunk string) error {
		chunks = append(chunks, chunk)
		return nil
	})
	if err != nil {
		t.Fatal(err)
	}
	if text != "Olá aluno" {
		t.Fatalf("text = %q", text)
	}
	if strings.Join(chunks, "") != text {
		t.Fatalf("chunks = %q", chunks)
	}
}

func TestEngineFallsBackToLocal(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "boom", http.StatusInternalServerError)
	}))
	defer server.Close()

	engine := New(Config{
		OpenAIAPIKey:    "test-key",
		OpenAIBaseURL:   server.URL,
		HTTPClient:      server.Client(),
		LocalChunkDelay: zeroDelay(),
	})
	text, err := engine.Stream(context.Background(), Request{Question: testQuestion()}, nil)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(text, "Função afim") {
		t.Fatalf("fallback did not use local tutor: %q", text)
	}
}

func TestEngineSTTAndTTSFlags(t *testing.T) {
	engine := New(Config{
		OpenAIAPIKey:    "k",
		STTEnabled:      true,
		TTSEnabled:      true,
		LocalChunkDelay: zeroDelay(),
	})
	if !engine.STT() || !engine.TTS() {
		t.Fatal("flags not enabled with key")
	}
	withoutKey := New(Config{STTEnabled: true, TTSEnabled: true})
	if withoutKey.STT() || withoutKey.TTS() {
		t.Fatal("flags must be false without a key")
	}
}

func TestAudioFilename(t *testing.T) {
	cases := map[string]string{
		"audio/webm;codecs=opus": "audio.webm",
		"audio/ogg":              "audio.ogg",
		"audio/wav":              "audio.wav",
		"audio/mp4":              "audio.m4a",
		"audio/mpeg":             "audio.mp3",
	}
	for mime, want := range cases {
		if got := audioFilename(mime); got != want {
			t.Fatalf("audioFilename(%q) = %q, want %q", mime, got, want)
		}
	}
}

func TestBuildUserPrompt(t *testing.T) {
	prompt := buildUserPrompt(Request{Question: testQuestion(), UserText: "por que B?"})
	for _, want := range []string{"Matemática", "Função afim", "Gabarito: B", "Última tentativa", "por que B?"} {
		if !strings.Contains(prompt, want) {
			t.Fatalf("prompt misses %q: %s", want, prompt)
		}
	}
}
