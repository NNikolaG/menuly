#!/bin/sh
# Runs once, when the Postgres volume is first created.
# Creates the runtime role the API connects as. It is NOT a superuser and has
# no BYPASSRLS, so row-level security applies to it. Table privileges are
# granted by the migrations.
set -eu
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE menuly_app LOGIN PASSWORD '${APP_DB_PASSWORD}';
CREATE EXTENSION IF NOT EXISTS citext;
SQL
