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
sudo chmod 600 /etc/hsa-backup.key

sudo cp ~/apps/hsa/scripts/backup.env.example /etc/hsa-backup.env
sudo chmod 600 /etc/hsa-backup.env
sudo nano /etc/hsa-backup.env      # fill in account id, bucket, keys
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
