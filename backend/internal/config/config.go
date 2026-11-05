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
