.PHONY: run migrate test test-unit sqlc lint db-up

-include .env
export

run:
	go run ./cmd/api serve

migrate:
	go run ./cmd/api migrate up

# Integration tests need Postgres (e.g. `make db-up`); they reset the menuly_test database.
TEST_DATABASE_URL ?= postgres://menuly_app:menuly_app@localhost:5432/menuly_test?sslmode=disable
TEST_MIGRATE_DATABASE_URL ?= postgres://menuly:menuly@localhost:5432/menuly_test?sslmode=disable
test:
	TEST_DATABASE_URL=$(TEST_DATABASE_URL) TEST_MIGRATE_DATABASE_URL=$(TEST_MIGRATE_DATABASE_URL) go test -count=1 ./...

test-unit:
	go test ./...

sqlc:
	go run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.29.0 generate

lint:
	gofmt -l . && go vet ./...

db-up:
	docker compose -f ../../docker-compose.yml up -d postgres
	docker compose -f ../../docker-compose.yml exec -T postgres sh -c \
	  'psql -U menuly -tc "SELECT 1 FROM pg_database WHERE datname = '"'"'menuly_test'"'"'" | grep -q 1 || psql -U menuly -c "CREATE DATABASE menuly_test"'
