#!/usr/bin/env node
// opchain plugin — Stop hook. Emits a task-end timestamp independently of
// optional next-skill suggestions.
//
// Unconditional, like the SessionStart stamp: a task that began in a repo with
// no .checkpoints/ yet, outside Git, or with unreadable hook input still ends.
// Stop fires after every reply, so the last stamp is the task's real end.

"use strict";

const fs = require("fs");

// Drain the hook input; its contents are not needed to stamp the time.
try { fs.readFileSync(0, "utf8"); } catch { /* no stdin is fine */ }

const endedAt = new Date();
const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const localStamp = new Intl.DateTimeFormat("en-US", {
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hour12: false, timeZone, timeZoneName: "short",
}).format(endedAt);

process.stdout.write(JSON.stringify({
  systemMessage: `Task ended: ${localStamp} (${timeZone})`,
}) + "\n");
