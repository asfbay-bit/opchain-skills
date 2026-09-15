// Durable, project-scoped checkpoint provider for the local stdio MCP server.
// Hosted storage remains a separate advisory/session concern.

import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { accessSync, constants, existsSync } from "node:fs";
import { delimiter, join, resolve, sep } from "node:path";
import { CheckpointConflictError, CheckpointStoreContractError, CHECKPOINT_STORE_API_VERSION } from "./checkpoint-store.js";

const SKILL_ID = /^[a-z][a-z0-9-]*$/;
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCK_HOLDER = [
  'process.stdout.write("LOCKED\\n")',
  "process.stdin.resume()",
  "process.stdin.on('end', () => process.exit(0))",
].join(";");

function revisionFor(text) {
  return createHash("sha256").update(text).digest("hex");
}

function assertSkill(skill) {
  if (!SKILL_ID.test(skill)) throw new CheckpointStoreContractError("checkpoint skill must be a lower-case skill id");
}

function executable(path) {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function resolveLocalCheckpointLock({ platform = process.platform, pathEnv = process.env.PATH || "" } = {}) {
  if (platform === "darwin") {
    const command = "/usr/bin/lockf";
    if (!executable(command)) {
      throw new CheckpointStoreContractError(`durable local checkpoint storage on macOS requires executable ${command}`);
    }
    return { platform, command };
  }
  if (platform === "linux") {
    const command = pathEnv
      .split(delimiter)
      .filter(Boolean)
      .map((dir) => resolve(dir, "flock"))
      .find(executable);
    if (!command) {
      throw new CheckpointStoreContractError("durable local checkpoint storage on Linux requires the `flock` executable on PATH");
    }
    return { platform, command };
  }
  throw new CheckpointStoreContractError(
    `durable local checkpoint storage supports macOS (with /usr/bin/lockf) and Linux (with flock); ${platform} is unsupported`,
  );
}

function acquireLock(lockPath, lockRuntime) {
  const { platform, command } = lockRuntime;
  const args = platform === "linux"
    ? ["-x", "-w", "10", lockPath, process.execPath, "-e", LOCK_HOLDER]
    : ["-k", "-t", "10", lockPath, process.execPath, "-e", LOCK_HOLDER];
  const holder = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"] });

  return new Promise((resolveLock, rejectLock) => {
    let output = "";
    let errors = "";
    const timeout = setTimeout(() => {
      holder.kill("SIGKILL");
      rejectLock(new CheckpointStoreContractError("checkpoint lock remained busy; retry the read/write"));
    }, 12_000);
    const fail = (error) => {
      clearTimeout(timeout);
      rejectLock(error instanceof CheckpointStoreContractError
        ? error
        : new CheckpointStoreContractError(`checkpoint lock failed: ${error.message}`));
    };
    holder.stderr.on("data", (chunk) => { errors += chunk; });
    holder.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.includes("LOCKED\n")) {
        clearTimeout(timeout);
        holder.removeListener("error", fail);
        resolveLock(holder);
      }
    });
    holder.once("error", fail);
    holder.once("exit", (code) => {
      if (!output.includes("LOCKED\n")) {
        fail(new CheckpointStoreContractError(`checkpoint lock failed${errors.trim() ? `: ${errors.trim()}` : ` (exit ${code})`}`));
      }
    });
  });
}

async function releaseLock(holder) {
  if (holder.exitCode !== null || holder.signalCode !== null) return;
  await new Promise((resolveRelease) => {
    holder.once("exit", resolveRelease);
    holder.stdin.end();
  });
}

async function withLock(lockPath, lockRuntime, action) {
  const holder = await acquireLock(lockPath, lockRuntime);
  try {
    return await action();
  } finally {
    await releaseLock(holder);
  }
}

/**
 * expectedRevision semantics:
 * - omitted: atomic but unguarded legacy replacement;
 * - null: create-only (conflicts when a checkpoint already exists);
 * - string: update-only when it equals the current content revision.
 */
export function createLocalCheckpointStore({ projectDir, platform = process.platform, pathEnv = process.env.PATH || "" }) {
  // Fail during local-server construction, before issuing sessions or writing
  // project state, when the host cannot provide process-owned advisory locks.
  const lockRuntime = resolveLocalCheckpointLock({ platform, pathEnv });
  const root = resolve(projectDir);
  const checkpointDir = join(root, ".checkpoints");
  const sessionsPath = join(checkpointDir, ".mcp-sessions.json");
  const ignorePath = join(checkpointDir, ".gitignore");
  const privatePatterns = [".mcp-sessions.json", "*.lock", ".*.tmp", ".local/"];

  function pathsFor(skill) {
    assertSkill(skill);
    const target = resolve(checkpointDir, `${skill}.checkpoint.json`);
    if (!target.startsWith(`${checkpointDir}${sep}`)) throw new CheckpointStoreContractError("checkpoint path escaped project directory");
    return { target, lock: `${target}.lock` };
  }

  async function readCurrent(target) {
    try {
      const raw = await readFile(target, "utf8");
      return { raw, checkpoint: JSON.parse(raw), revision: revisionFor(raw) };
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      if (error instanceof SyntaxError) throw new CheckpointStoreContractError("stored checkpoint is invalid JSON");
      throw error;
    }
  }

  async function readSessions() {
    try {
      const parsed = JSON.parse(await readFile(sessionsPath, "utf8"));
      if (!Array.isArray(parsed) || parsed.some((session) => typeof session !== "string" || !SESSION_ID.test(session))) {
        throw new CheckpointStoreContractError("local checkpoint session registry is invalid");
      }
      return new Set(parsed);
    } catch (error) {
      if (error?.code === "ENOENT") return new Set();
      if (error instanceof SyntaxError) throw new CheckpointStoreContractError("local checkpoint session registry is invalid JSON");
      throw error;
    }
  }

  async function assertIssuedSession(session) {
    if (typeof session !== "string" || !SESSION_ID.test(session) || !(await readSessions()).has(session)) {
      throw new CheckpointStoreContractError("checkpoint session was not issued for this local project");
    }
  }

  async function ensurePrivateRuntimeIgnore() {
    let current = "";
    try {
      current = await readFile(ignorePath, "utf8");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    const lines = new Set(current.split(/\r?\n/));
    const missing = privatePatterns.filter((pattern) => !lines.has(pattern));
    if (missing.length === 0) return;
    const prefix = current.length === 0 || current.endsWith("\n") ? current : `${current}\n`;
    const temp = join(checkpointDir, `.gitignore.${process.pid}.${randomUUID()}.tmp`);
    try {
      await writeFile(temp, `${prefix}${missing.join("\n")}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      await rename(temp, ignorePath);
    } finally {
      if (existsSync(temp)) await unlink(temp).catch(() => {});
    }
  }

  return {
    apiVersion: CHECKPOINT_STORE_API_VERSION,
    capabilities: {
      durability: "filesystem",
      scope: "project",
      atomicReplace: true,
      compareAndSwap: true,
    },
    async createSession() {
      await mkdir(checkpointDir, { recursive: true, mode: 0o700 });
      return withLock(`${sessionsPath}.lock`, lockRuntime, async () => {
        await ensurePrivateRuntimeIgnore();
        const sessions = await readSessions();
        const session = randomUUID();
        sessions.add(session);
        const temp = join(checkpointDir, `.mcp-sessions.${process.pid}.${randomUUID()}.tmp`);
        try {
          await writeFile(temp, `${JSON.stringify([...sessions].sort(), null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
          await rename(temp, sessionsPath);
        } finally {
          if (existsSync(temp)) await unlink(temp).catch(() => {});
        }
        return session;
      });
    },
    async hasSession(session) {
      return typeof session === "string" && SESSION_ID.test(session) && (await readSessions()).has(session);
    },
    // Sessions gate access at the MCP boundary, while checkpoint data remains
    // intentionally shared by every issued session for this local project.
    async read(skill, session) {
      await assertIssuedSession(session);
      const { target } = pathsFor(skill);
      const current = await readCurrent(target);
      return current ? { checkpoint: current.checkpoint, revision: current.revision } : null;
    },
    async write(skill, session, checkpoint, options = {}) {
      await assertIssuedSession(session);
      const { target, lock } = pathsFor(skill);
      const hasExpected = Object.hasOwn(options, "expectedRevision");
      const expectedRevision = options.expectedRevision;
      if (hasExpected && expectedRevision !== null && (typeof expectedRevision !== "string" || expectedRevision.trim() === "")) {
        throw new CheckpointStoreContractError("expectedRevision must be omitted, null, or a non-empty revision string");
      }
      await mkdir(checkpointDir, { recursive: true, mode: 0o700 });
      return withLock(lock, lockRuntime, async () => {
        const current = await readCurrent(target);
        if (hasExpected && expectedRevision === null && current) {
          throw new CheckpointConflictError("checkpoint already exists; create-only write rejected");
        }
        if (hasExpected && typeof expectedRevision === "string" && (!current || current.revision !== expectedRevision)) {
          throw new CheckpointConflictError("checkpoint revision changed");
        }

        const raw = `${JSON.stringify(checkpoint, null, 2)}\n`;
        const temp = join(checkpointDir, `.${skill}.${process.pid}.${randomUUID()}.tmp`);
        try {
          await writeFile(temp, raw, { encoding: "utf8", mode: 0o600, flag: "wx" });
          await rename(temp, target);
        } finally {
          if (existsSync(temp)) await unlink(temp).catch(() => {});
        }
        return { revision: revisionFor(raw) };
      });
    },
  };
}
