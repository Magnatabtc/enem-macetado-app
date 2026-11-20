package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"

	"github.com/Magnatabtc/enem-macetado/backend/internal/model"
	"github.com/Magnatabtc/enem-macetado/backend/internal/store"
	"github.com/Magnatabtc/enem-macetado/backend/internal/tutor"
)

const (
	wsReadLimit    = 8 << 20
	wsReadTimeout  = 60 * time.Second
	wsPingInterval = 30 * time.Second
	wsWriteTimeout = 10 * time.Second
	wsMaxAudio     = 8 << 20
)

type clientMessage struct {
	Type       string `json:"type"`
	QuestionID string `json:"question_id"`
	Text       string `json:"text"`
	Mime       string `json:"mime"`
	Data       string `json:"data"`
}

type readyMessage struct {
	Type  string `json:"type"`
	Tutor string `json:"tutor"`
	STT   bool   `json:"stt"`
	TTS   bool   `json:"tts"`
}

type statusMessage struct {
	Type   string `json:"type"`
	Status string `json:"status"`
}

type deltaMessage struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type audioMessage struct {
	Type string `json:"type"`
	Mime string `json:"mime"`
	Data string `json:"data"`
}

type doneMessage struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

type errorMessage struct {
	Type  string `json:"type"`
	Error string `json:"error"`
}

type typeOnlyMessage struct {
	Type string `json:"type"`
}

type tutorSocket struct {
	server    *Server
	conn      *websocket.Conn
	userID    string
	writeMu   sync.Mutex
	question  *tutor.QuestionContext
	audio     bytes.Buffer
	audioMime string
}

func (s *Server) handleTutorWS(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		writeError(w, http.StatusUnauthorized, "token ausente")
		return
	}
	userID, err := s.auth.Verify(token)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "token inválido")
		return
	}

	upgrader := websocket.Upgrader{
		ReadBufferSize:   8 << 10,
		WriteBufferSize:  8 << 10,
		HandshakeTimeout: 10 * time.Second,
		CheckOrigin:      s.checkOrigin,
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		s.log.Warn("upgrade do tutor falhou", "error", err, "request_id", requestIDFrom(r.Context()))
		return
	}
	defer func() { _ = conn.Close() }()

	sock := &tutorSocket{server: s, conn: conn, userID: userID}
	conn.SetReadLimit(wsReadLimit)
	_ = conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(wsReadTimeout))
	})

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()
	go sock.pingLoop(ctx)

	if err := sock.send(readyMessage{
		Type:  "ready",
		Tutor: s.tutor.Mode(),
		STT:   s.tutor.STT(),
		TTS:   s.tutor.TTS(),
	}); err != nil {
		return
	}

	for {
		var msg clientMessage
		if err := conn.ReadJSON(&msg); err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				s.log.Debug("socket do tutor encerrado", "error", err, "user_id", userID)
			}
			return
		}
		_ = conn.SetReadDeadline(time.Now().Add(wsReadTimeout))

		switch strings.ToLower(strings.TrimSpace(msg.Type)) {
		case "start":
			sock.handleStart(ctx, msg.QuestionID)
		case "ask":
			text := strings.TrimSpace(msg.Text)
			if text == "" {
				_ = sock.send(errorMessage{Type: "error", Error: "texto vazio"})
				continue
			}
			if len(text) > 2000 {
				text = text[:2000]
			}
			sock.answer(ctx, text)
		case "audio_chunk":
			sock.handleAudioChunk(msg)
		case "audio_end":
			sock.handleAudioEnd(ctx)
		case "ping":
			_ = sock.send(typeOnlyMessage{Type: "pong"})
		default:
			_ = sock.send(errorMessage{Type: "error", Error: "tipo de mensagem desconhecido"})
		}
	}
}

func (s *Server) checkOrigin(r *http.Request) bool {
	origin := r.Header.Get("Origin")
	if origin == "" {
		return true
	}
	if s.originAllowed(origin) {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if strings.EqualFold(parsed.Host, r.Host) {
		return true
	}
	switch parsed.Hostname() {
	case "localhost", "127.0.0.1", "::1":
		return true
	}
	return false
}

func (sock *tutorSocket) pingLoop(ctx context.Context) {
	ticker := time.NewTicker(wsPingInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := sock.conn.WriteControl(websocket.PingMessage, nil, time.Now().Add(5*time.Second)); err != nil {
				_ = sock.conn.Close()
				return
			}
		}
	}
}

func (sock *tutorSocket) send(v any) error {
	sock.writeMu.Lock()
	defer sock.writeMu.Unlock()
	_ = sock.conn.SetWriteDeadline(time.Now().Add(wsWriteTimeout))
	return sock.conn.WriteJSON(v)
}

func (sock *tutorSocket) handleStart(ctx context.Context, questionID string) {
	questionID = strings.TrimSpace(questionID)
	if _, err := uuid.Parse(questionID); err != nil {
		_ = sock.send(errorMessage{Type: "error", Error: "question_id inválido"})
		return
	}
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	question, last, err := sock.server.store.QuestionWithLastAttempt(queryCtx, sock.userID, questionID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			_ = sock.send(errorMessage{Type: "error", Error: "questão não encontrada"})
			return
		}
		sock.server.log.Error("tutor: carregar questão", "error", err, "user_id", sock.userID)
		_ = sock.send(errorMessage{Type: "error", Error: "não foi possível carregar a questão"})
		return
	}

	context := &tutor.QuestionContext{
		Subject:      question.Subject,
		SubjectLabel: model.SubjectLabel(question.Subject),
		Topic:        question.Topic,
		Statement:    question.Statement,
		Alternatives: question.Alternatives,
		CorrectIndex: question.CorrectIndex,
		Explanation:  question.Explanation,
	}
	if last != nil {
		context.LastAttempt = &tutor.AttemptContext{SelectedIndex: last.SelectedIndex, Correct: last.Correct}
	}
	sock.question = context
}

func (sock *tutorSocket) handleAudioChunk(msg clientMessage) {
	if msg.Data == "" {
		return
	}
	if sock.audio.Len() >= wsMaxAudio {
		sock.resetAudio()
		_ = sock.send(errorMessage{Type: "error", Error: "áudio muito grande"})
		return
	}
	data, err := decodeBase64(msg.Data)
	if err != nil {
		_ = sock.send(errorMessage{Type: "error", Error: "áudio inválido"})
		return
	}
	if sock.audio.Len()+len(data) > wsMaxAudio {
		sock.resetAudio()
		_ = sock.send(errorMessage{Type: "error", Error: "áudio muito grande"})
		return
	}
	mime := strings.ToLower(strings.TrimSpace(msg.Mime))
	if mime == "" {
		mime = "audio/webm"
	}
	if len(mime) > 64 {
		mime = mime[:64]
	}
	sock.audioMime = mime
	sock.audio.Write(data)
}

func (sock *tutorSocket) handleAudioEnd(ctx context.Context) {
	audio := append([]byte(nil), sock.audio.Bytes()...)
	mime := sock.audioMime
	sock.resetAudio()

	if !sock.server.tutor.STT() {
		_ = sock.send(typeOnlyMessage{Type: "stt_fallback"})
		return
	}
	if len(audio) == 0 {
		_ = sock.send(errorMessage{Type: "error", Error: "nenhum áudio recebido"})
		return
	}
	transcribeCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	text, err := sock.server.tutor.Transcribe(transcribeCtx, audio, mime)
	cancel()
	if err != nil {
		sock.server.log.Warn("tutor: transcrição falhou", "error", err, "user_id", sock.userID)
		_ = sock.send(errorMessage{Type: "error", Error: "não foi possível transcrever o áudio"})
		return
	}
	text = strings.TrimSpace(text)
	if text == "" {
		_ = sock.send(errorMessage{Type: "error", Error: "não entendi o áudio"})
		return
	}
	sock.answer(ctx, text)
}

func (sock *tutorSocket) answer(ctx context.Context, text string) {
	if err := sock.send(statusMessage{Type: "status", Status: "thinking"}); err != nil {
		return
	}
	streamCtx, cancel := context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	full, err := sock.server.tutor.Stream(streamCtx, tutor.Request{
		Question: sock.question,
		UserText: text,
	}, func(chunk string) error {
		return sock.send(deltaMessage{Type: "delta", Text: chunk})
	})
	if err != nil {
		if ctx.Err() == nil {
			sock.server.log.Warn("tutor: resposta falhou", "error", err, "user_id", sock.userID)
			_ = sock.send(errorMessage{Type: "error", Error: "não consegui responder agora"})
		}
		return
	}

	full = strings.TrimSpace(full)
	if sock.server.tutor.TTS() && full != "" {
		ttsCtx, cancelTTS := context.WithTimeout(ctx, 45*time.Second)
		audio, ttsErr := sock.server.tutor.Speak(ttsCtx, full)
		cancelTTS()
		if ttsErr != nil {
			sock.server.log.Warn("tutor: TTS falhou", "error", ttsErr, "user_id", sock.userID)
		} else if len(audio) > 0 {
			_ = sock.send(audioMessage{
				Type: "audio",
				Mime: "audio/mpeg",
				Data: base64.StdEncoding.EncodeToString(audio),
			})
		}
	}
	_ = sock.send(doneMessage{Type: "done", Text: full})
}

func (sock *tutorSocket) resetAudio() {
	sock.audio.Reset()
	sock.audioMime = ""
}

func decodeBase64(raw string) ([]byte, error) {
	data, err := base64.StdEncoding.DecodeString(raw)
	if err == nil {
		return data, nil
	}
	return base64.RawStdEncoding.DecodeString(strings.TrimRight(raw, "="))
}
