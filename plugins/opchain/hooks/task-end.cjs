#!/usr/bin/env node
// opchain plugin — Stop hook. Emits a task-end timestamp independently of
// optional next-skill suggestions.

"use strict";

const fs = require("fs");
const { spawnSync } = require("child_process");

function git(args, cwd) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return r.status === 0 ? (r.stdout || "").trim() : null;
}

let input = {};
try { input = JSON.parse(fs.readFileSync(0, "utf8") || "{}"); } catch { process.exit(0); }
const cwd = input.cwd || process.cwd();
const root = git(["rev-parse", "--show-toplevel"], cwd) || cwd;
if (!fs.existsSync(`${root}/.checkpoints`)) process.exit(0);

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
