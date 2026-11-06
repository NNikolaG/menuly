// Package config loads runtime configuration from environment variables.
package config

import (
	"fmt"
	"time"

	"github.com/caarlos0/env/v11"
)

type Config struct {
	Env      string `env:"APP_ENV" envDefault:"development"`
	HTTPAddr string `env:"HTTP_ADDR" envDefault:":8080"`
	LogLevel string `env:"LOG_LEVEL" envDefault:"info"`

	// DatabaseURL is used by the API and must point to the non-superuser
	// menuly_app role so that row-level security is enforced.
	DatabaseURL string `env:"DATABASE_URL,required"`
	// MigrateDatabaseURL is used for migrations (schema owner). Falls back
	// to DatabaseURL when empty.
	MigrateDatabaseURL string `env:"MIGRATE_DATABASE_URL"`
	MigrateOnStart     bool   `env:"MIGRATE_ON_START" envDefault:"false"`

	JWTSecret       string        `env:"JWT_SECRET,required"`
	JWTIssuer       string        `env:"JWT_ISSUER" envDefault:"menuly"`
	AccessTokenTTL  time.Duration `env:"ACCESS_TOKEN_TTL" envDefault:"15m"`
	RefreshTokenTTL time.Duration `env:"REFRESH_TOKEN_TTL" envDefault:"720h"`

	DocsEnabled bool `env:"DOCS_ENABLED" envDefault:"true"`

	// PublicMenuURL is the guest URL of a venue, used for QR codes.
	PublicMenuURL string `env:"PUBLIC_MENU_URL" envDefault:"https://{tenant}.menuly.app/{venue}"`

	// OCR import. Without ANTHROPIC_API_KEY uploads are accepted but every
	// page fails with "OCR is not configured".
	AnthropicAPIKey  string `env:"ANTHROPIC_API_KEY"`
	OCRModel         string `env:"OCR_MODEL" envDefault:"claude-haiku-5-5"`
	OCRFallbackModel string `env:"OCR_FALLBACK_MODEL" envDefault:"claude-opus-5-5"`
	OCREffort        string `env:"OCR_EFFORT" envDefault:"medium"`
	// OCRWorkers is how many pages this process reads in parallel; 0 makes
	// it an API-only process that just enqueues.
	OCRWorkers int `env:"OCR_WORKERS" envDefault:"2"`

	// File storage: S3-compatible when S3_ENDPOINT is set, else STORAGE_DIR.
	S3Endpoint  string `env:"S3_ENDPOINT"`
	S3AccessKey string `env:"S3_ACCESS_KEY"`
	S3SecretKey string `env:"S3_SECRET_KEY"`
	S3Bucket    string `env:"S3_BUCKET" envDefault:"menuly"`
	S3Region    string `env:"S3_REGION"`
	S3UseSSL    bool   `env:"S3_USE_SSL" envDefault:"false"`
	StorageDir  string `env:"STORAGE_DIR" envDefault:"./data/uploads"`

	CORSAllowedOrigins []string `env:"CORS_ALLOWED_ORIGINS" envSeparator:"," envDefault:"http://localhost:4200"`
}

func Load() (Config, error) {
	var c Config
	if err := env.Parse(&c); err != nil {
		return c, err
	}
	if c.MigrateDatabaseURL == "" {
		c.MigrateDatabaseURL = c.DatabaseURL
	}
	if len(c.JWTSecret) < 32 {
		return c, fmt.Errorf("JWT_SECRET must be at least 32 bytes")
	}
	return c, nil
}
