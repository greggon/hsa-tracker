#!/usr/bin/env bash
#
# Copy the Pi's live data down to this machine for development.
#
# One-way by construction: nothing here writes to the Pi except a temp file it
# removes afterwards. There is deliberately no matching push — promoting local
# data to production is not a thing you should be one typo away from.
#
#   ./scripts/hsa-pull-prod.sh
#
# Stop your dev server first. Swapping the database under a live connection is
# how you get a confusing half-broken session.
set -Eeuo pipefail

REMOTE="${REMOTE:-greggon@pi4}"
REMOTE_DATA="${REMOTE_DATA:-apps/hsa/data}"
LOCAL_DATA="${LOCAL_DATA:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/data}"
REMOTE_TMP="/tmp/hsa-pull-$$.db"

log() { printf '%s  %s\n' "$(date -Is)" "$*"; }
trap 'log "FAILED at line $LINENO"' ERR

command -v rsync >/dev/null || { echo "rsync is not installed" >&2; exit 1; }

# ── 1. a consistent snapshot, taken on the Pi ─────────────────────────────
#
# Same reason as the backup script: the app runs SQLite in WAL mode, so copying
# hsa.db directly loses whatever is still in hsa.db-wal. `.backup` is safe
# against the running container, so there is no downtime.
log "dumping the database on ${REMOTE}"
ssh "$REMOTE" "sqlite3 ~/${REMOTE_DATA}/hsa.db \".backup '${REMOTE_TMP}'\""
# shellcheck disable=SC2064  # expand REMOTE/REMOTE_TMP now, not at trap time
trap "ssh '$REMOTE' 'rm -f ${REMOTE_TMP}' >/dev/null 2>&1 || true" EXIT

# ── 2. keep what is here now ──────────────────────────────────────────────
if [ -e "$LOCAL_DATA/hsa.db" ]; then
	keep="${LOCAL_DATA}.local-$(date +%Y%m%d-%H%M%S)"
	log "moving your current data aside to ${keep}"
	cp -a "$LOCAL_DATA" "$keep"
fi

mkdir -p "$LOCAL_DATA/uploads"

# ── 3. pull ───────────────────────────────────────────────────────────────
log "fetching database"
rsync -az "${REMOTE}:${REMOTE_TMP}" "$LOCAL_DATA/hsa.db"

# A WAL or shared-memory file left from the previous database does not belong
# to this one. SQLite would normally discard them, but removing them is not
# ambiguous.
rm -f "$LOCAL_DATA/hsa.db-wal" "$LOCAL_DATA/hsa.db-shm"

log "fetching uploads"
rsync -az --delete "${REMOTE}:~/${REMOTE_DATA}/uploads/" "$LOCAL_DATA/uploads/"

# ── 4. check what arrived ─────────────────────────────────────────────────
if command -v sqlite3 >/dev/null; then
	result=$(sqlite3 "$LOCAL_DATA/hsa.db" 'PRAGMA integrity_check;')
	[ "$result" = "ok" ] || { echo "integrity_check returned: $result" >&2; exit 1; }
	receipts=$(sqlite3 "$LOCAL_DATA/hsa.db" 'SELECT count(*) FROM expenses WHERE deleted_at IS NULL;')
	docs=$(sqlite3 "$LOCAL_DATA/hsa.db" 'SELECT count(*) FROM documents;')
	files=$(find "$LOCAL_DATA/uploads" -type f | wc -l)
	log "integrity ok · ${receipts} receipt(s) · ${docs} document row(s) · ${files} file(s)"
else
	log "sqlite3 not installed locally; skipping verification"
fi

cat <<NOTES

Pulled from ${REMOTE}. Run it with:

  pnpm dev

Two things to keep in mind:

  - This copy diverges the moment you use it. Running the app applies any
    migrations your branch has that production has not, which is a good way to
    test them — but it means the copy is no longer what is on the Pi.

  - There is no push. To get changes to production, deploy the code and let the
    Pi's own database migrate; never copy a database up.
NOTES
