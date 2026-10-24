// Streamed SHA-256 (design §5.10). Reads in 1 MiB chunks, so a 1.6 GB model
// is never held in memory (closes F-007). No imports beyond node:, so every
// module can use it, including doctor's model check and digest.
import { closeSync, constants, fstatSync, openSync, readSync } from "node:fs";
import { createHash } from "node:crypto";

const CHUNK = 1024 * 1024;

// O_NOFOLLOW: a path swapped for a symlink after the caller checked it is
// refused by the kernel instead of followed (digest's TOCTOU guard).
export function sha256File(path, { noFollow = false } = {}) {
  const flags = constants.O_RDONLY | (noFollow ? constants.O_NOFOLLOW : 0);
  const fd = openSync(path, flags);
  try {
    if (!fstatSync(fd).isFile()) throw Object.assign(new Error("not a regular file"), { code: "ENOTFILE" });
    const hash = createHash("sha256");
    const buf = Buffer.allocUnsafe(CHUNK);
    for (;;) {
      const n = readSync(fd, buf, 0, CHUNK, null);
      if (n === 0) break;
      hash.update(buf.subarray(0, n));
    }
    return hash.digest("hex");
  } finally {
    closeSync(fd);
  }
}

export const sha256Text = (text) => createHash("sha256").update(text).digest("hex");
