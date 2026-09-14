#!/usr/bin/env bash
#
# Proves the backup is restorable. A backup you have never restored is a
# feeling, not a backup.
#
# Restores the most recent snapshot into a scratch directory and checks that:
#   - the database is not corrupt
#   - it still holds a plausible number of receipts
#   - every image the database references is actually present
#   - restic's own repository structure is intact
#
# Exits non-zero, loudly, if any of that fails.
set -Eeuo pipefail

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE must point at the repository password}"

HEALTHCHECK_URL="${RESTORE_CHECK_HEALTHCHECK_URL:-}"
# Reading a slice of the actual pack data catches bit-rot that a structural
# check alone would miss. 5% nightly covers the repository over a few weeks.
READ_DATA_SUBSET="${READ_DATA_SUBSET:-5%}"

log() { printf '%s  %s\n' "$(date -Is)" "$*"; }
ping_health() {
	[ -n "$HEALTHCHECK_URL" ] || return 0
	curl -fsS -m 10 --retry 3 -o /dev/null "${HEALTHCHECK_URL}${1:-}" || true
}

RESTORED=$(mktemp -d)
cleanup() { rm -rf "$RESTORED"; }
trap cleanup EXIT
trap 'log "RESTORE CHECK FAILED at line $LINENO"; ping_health "/fail"' ERR

for tool in restic sqlite3; do
	command -v "$tool" >/dev/null || { echo "missing required tool: $tool" >&2; exit 1; }
done

ping_health "/start"

log "checking repository structure (reading ${READ_DATA_SUBSET} of pack data)"
restic check --read-data-subset="$READ_DATA_SUBSET"

log "restoring latest snapshot"
restic restore latest --tag hsa --target "$RESTORED"

db=$(find "$RESTORED" -name 'hsa.db' -type f | head -1)
[ -n "$db" ] || { echo "no hsa.db in the restored snapshot" >&2; exit 1; }

uploads=$(find "$RESTORED" -type d -name uploads | head -1)
[ -n "$uploads" ] || { echo "no uploads directory in the restored snapshot" >&2; exit 1; }

log "verifying the restored database"
result=$(sqlite3 "$db" 'PRAGMA integrity_check;')
[ "$result" = "ok" ] || { echo "integrity_check returned: $result" >&2; exit 1; }

expenses=$(sqlite3 "$db" 'SELECT count(*) FROM expenses WHERE deleted_at IS NULL;')
documents=$(sqlite3 "$db" 'SELECT count(*) FROM documents;')
log "restored ${expenses} live receipt(s), ${documents} document row(s)"

MIN_EXPECTED="${MIN_EXPECTED_ROWS:-1}"
[ "$expenses" -ge "$MIN_EXPECTED" ] || {
	echo "restored database holds only ${expenses} receipts, expected >= ${MIN_EXPECTED}" >&2
	exit 1
}

# ── every referenced image must actually be in the snapshot ───────────────
#
# The database and the files are backed up as separate trees; this is what
# proves they agree. A receipt whose image is missing is unprovable, which is
# the one thing this whole application exists to prevent.
log "reconciling database references against restored files"
missing=0
checked=0
while IFS= read -r key; do
	[ -n "$key" ] || continue
	checked=$((checked + 1))
	if [ ! -f "$uploads/$key" ]; then
		echo "  MISSING: $key" >&2
		missing=$((missing + 1))
	fi
done < <(sqlite3 "$db" "SELECT storage_key FROM documents
                        UNION ALL
                        SELECT web_key FROM documents WHERE web_key IS NOT NULL;")

log "checked ${checked} referenced file(s); ${missing} missing"
[ "$missing" -eq 0 ] || { echo "restore check failed: ${missing} referenced file(s) absent" >&2; exit 1; }

# Orphans are worth knowing about but are not a failure: an image can outlive
# the row that pointed at it.
orphans=$(find "$uploads" -type f | wc -l)
log "snapshot holds ${orphans} file(s) total"

log "restore check passed"
ping_health
