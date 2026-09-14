# Backups

Nightly snapshots of the database and every receipt image to Cloudflare R2,
plus a weekly drill that proves they can actually be restored.

Uses [restic](https://restic.net): encrypted, deduplicated, **snapshotted**.
The snapshot part is the point — a plain `rclone sync` mirrors deletions, so a
wipe would be faithfully copied over the only good copy you had.

## What runs

|                        | When           | What it does                                   |
| ---------------------- | -------------- | ---------------------------------------------- |
| `hsa-backup.sh`        | nightly, 03:17 | consistent DB dump + uploads → R2, then prunes |
| `hsa-restore-check.sh` | Sundays, 04:23 | restores the latest snapshot and verifies it   |
| `hsa-restore.sh`       | by hand        | restores _beside_ the live data, never over it |

Retention: 7 daily, 8 weekly, 24 monthly. At roughly 1 MB per receipt that is a
couple of GB at worst, which is inside R2's free tier.

## Two things that are easy to get wrong

**The database must be dumped, not copied.** SQLite runs in WAL mode here, so
recent commits live in `hsa.db-wal` and a plain `cp hsa.db` loses them. The
script uses `sqlite3 .backup`, which is safe against a live writer.

**A backup that runs on an empty ledger is worse than none.** If the database
has fewer than `MIN_EXPECTED_ROWS` receipts the backup _refuses to run_, so a
wipe cannot quietly become your newest snapshot. Raise the number once you have
a steady receipt count.

## Getting these onto the Pi

`pnpm deploy` does **not** copy them. It only pulls the container image and
restarts it — and these scripts are deliberately excluded from that image,
because they run on the host so they still work when the container is down.

```sh
pnpm deploy:scripts
```

which is `rsync -az --delete scripts/ greggon@pi4:~/apps/hsa/scripts/`.
Re-run it whenever you change something in here. `--delete` keeps the Pi's copy
an exact mirror, so do not keep anything of your own in that directory.

The systemd units are copied to the Pi by that command too, but installing them
still needs `sudo` — see below.

## Setting it up on the Pi

```sh
sudo apt update && sudo apt install -y restic sqlite3
```

Create the R2 bucket, then an **R2 API token** scoped to it (Object Read &
Write). Note the account ID from the R2 overview page.

```sh
# The encryption key. Without it the backups are unreadable ciphertext —
# keep a copy somewhere that is not the Pi and not the R2 bucket.
openssl rand -base64 32 | sudo tee /etc/hsa-backup.key

sudo cp ~/apps/hsa/scripts/backup.env.example /etc/hsa-backup.env
sudo nano /etc/hsa-backup.env      # fill in account id, bucket, keys
```

Both files must be **owned by the user the backup runs as**, not by root:

```sh
sudo chown greggon:greggon /etc/hsa-backup.env /etc/hsa-backup.key
sudo chmod 600 /etc/hsa-backup.env /etc/hsa-backup.key
```

Still private to you and root, but readable by the account that needs them.
Root ownership breaks this in two ways, one of them quiet: sourcing the env
file by hand fails outright, and while systemd reads `EnvironmentFile=` as root
so the timer _looks_ fine, the service body runs as `greggon` and restic cannot
open the password file. Check both with:

```sh
sudo -u greggon test -r /etc/hsa-backup.env \
  && sudo -u greggon test -r /etc/hsa-backup.key \
  && echo "both readable"
```

First run by hand, so the repository is created while you are watching:

```sh
cd ~/apps/hsa
set -a; . /etc/hsa-backup.env; set +a
./scripts/hsa-backup.sh
./scripts/hsa-restore-check.sh
```

Then schedule:

```sh
sudo cp ~/apps/hsa/scripts/systemd/* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now hsa-backup.timer hsa-restore-check.timer
systemctl list-timers 'hsa-*'
```

## Restoring

```sh
set -a; . /etc/hsa-backup.env; set +a
./scripts/hsa-restore.sh            # latest
./scripts/hsa-restore.sh <id>       # a specific snapshot; see `restic snapshots`
```

It restores to a sibling directory and prints the commands to swap it in. The
swap is left to you deliberately: you get to look at the restored copy before
anything destructive happens.

## Developing against production data

```sh
pnpm pull:prod
```

Takes a consistent dump on the Pi with `sqlite3 .backup` — no downtime, the
container keeps running — then pulls it and the uploads into local `data/`.
Your existing local data is copied aside to `data.local-<timestamp>` first.

Stop your dev server before running it; swapping the database under a live
connection produces a confusingly half-broken session.

It is **one-way by design.** There is no matching push, and there should not
be: production's database is the one that has your receipts in it, and
promoting a dev copy over it should not be something a typo can do. Changes
reach production by deploying code and letting the Pi migrate its own database.

Note that the copy diverges as soon as you use it — running the app applies any
migrations your branch has that production does not. That is useful (it tests
your migration against real data) but it means the copy is no longer identical
to the Pi.

If you would rather not disturb the Pi at all, restore last night's snapshot
from R2 instead, as below — it costs nothing and exercises the backup.

## Restoring somewhere else (the real drill)

Restoring onto the Pi proves the snapshot is readable. Restoring onto a
_different machine_ proves the backup is independent of the Pi — which is the
scenario it exists for. Worth doing periodically, while nothing is on fire.

```sh
sudo apt install -y restic sqlite3      # once
pnpm restore:r2                          # latest snapshot
pnpm restore:r2 <snapshot-id>            # a specific one
```

That borrows the credentials from the Pi into a private temp directory, restores
to `/tmp/hsa-from-pi`, and **shreds them again on the way out**. The repository
password decrypts every backup you have, so it is held for the length of one
restore rather than left sitting on a development machine.

Then run the app against the restored copy. Nothing else is touched — your
working `data/` is left exactly as it was:

```sh
DATABASE_PATH=/tmp/hsa-from-pi/hsa.db UPLOAD_ROOT=/tmp/hsa-from-pi/uploads pnpm dev
```

If the receipts are all there and the thumbnails load, the backup is real.
Afterwards: `rm -rf /tmp/hsa-from-pi`.

<details>
<summary>Doing it by hand instead</summary>

Keeping a long-lived copy of the credentials works too, but that copy decrypts
everything in the bucket, so delete it when you are done:

```sh
mkdir -p ~/.hsa-restore && chmod 700 ~/.hsa-restore
ssh greggon@pi4 'cat /etc/hsa-backup.env' > ~/.hsa-restore/env
ssh greggon@pi4 'cat /etc/hsa-backup.key' > ~/.hsa-restore/key
chmod 600 ~/.hsa-restore/env ~/.hsa-restore/key

set -a; . ~/.hsa-restore/env; set +a
export RESTIC_PASSWORD_FILE=~/.hsa-restore/key
export DATA_DIR=~/code/hsa-tracker/data      # only used for the printed advice
export RESTORE_TARGET=/tmp/hsa-from-pi
./scripts/hsa-restore.sh

rm -rf ~/.hsa-restore /tmp/hsa-from-pi
```

</details>

## Checking on it

```sh
systemctl status hsa-backup.timer
journalctl -u hsa-backup.service -n 50
restic snapshots --tag hsa
```

Set `HEALTHCHECK_URL` to a free [healthchecks.io](https://healthchecks.io)
check. A backup that silently stops is worth nothing, and the only way to find
out is to be told when a run does not happen.

## Using Backblaze B2 instead

One line in `/etc/hsa-backup.env`; everything else is identical:

```sh
RESTIC_REPOSITORY=s3:https://s3.<REGION>.backblazeb2.com/<BUCKET>
```
