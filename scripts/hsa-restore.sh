#!/usr/bin/env bash
#
# Restore the vault from a snapshot.
#
# Deliberately does NOT write over the live data directory. It restores beside
# it and tells you the two commands to swap them, so the destructive step stays
# a decision you make with the restored copy already in front of you.
#
#   ./hsa-restore.sh                  # latest snapshot
#   ./hsa-restore.sh <snapshot-id>    # a specific one; see: restic snapshots
set -Eeuo pipefail

: "${RESTIC_REPOSITORY:?RESTIC_REPOSITORY must be set}"
: "${RESTIC_PASSWORD_FILE:?RESTIC_PASSWORD_FILE must point at the repository password}"
: "${DATA_DIR:?DATA_DIR must point at the live data directory}"

SNAPSHOT="${1:-latest}"
TARGET="${RESTORE_TARGET:-${DATA_DIR}.restored-$(date +%Y%m%d-%H%M%S)}"

command -v restic >/dev/null || { echo "restic is not installed" >&2; exit 1; }

echo "Snapshots available:"
restic snapshots --tag hsa --compact || true
echo

echo "Restoring '${SNAPSHOT}' to ${TARGET}"
mkdir -p "$TARGET"
restic restore "$SNAPSHOT" --tag hsa --target "$TARGET"

db=$(find "$TARGET" -name 'hsa.db' -type f | head -1)
uploads=$(find "$TARGET" -type d -name uploads | head -1)

if command -v sqlite3 >/dev/null && [ -n "$db" ]; then
	echo
	echo "Restored database:"
	echo "  integrity : $(sqlite3 "$db" 'PRAGMA integrity_check;')"
	echo "  receipts  : $(sqlite3 "$db" 'SELECT count(*) FROM expenses WHERE deleted_at IS NULL;')"
	echo "  documents : $(sqlite3 "$db" 'SELECT count(*) FROM documents;')"
fi

cat <<INSTRUCTIONS

Restored, but NOT yet live. Inspect ${TARGET} first.

To put it into service:

  docker compose down
  mv ${DATA_DIR} ${DATA_DIR}.broken-$(date +%Y%m%d-%H%M%S)
  mkdir -p ${DATA_DIR}
  cp ${db:-<restored hsa.db>} ${DATA_DIR}/hsa.db
  cp -a ${uploads:-<restored uploads>} ${DATA_DIR}/uploads
  docker compose up -d

Keep the .broken copy until you are satisfied. The restored database has no
-wal or -shm sidecar, which is correct: SQLite recreates them on first open.
INSTRUCTIONS
