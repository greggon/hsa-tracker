#!/usr/bin/env bash
#
# Restore a snapshot from R2 onto this machine, end to end.
#
# Fetches the credentials from the Pi into a private temp directory, restores,
# and shreds them again on the way out. The repository password decrypts every
# backup you have, so it is borrowed for the length of one restore rather than
# left lying around on a development machine.
#
#   ./scripts/hsa-restore-from-r2.sh                # latest snapshot
#   ./scripts/hsa-restore-from-r2.sh <snapshot-id>  # a specific one
set -Eeuo pipefail

REMOTE="${REMOTE:-greggon@pi4}"
SNAPSHOT="${1:-latest}"
RESTORE_TARGET="${RESTORE_TARGET:-/tmp/hsa-from-pi}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '%s  %s\n' "$(date -Is)" "$*"; }

command -v restic >/dev/null || {
	echo "restic is not installed (sudo apt install -y restic sqlite3)" >&2
	exit 1
}

CREDS=$(mktemp -d)
chmod 700 "$CREDS"
cleanup() {
	# Overwrite before unlinking: this directory held the key to everything.
	find "$CREDS" -type f -exec shred -u {} + 2>/dev/null || true
	rm -rf "$CREDS"
}
trap cleanup EXIT
trap 'log "FAILED at line $LINENO"' ERR

log "borrowing credentials from ${REMOTE}"
ssh "$REMOTE" 'cat /etc/hsa-backup.env' > "$CREDS/env"
ssh "$REMOTE" 'cat /etc/hsa-backup.key' > "$CREDS/key"
chmod 600 "$CREDS/env" "$CREDS/key"

[ -s "$CREDS/env" ] && [ -s "$CREDS/key" ] || {
	echo "could not read /etc/hsa-backup.{env,key} on ${REMOTE}" >&2
	echo "they should be owned by your user — see scripts/README.md" >&2
	exit 1
}

set -a
# shellcheck disable=SC1091
. "$CREDS/env"
set +a

# The env file names the Pi's paths; this machine needs its own.
export RESTIC_PASSWORD_FILE="$CREDS/key"
export DATA_DIR="${DATA_DIR:-$(cd "$HERE/.." && pwd)/data}"
export RESTORE_TARGET

log "restoring '${SNAPSHOT}' to ${RESTORE_TARGET}"
"$HERE/hsa-restore.sh" "$SNAPSHOT"

log "credentials shredded"
