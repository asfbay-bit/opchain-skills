# Interrupted update recovery

The updater retains `.opchain-update.lock/recovery.txt`, naming the backup
journal. Version-2 journals record the pinned release digest, owner process ID,
transaction stage, and before/after hashes, modes and internal link targets for
each destination. Backups never contain telemetry data.

Use the bundled shared runtime with the consumer repo as the working directory:

```sh
node <skill-dir>/scripts/opchain.mjs recover .opchain-backups/<recorded-run> --check
node <skill-dir>/scripts/opchain.mjs recover .opchain-backups/<recorded-run>
```

First confirm the original updater is no longer running. Use one recovery
operator at a time; do not run concurrent recovery commands. The runtime refuses
live-owner journals and journals whose lock pointer does not match. Never delete
a lock blindly. A process-ID reuse can require manual inspection.

The check is read-only. Recovery is offline and uses the pinned journal, not the
current release descriptor. It validates all affected paths and backup bytes,
then restores only files still matching the attempted update. Later user edits
cause a conflict and remain untouched. Fix the conflict deliberately and retry;
do not overwrite the user's edits to satisfy the journal.

A completed or already-recovered transaction with a stale lock is verified in
its final state; only that lock is removed. A preparing transaction has not begun
installation and must still match its original state. Interrupted recovery is
idempotent: already-restored files are recognized by their before hashes.

Legacy journals lack complete content identities and require manual review;
this command refuses them. Preserve all checkpoints, telemetry and unrelated
files. Do not infer permission to restore a path outside the recorded allowed
skill/source destinations.
