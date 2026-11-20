// Package tutor implements the ENEM study tutor. The local engine is fully
// deterministic and works without any API key; the OpenAI engine is optional
// and falls back to local answers on failure.
package tutor

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"
)

// MaxWords caps every tutor answer.
const MaxWords = 140

// QuestionContext is the question the student is looking at.
type QuestionContext struct {
	Subject      string
	SubjectLabel string
	Topic        string
	Statement    string
	Alternatives []string
	CorrectIndex int
	Explanation  string
	LastAttempt  *AttemptContext
}

// AttemptContext is the student's latest attempt on the question.
type AttemptContext struct {
	SelectedIndex int
	Correct       bool
}

// Request is one tutor turn.
type Request struct {
	Question *QuestionContext
	UserText string
}

// EmitFunc receives a stream chunk. Returning an error aborts the stream.
type EmitFunc func(chunk string) error

// Config wires the optional providers.
type Config struct {
	OpenAIAPIKey    string
	OpenAIBaseURL   string
	Model           string
	STTEnabled      bool
	TTSEnabled      bool
	TTSModel        string
	TTSVoice        string
	HTTPClient      *http.Client
	LocalChunkDelay *time.Duration
}

// Engine routes answers to OpenAI when configured and to the local tutor
// otherwise.
type Engine struct {
	local  *Local
	remote *openAI
	stt    bool
	tts    bool
}

// New builds the tutor engine.
func New(cfg Config) *Engine {
	local := NewLocal()
	if cfg.LocalChunkDelay != nil {
		local.ChunkDelay = *cfg.LocalChunkDelay
	}

	engine := &Engine{local: local}
	key := strings.TrimSpace(cfg.OpenAIAPIKey)
	if key != "" {
		engine.remote = newOpenAI(cfg, key)
		engine.stt = cfg.STTEnabled
		engine.tts = cfg.TTSEnabled
	}
	return engine
}

// Mode is reported in the WebSocket ready message.
func (e *Engine) Mode() string {
	if e.remote != nil {
		return "openai"
	}
	return "local"
}

// STT reports whether server-side speech-to-text is available.
func (e *Engine) STT() bool { return e.stt }

// TTS reports whether server-side text-to-speech is available.
func (e *Engine) TTS() bool { return e.tts }

// Stream answers a request, streaming chunks through onDelta. When OpenAI is
// enabled but fails before emitting anything, the local tutor takes over.
func (e *Engine) Stream(ctx context.Context, req Request, onDelta EmitFunc) (string, error) {
	if e.remote == nil {
		return e.local.Stream(ctx, req, onDelta)
	}

	text, emitted, err := e.remote.streamChat(ctx, req, onDelta)
	if err == nil && strings.TrimSpace(text) != "" {
		return text, nil
	}
	if emitted {
		// Partial output already reached the client; do not concatenate a
		// second answer. The browser keeps the socket and can retry.
		if err == nil {
			err = errors.New("resposta vazia do tutor remoto")
		}
		return text, err
	}
	return e.local.Stream(ctx, req, onDelta)
}

// Transcribe converts recorded audio to text using OpenAI Whisper.
func (e *Engine) Transcribe(ctx context.Context, audio []byte, mime string) (string, error) {
	if !e.stt || e.remote == nil {
		return "", errors.New("STT não habilitado")
	}
	return e.remote.transcribe(ctx, audio, mime)
}

// Speak synthesizes speech. It returns MP3 bytes.
func (e *Engine) Speak(ctx context.Context, text string) ([]byte, error) {
	if !e.tts || e.remote == nil {
		return nil, errors.New("TTS não habilitado")
	}
	return e.remote.speak(ctx, text)
}

// Letter maps an alternative index to A..E.
func Letter(index int) string {
	if index < 0 || index > 4 {
		return "?"
	}
	return string(rune('A' + index))
}

func subjectLabel(q *QuestionContext) string {
	if q.SubjectLabel != "" {
		return q.SubjectLabel
	}
	if q.Subject != "" {
		return q.Subject
	}
	return "matéria"
}

func clampWords(text string) string {
	words := strings.Fields(text)
	if len(words) > MaxWords {
		words = words[:MaxWords]
	}
	return strings.Join(words, " ")
}

func shortSnippet(text string, max int) string {
	clean := strings.Join(strings.Fields(text), " ")
	runes := []rune(clean)
	if len(runes) <= max {
		return clean
	}
	return strings.TrimSpace(string(runes[:max])) + "…"
}

func (e *Engine) String() string {
	return fmt.Sprintf("tutor(mode=%s,stt=%t,tts=%t)", e.Mode(), e.stt, e.tts)
}
