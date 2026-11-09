// Command api runs the Menuly HTTP API.
//
//	api serve            start the HTTP server (default)
//	api migrate up|down|status|reset
//	api seed [--reset]    create the demo account (development only)
package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"slices"
	"strings"
	"syscall"
	"time"
	_ "time/tzdata" // venue timezones validate even in minimal containers

	"github.com/nnikolag/menuly/backend/internal/auth"
	"github.com/nnikolag/menuly/backend/internal/config"
	"github.com/nnikolag/menuly/backend/internal/db"
	"github.com/nnikolag/menuly/backend/internal/httpapi"
	"github.com/nnikolag/menuly/backend/internal/jobs"
	"github.com/nnikolag/menuly/backend/internal/mail"
	"github.com/nnikolag/menuly/backend/internal/ocr"
	"github.com/nnikolag/menuly/backend/internal/seed"
	"github.com/nnikolag/menuly/backend/internal/storage"
)

func main() {
	if err := run(os.Args[1:]); err != nil {
		slog.Error("fatal", "err", err)
		os.Exit(1)
	}
}

func run(args []string) error {
	cfg, err := config.Load()
	if err != nil {
		return fmt.Errorf("config: %w", err)
	}
	setupLogger(cfg)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cmd := "serve"
	if len(args) > 0 {
		cmd = args[0]
	}
	switch cmd {
	case "serve":
		return serve(ctx, cfg)
	case "migrate":
		sub := "up"
		if len(args) > 1 {
			sub = args[1]
		}
		if err := db.Migrate(ctx, cfg.MigrateDatabaseURL, sub); err != nil {
			return err
		}
		if sub == "up" {
			return jobs.Migrate(ctx, cfg.MigrateDatabaseURL)
		}
		return nil
	case "seed":
		return runSeed(ctx, cfg, slices.Contains(args[1:], "--reset"))
	default:
		return fmt.Errorf("unknown command %q (use serve, migrate or seed)", cmd)
	}
}

func serve(ctx context.Context, cfg config.Config) error {
	if cfg.MigrateOnStart {
		if err := db.Migrate(ctx, cfg.MigrateDatabaseURL, "up"); err != nil {
			return fmt.Errorf("migrate: %w", err)
		}
		if err := jobs.Migrate(ctx, cfg.MigrateDatabaseURL); err != nil {
			return fmt.Errorf("migrate jobs: %w", err)
		}
	}
	database, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("db: %w", err)
	}
	defer database.Close()

	store, err := openStore(ctx, cfg)
	if err != nil {
		return err
	}
	extractor, picked, err := ocr.New(ocr.ProviderConfig{
		Provider: cfg.OCRProvider, Model: cfg.OCRModel, FallbackModel: cfg.OCRFallbackModel, Effort: cfg.OCREffort,
		AnthropicAPIKey: cfg.AnthropicAPIKey, OpenAIAPIKey: cfg.OpenAIAPIKey, OpenAIBaseURL: cfg.OpenAIBaseURL,
		MistralAPIKey: cfg.MistralAPIKey,
	})
	switch {
	case err != nil:
		return fmt.Errorf("ocr: %w", err)
	case extractor == nil:
		slog.Warn("no OCR API key is set (ANTHROPIC_API_KEY, OPENAI_API_KEY or MISTRAL_API_KEY): menu imports will fail with \"OCR is not configured\"")
	default:
		slog.Info("ocr enabled", "provider", picked.Provider, "model", picked.Model, "fallback", picked.FallbackModel, "workers", cfg.OCRWorkers)
		for _, m := range []string{picked.Model, picked.FallbackModel} {
			if m != "" && !ocr.KnownPrice(m) {
				slog.Warn("no price for OCR model: its cost is recorded as 0", "model", m)
			}
		}
	}
	queue, err := jobs.New(jobs.Config{DB: database, Store: store, Extractor: extractor, Workers: cfg.OCRWorkers})
	if err != nil {
		return fmt.Errorf("jobs: %w", err)
	}
	if cfg.OCRWorkers > 0 {
		if err := queue.Start(ctx); err != nil {
			return fmt.Errorf("jobs: %w", err)
		}
		defer func() {
			stopCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
			defer cancel()
			_ = queue.Stop(stopCtx)
		}()
	}

	issuer := auth.NewIssuer(cfg.JWTSecret, cfg.JWTIssuer, cfg.AccessTokenTTL, cfg.RefreshTokenTTL)
	srv := &http.Server{
		Addr: cfg.HTTPAddr,
		Handler: httpapi.New(database, issuer).Handler(httpapi.Options{
			CORSAllowedOrigins: cfg.CORSAllowedOrigins, DocsEnabled: cfg.DocsEnabled, PublicMenuURL: cfg.PublicMenuURL,
			Store: store, Jobs: queue, Mailer: newMailer(cfg), AppURL: cfg.AppURL, PublicAPIURL: cfg.PublicAPIURL,
		}),
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		slog.Info("http server listening", "addr", cfg.HTTPAddr, "env", cfg.Env)
		errCh <- srv.ListenAndServe()
	}()

	select {
	case err := <-errCh:
		if !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
	}
	slog.Info("shutting down")
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	return srv.Shutdown(shutdownCtx)
}

func newMailer(cfg config.Config) mail.Mailer {
	if cfg.SMTPHost == "" {
		slog.Warn("SMTP_HOST is not set: emails (invitations, password reset) are only logged")
		return mail.Log{}
	}
	return mail.SMTP{Host: cfg.SMTPHost, Port: cfg.SMTPPort, Username: cfg.SMTPUsername, Password: cfg.SMTPPassword, From: cfg.MailFrom}
}

func openStore(ctx context.Context, cfg config.Config) (storage.Store, error) {
	if cfg.S3Endpoint == "" {
		slog.Info("storing uploads on disk", "dir", cfg.StorageDir)
		return storage.Dir{Root: cfg.StorageDir}, nil
	}
	s, err := storage.NewS3(ctx, storage.S3Config{
		Endpoint: cfg.S3Endpoint, AccessKey: cfg.S3AccessKey, SecretKey: cfg.S3SecretKey,
		Bucket: cfg.S3Bucket, UseSSL: cfg.S3UseSSL, Region: cfg.S3Region,
	})
	if err != nil {
		return nil, fmt.Errorf("storage: %w", err)
	}
	return s, nil
}

func runSeed(ctx context.Context, cfg config.Config, reset bool) error {
	if cfg.Env == "production" {
		return errors.New("seed: refusing to run with APP_ENV=production")
	}
	database, err := db.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		return fmt.Errorf("db: %w", err)
	}
	defer database.Close()
	res, err := seed.Run(ctx, database, reset)
	if err != nil {
		return fmt.Errorf("seed: %w", err)
	}
	if res.Created {
		slog.Info("demo account created", "email", seed.Email, "password", seed.Password, "staff_email", seed.StaffEmail, "tenant", seed.TenantSlug, "menu_id", res.MenuID)
	} else {
		slog.Info("demo account already exists, nothing changed (use --reset to recreate)", "email", seed.Email, "password", seed.Password)
	}
	return nil
}

func setupLogger(cfg config.Config) {
	var level slog.Level
	if err := level.UnmarshalText([]byte(strings.ToUpper(cfg.LogLevel))); err != nil {
		level = slog.LevelInfo
	}
	opts := &slog.HandlerOptions{Level: level}
	var h slog.Handler = slog.NewJSONHandler(os.Stdout, opts)
	if cfg.Env == "development" {
		h = slog.NewTextHandler(os.Stdout, opts)
	}
	slog.SetDefault(slog.New(h))
}
