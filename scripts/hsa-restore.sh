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

# restic recreates the absolute paths it backed up, so the tree arrives as
# $TARGET/var/tmp/hsa-backup/hsa.db and $TARGET/home/.../data/uploads. Flatten
# it to a plain hsa.db + uploads/ at the top, which is the shape the app wants
# and the shape you can copy straight into place — on this machine or any other.
raw_db=$(find "$TARGET" -name 'hsa.db' -type f | head -1)
raw_uploads=$(find "$TARGET" -type d -name uploads | head -1)

[ -n "$raw_db" ] || { echo "no hsa.db in the restored snapshot" >&2; exit 1; }
[ -n "$raw_uploads" ] || { echo "no uploads directory in the restored snapshot" >&2; exit 1; }

db="$TARGET/hsa.db"
uploads="$TARGET/uploads"
[ "$raw_db" = "$db" ] || mv "$raw_db" "$db"
[ "$raw_uploads" = "$uploads" ] || mv "$raw_uploads" "$uploads"

# Drop the now-empty scaffolding the absolute paths left behind.
find "$TARGET" -mindepth 1 -maxdepth 1 -type d ! -name uploads -exec rm -rf {} +

if command -v sqlite3 >/dev/null && [ -n "$db" ]; then
	echo
	echo "Restored database:"
	echo "  integrity : $(sqlite3 "$db" 'PRAGMA integrity_check;')"
	echo "  receipts  : $(sqlite3 "$db" 'SELECT count(*) FROM expenses WHERE deleted_at IS NULL;')"
	echo "  documents : $(sqlite3 "$db" 'SELECT count(*) FROM documents;')"
fi

cat <<INSTRUCTIONS

Restored to ${TARGET}:

  ${TARGET}/hsa.db
  ${TARGET}/uploads/

NOT yet live. Inspect it first.

To run the app against it without touching anything else — works on any
machine, which is what makes this a real recovery test:

  DATABASE_PATH=${TARGET}/hsa.db UPLOAD_ROOT=${TARGET}/uploads pnpm dev

To put it into service on the Pi:

  docker compose down
  mv ${DATA_DIR} ${DATA_DIR}.broken-$(date +%Y%m%d-%H%M%S)
  mkdir -p ${DATA_DIR}
  cp ${TARGET}/hsa.db ${DATA_DIR}/hsa.db
  cp -a ${TARGET}/uploads ${DATA_DIR}/uploads
  docker compose up -d

Keep the .broken copy until you are satisfied. The restored database has no
-wal or -shm sidecar, which is correct: SQLite recreates them on first open.
INSTRUCTIONS
