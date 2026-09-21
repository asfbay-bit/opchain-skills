// Public store contract for checkpoint transports. C1 publishes this API; C2
// supplies the durable filesystem implementation and concurrency behavior.

export const CHECKPOINT_STORE_API_VERSION = "1.0";

export class CheckpointStoreContractError extends Error {
  constructor(message) {
    super(message);
    this.name = "CheckpointStoreContractError";
  }
}

export class CheckpointConflictError extends Error {
  constructor(message = "checkpoint revision changed") {
    super(message);
    this.name = "CheckpointConflictError";
    this.code = "CHECKPOINT_CONFLICT";
  }
}

/**
 * Provider contract:
 *   apiVersion: "1.0"
 *   capabilities: {
 *     durability: "process" | "filesystem" | "remote",
 *     scope: "session" | "project",
 *     atomicReplace: boolean,
 *     compareAndSwap: boolean
 *   }
 *   createSession(), hasSession(session), read(skill, session),
 *   write(skill, session, checkpoint, { expectedRevision? })
 *
 * A versioned read returns { checkpoint, revision }; a legacy provider may
 * return the checkpoint directly. A CAS-capable write returns { revision } and
 * throws CheckpointConflictError when expectedRevision is stale. The common
 * local-provider policy is: omitted = atomic legacy replacement, null =
 * create-only, string = guarded update.
 */
export function validateCheckpointStoreProvider(provider, { requireAtomic = false, requireDurable = false } = {}) {
  const errors = [];
  if (!provider || typeof provider !== "object") return { ok: false, errors: ["checkpoint store provider must be an object"] };
  if (provider.apiVersion !== CHECKPOINT_STORE_API_VERSION) {
    errors.push(`checkpoint store apiVersion must be "${CHECKPOINT_STORE_API_VERSION}"`);
  }
  for (const method of ["createSession", "hasSession", "read", "write"]) {
    if (typeof provider[method] !== "function") errors.push(`checkpoint store.${method} must be a function`);
  }
  const capabilities = provider.capabilities;
  if (!capabilities || typeof capabilities !== "object" || Array.isArray(capabilities)) {
    errors.push("checkpoint store.capabilities must be an object");
  } else {
    if (!["process", "filesystem", "remote"].includes(capabilities.durability)) {
      errors.push("checkpoint store.capabilities.durability must be process|filesystem|remote");
    }
    if (!["session", "project"].includes(capabilities.scope)) {
      errors.push("checkpoint store.capabilities.scope must be session|project");
    }
    for (const field of ["atomicReplace", "compareAndSwap"]) {
      if (typeof capabilities[field] !== "boolean") errors.push(`checkpoint store.capabilities.${field} must be boolean`);
    }
    if (requireAtomic && (!capabilities.atomicReplace || !capabilities.compareAndSwap)) {
      errors.push("checkpoint store must provide atomicReplace + compareAndSwap");
    }
    if (requireDurable && capabilities.durability === "process") {
      errors.push("checkpoint store must survive process restart");
    }
  }
  return { ok: errors.length === 0, errors };
}

export function assertCheckpointStoreProvider(provider, requirements) {
  const result = validateCheckpointStoreProvider(provider, requirements);
  if (!result.ok) throw new CheckpointStoreContractError(result.errors.join("; "));
  return provider;
}

export async function readCheckpointRecord(provider, skill, session) {
  assertCheckpointStoreProvider(provider);
  const value = await provider.read(skill, session);
  if (value === null || value === undefined) return { checkpoint: null, revision: null };
  if (value && typeof value === "object" && Object.hasOwn(value, "checkpoint")) {
    if (value.revision !== null && value.revision !== undefined && typeof value.revision !== "string") {
      throw new CheckpointStoreContractError("checkpoint store read revision must be a string or null");
    }
    return { checkpoint: value.checkpoint ?? null, revision: value.revision ?? null };
  }
  return { checkpoint: value, revision: null };
}

export async function writeCheckpointRecord(provider, skill, session, checkpoint, options = {}) {
  assertCheckpointStoreProvider(provider);
  const hasExpectedRevision = Object.hasOwn(options, "expectedRevision");
  const expectedRevision = options.expectedRevision;
  if (hasExpectedRevision && expectedRevision !== null) {
    if (typeof expectedRevision !== "string" || expectedRevision.trim() === "") {
      throw new CheckpointStoreContractError("expectedRevision must be omitted, null, or a non-empty string");
    }
    if (!provider.capabilities.compareAndSwap) {
      throw new CheckpointStoreContractError("checkpoint store does not support compare-and-swap");
    }
  }
  if (hasExpectedRevision && !provider.capabilities.compareAndSwap) {
    throw new CheckpointStoreContractError("checkpoint store does not support compare-and-swap");
  }
  const result = hasExpectedRevision
    ? await provider.write(skill, session, checkpoint, { expectedRevision })
    : await provider.write(skill, session, checkpoint);
  if (provider.capabilities.compareAndSwap && (!result || typeof result.revision !== "string" || result.revision === "")) {
    throw new CheckpointStoreContractError("compare-and-swap writes must return a non-empty revision");
  }
  return { revision: result?.revision ?? null };
}
