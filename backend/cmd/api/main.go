// Command api runs the Enem Macetado backend: REST API, tutor WebSocket,
// database migration and seed.
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata"

	"github.com/Magnatabtc/enem-macetado/backend/internal/api"
	"github.com/Magnatabtc/enem-macetado/backend/internal/auth"
	"github.com/Magnatabtc/enem-macetado/backend/internal/config"
	"github.com/Magnatabtc/enem-macetado/backend/internal/feed"
	"github.com/Magnatabtc/enem-macetado/backend/internal/seed"
	"github.com/Magnatabtc/enem-macetado/backend/internal/store"
	"github.com/Magnatabtc/enem-macetado/backend/internal/tutor"
)

func main() {
	if err := run(); err != nil {
		slog.Error("falha ao iniciar a API", "error", err)
		os.Exit(1)
	}
}

func run() error {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
	slog.SetDefault(logger)

	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("configuração: %w", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	st, err := store.Connect(ctx, cfg.DatabaseURL, cfg.Location, 30, 2*time.Second, logger)
	if err != nil {
		return err
	}
	defer st.Close()
	logger.Info("conectado ao banco")

	migrateCtx, cancelMigrate := context.WithTimeout(ctx, 30*time.Second)
	err = st.Migrate(migrateCtx)
	cancelMigrate()
	if err != nil {
		return err
	}

	seedCtx, cancelSeed := context.WithTimeout(ctx, 60*time.Second)
	if err := seed.EnsureQuestions(seedCtx, st, cfg.SeedQuestionsPath, logger); err != nil {
		cancelSeed()
		return err
	}
	if err := seed.EnsureDemo(seedCtx, st, cfg.Location, logger); err != nil {
		cancelSeed()
		return err
	}
	cancelSeed()

	authManager, err := auth.NewManager(cfg.JWTSecret, auth.TokenTTL)
	if err != nil {
		return fmt.Errorf("configurar JWT: %w", err)
	}

	feedService := feed.New(st, feed.Options{Logger: logger})
	go feedService.Run(ctx)

	tutorEngine := tutor.New(tutor.Config{
		OpenAIAPIKey:  cfg.OpenAIAPIKey,
		OpenAIBaseURL: cfg.OpenAIBaseURL,
		Model:         cfg.TutorModel,
		STTEnabled:    cfg.STTEnabled,
		TTSEnabled:    cfg.TTSEnabled,
		TTSModel:      cfg.TTSModel,
		TTSVoice:      cfg.TTSVoice,
	})

	handler := api.New(api.Deps{
		Store:  st,
		Auth:   authManager,
		Feed:   feedService,
		Tutor:  tutorEngine,
		Config: cfg,
		Logger: logger,
	}).Handler()

	httpServer := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
	}

	listenErr := make(chan error, 1)
	go func() {
		logger.Info("API no ar",
			"addr", httpServer.Addr,
			"version", config.Version,
			"timezone", cfg.AppTimezone,
			"tutor", tutorEngine.Mode(),
			"stt", tutorEngine.STT(),
			"tts", tutorEngine.TTS(),
		)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			listenErr <- err
		}
	}()

	select {
	case err := <-listenErr:
		return fmt.Errorf("servidor HTTP: %w", err)
	case <-ctx.Done():
		logger.Info("sinal recebido; encerrando")
	}

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	if err := httpServer.Shutdown(shutdownCtx); err != nil && !errors.Is(err, context.DeadlineExceeded) {
		return fmt.Errorf("desligamento: %w", err)
	}
	logger.Info("API encerrada")
	return nil
}
