#!/usr/bin/env bash
# Recria o banco de teste e roda migrations + testes.
# Conexão configurável: PGHOST (padrão /tmp), PGPORT (padrão 5544), PGUSER (padrão postgres)
set -e
cd "$(dirname "$0")/../.."
export PGHOST="${PGHOST:-/tmp}" PGPORT="${PGPORT:-5544}" PGUSER="${PGUSER:-postgres}"
P="psql -v ON_ERROR_STOP=1 -q"
dropdb --if-exists t; createdb t
for f in tests/db/00_supabase_stub.sql supabase/migrations/*.sql; do $P -d t -f "$f"; done
for f in "$@"; do $P -d t -f "$f"; done
