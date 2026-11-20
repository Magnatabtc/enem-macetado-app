package tutor

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime/multipart"
	"net"
	"net/http"
	"strings"
	"time"
)

const systemPrompt = `Você é o tutor de estudos do Enem Macetado. Responda em português do Brasil,
com tom didático, direto e acolhedor, em no máximo 140 palavras. Use apenas o enunciado,
as alternativas e a explicação fornecidos; nunca invente fatos, dados, fórmulas ou obras.
Se o aluno errou, explique o erro e mostre o raciocínio correto sem humilhar. Se não houver
questão no contexto, dê orientação de estudo geral e peça que o aluno abra uma questão.`

type openAI struct {
	apiKey   string
	baseURL  string
	model    string
	ttsModel string
	ttsVoice string
	client   *http.Client
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type sseChunk struct {
	Choices []struct {
		Delta struct {
			Content string `json:"content"`
		} `json:"delta"`
	} `json:"choices"`
}

func newOpenAI(cfg Config, key string) *openAI {
	baseURL := strings.TrimRight(strings.TrimSpace(cfg.OpenAIBaseURL), "/")
	if baseURL == "" {
		baseURL = "https://api.openai.com/v1"
	}
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "gpt-4o-mini"
	}
	ttsModel := strings.TrimSpace(cfg.TTSModel)
	if ttsModel == "" {
		ttsModel = "gpt-4o-mini-tts"
	}
	voice := strings.TrimSpace(cfg.TTSVoice)
	if voice == "" {
		voice = "alloy"
	}
	client := cfg.HTTPClient
	if client == nil {
		client = &http.Client{Transport: defaultTransport()}
	}
	return &openAI{
		apiKey:   key,
		baseURL:  baseURL,
		model:    model,
		ttsModel: ttsModel,
		ttsVoice: voice,
		client:   client,
	}
}

func defaultTransport() *http.Transport {
	return &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: (&net.Dialer{
			Timeout:   10 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          50,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 30 * time.Second,
	}
}

func (o *openAI) streamChat(ctx context.Context, req Request, onDelta EmitFunc) (string, bool, error) {
	payload, err := json.Marshal(map[string]any{
		"model":       o.model,
		"stream":      true,
		"temperature": 0.4,
		"max_tokens":  400,
		"messages": []chatMessage{
			{Role: "system", Content: systemPrompt},
			{Role: "user", Content: buildUserPrompt(req)},
		},
	})
	if err != nil {
		return "", false, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return "", false, fmt.Errorf("montar requisição do tutor: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+o.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return "", false, fmt.Errorf("chamar tutor remoto: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()

	if resp.StatusCode != http.StatusOK {
		return "", false, fmt.Errorf("tutor remoto respondeu %d: %s", resp.StatusCode, readSnippet(resp.Body))
	}
	return readSSE(resp.Body, onDelta)
}

func readSSE(r io.Reader, onDelta EmitFunc) (string, bool, error) {
	reader := bufio.NewReaderSize(r, 32*1024)
	var full strings.Builder
	emitted := false

	for {
		line, readErr := reader.ReadString('\n')
		if line != "" {
			trimmed := strings.TrimSpace(line)
			if strings.HasPrefix(trimmed, "data:") {
				data := strings.TrimSpace(strings.TrimPrefix(trimmed, "data:"))
				if data == "[DONE]" {
					return full.String(), emitted, nil
				}
				var chunk sseChunk
				if err := json.Unmarshal([]byte(data), &chunk); err == nil {
					for _, choice := range chunk.Choices {
						content := choice.Delta.Content
						if content == "" {
							continue
						}
						full.WriteString(content)
						emitted = true
						if onDelta != nil {
							if err := onDelta(content); err != nil {
								return full.String(), emitted, err
							}
						}
					}
				}
			}
		}
		if readErr != nil {
			if errors.Is(readErr, io.EOF) {
				return full.String(), emitted, nil
			}
			return full.String(), emitted, readErr
		}
	}
}

func (o *openAI) transcribe(ctx context.Context, audio []byte, mime string) (string, error) {
	if len(audio) == 0 {
		return "", errors.New("áudio vazio")
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", audioFilename(mime))
	if err != nil {
		return "", fmt.Errorf("montar áudio: %w", err)
	}
	if _, err := part.Write(audio); err != nil {
		return "", fmt.Errorf("montar áudio: %w", err)
	}
	_ = writer.WriteField("model", "whisper-1")
	_ = writer.WriteField("language", "pt")
	_ = writer.WriteField("response_format", "json")
	if err := writer.Close(); err != nil {
		return "", fmt.Errorf("montar áudio: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/audio/transcriptions", &body)
	if err != nil {
		return "", fmt.Errorf("montar transcrição: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+o.apiKey)
	httpReq.Header.Set("Content-Type", writer.FormDataContentType())

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return "", fmt.Errorf("transcrever áudio: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("transcrição respondeu %d: %s", resp.StatusCode, readSnippet(resp.Body))
	}

	var parsed struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 1<<20)).Decode(&parsed); err != nil {
		return "", fmt.Errorf("ler transcrição: %w", err)
	}
	return strings.TrimSpace(parsed.Text), nil
}

func (o *openAI) speak(ctx context.Context, text string) ([]byte, error) {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil, errors.New("texto vazio")
	}
	if len(text) > 4000 {
		text = text[:4000]
	}
	payload, err := json.Marshal(map[string]any{
		"model":           o.ttsModel,
		"voice":           o.ttsVoice,
		"input":           text,
		"response_format": "mp3",
	})
	if err != nil {
		return nil, err
	}
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, o.baseURL+"/audio/speech", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("montar TTS: %w", err)
	}
	httpReq.Header.Set("Authorization", "Bearer "+o.apiKey)
	httpReq.Header.Set("Content-Type", "application/json")

	resp, err := o.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("sintetizar fala: %w", err)
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TTS respondeu %d: %s", resp.StatusCode, readSnippet(resp.Body))
	}
	audio, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, fmt.Errorf("ler áudio sintetizado: %w", err)
	}
	if len(audio) == 0 {
		return nil, errors.New("TTS retornou áudio vazio")
	}
	return audio, nil
}

func buildUserPrompt(req Request) string {
	var b strings.Builder
	if q := req.Question; q != nil {
		fmt.Fprintf(&b, "Matéria: %s\nTópico: %s\nEnunciado: %s\n", subjectLabel(q), q.Topic, q.Statement)
		b.WriteString("Alternativas:\n")
		for i, alternative := range q.Alternatives {
			fmt.Fprintf(&b, "%s) %s\n", Letter(i), alternative)
		}
		fmt.Fprintf(&b, "Gabarito: %s\nExplicação: %s\n", Letter(q.CorrectIndex), q.Explanation)
		if q.LastAttempt != nil {
			status := "acertou"
			if !q.LastAttempt.Correct {
				status = "errou"
			}
			fmt.Fprintf(&b, "Última tentativa do aluno: marcou %s e %s.\n", Letter(q.LastAttempt.SelectedIndex), status)
		}
	}
	question := strings.TrimSpace(req.UserText)
	if question == "" {
		question = "Explique a questão e o motivo do gabarito."
	}
	fmt.Fprintf(&b, "Pergunta do aluno: %s", question)
	return b.String()
}

func readSnippet(r io.Reader) string {
	limited, err := io.ReadAll(io.LimitReader(r, 512))
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(limited))
}

func audioFilename(mime string) string {
	base := strings.ToLower(strings.TrimSpace(strings.Split(mime, ";")[0]))
	switch base {
	case "audio/ogg", "application/ogg":
		return "audio.ogg"
	case "audio/wav", "audio/x-wav", "audio/wave":
		return "audio.wav"
	case "audio/mp4", "audio/m4a", "audio/x-m4a":
		return "audio.m4a"
	case "audio/mpeg", "audio/mp3":
		return "audio.mp3"
	default:
		return "audio.webm"
	}
}
