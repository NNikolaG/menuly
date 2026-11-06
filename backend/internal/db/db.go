// Package db owns the Postgres connection pool, migrations and the
// tenant-scoped transaction helper.
package db

import (
	"context"
	"database/sql"
	"embed"
	"errors"
	"fmt"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib" // database/sql driver for goose
	"github.com/pressly/goose/v3"

	"github.com/nnikolag/menuly/backend/internal/db/sqlc"
)

//go:embed migrations/*.sql
var migrations embed.FS

// DB wraps the pool used by the API.
type DB struct {
	Pool *pgxpool.Pool
}

func Open(ctx context.Context, url string) (*DB, error) {
	pool, err := pgxpool.New(ctx, url)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return &DB{Pool: pool}, nil
}

func (d *DB) Close() { d.Pool.Close() }

// Scope is the security context a transaction runs in. TenantID drives
// row-level security; UserID lets a user see their own memberships across
// tenants (used for login and the tenant switcher).
type Scope struct {
	TenantID uuid.UUID
	UserID   uuid.UUID
}

// Tx runs fn inside a transaction whose RLS context is set to scope.
// Every query touching tenant tables must go through Tx.
func (d *DB) Tx(ctx context.Context, scope Scope, fn func(q *sqlc.Queries) error) error {
	return d.TxRaw(ctx, scope, func(_ pgx.Tx, q *sqlc.Queries) error { return fn(q) })
}

// TxRaw is Tx that also hands fn the raw transaction, for work that must
// commit atomically with the queries (e.g. enqueueing a background job).
func (d *DB) TxRaw(ctx context.Context, scope Scope, fn func(tx pgx.Tx, q *sqlc.Queries) error) error {
	tx, err := d.Pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit

	if _, err := tx.Exec(ctx,
		`SELECT set_config('app.tenant_id', $1, true), set_config('app.user_id', $2, true)`,
		uuidOrEmpty(scope.TenantID), uuidOrEmpty(scope.UserID),
	); err != nil {
		return fmt.Errorf("set tenant context: %w", err)
	}
	if err := fn(tx, sqlc.New(tx)); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func uuidOrEmpty(id uuid.UUID) string {
	if id == uuid.Nil {
		return ""
	}
	return id.String()
}

// Migrate applies all pending migrations using the given (owner) URL.
func Migrate(ctx context.Context, url string, command string) error {
	sqlDB, err := sql.Open("pgx", url)
	if err != nil {
		return err
	}
	defer sqlDB.Close()

	goose.SetBaseFS(migrations)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	switch command {
	case "up":
		return goose.UpContext(ctx, sqlDB, "migrations")
	case "down":
		return goose.DownContext(ctx, sqlDB, "migrations")
	case "status":
		return goose.StatusContext(ctx, sqlDB, "migrations")
	case "reset":
		return goose.ResetContext(ctx, sqlDB, "migrations")
	default:
		return fmt.Errorf("unknown migrate command %q (use up, down, status, reset)", command)
	}
}

// IsNotFound reports whether err means "no row".
func IsNotFound(err error) bool { return errors.Is(err, pgx.ErrNoRows) }

// IsUniqueViolation reports whether err is a unique constraint violation,
// optionally on a specific constraint.
func IsUniqueViolation(err error, constraint string) bool {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		return false
	}
	return constraint == "" || pgErr.ConstraintName == constraint
}

// IsCheckViolation reports whether err is a CHECK constraint violation.
func IsCheckViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23514"
}

// PublicTx serves anonymous (guest) reads. It resolves the active tenant with
// the given slug through the narrow public_lookup policy, then scopes the
// rest of the transaction to that tenant. fn gets the tenant row.
// It returns pgx.ErrNoRows when no active tenant has that slug.
func (d *DB) PublicTx(ctx context.Context, tenantSlug string, fn func(q *sqlc.Queries, t sqlc.GetPublicTenantBySlugRow) error) error {
	tx, err := d.Pool.BeginTx(ctx, pgx.TxOptions{AccessMode: pgx.ReadOnly})
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit

	if _, err := tx.Exec(ctx, `SELECT set_config('app.public_tenant_slug', $1, true)`, tenantSlug); err != nil {
		return fmt.Errorf("set public context: %w", err)
	}
	q := sqlc.New(tx)
	t, err := q.GetPublicTenantBySlug(ctx, tenantSlug)
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx,
		`SELECT set_config('app.public_tenant_slug', '', true), set_config('app.tenant_id', $1, true)`, t.ID.String(),
	); err != nil {
		return fmt.Errorf("set tenant context: %w", err)
	}
	if err := fn(q, t); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
