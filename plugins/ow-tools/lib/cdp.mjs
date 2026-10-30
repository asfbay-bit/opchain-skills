// A DevTools-protocol client over --remote-debugging-pipe (design §5.6). The
// browser reads commands on its fd 3 and writes replies on fd 4, each message
// a JSON text ended by a NUL byte. No TCP debugging port and nothing listening, so
// nothing else on the machine can attach, and Node 20's built-ins suffice.
//
// Every method ow-tools sends is on a fixed allowlist. It has no method that
// reads cookies or storage, and none that evaluates JavaScript: elements are
// found and clicked through the DOM and Input domains only.
import { spawn } from "node:child_process";
import { failed } from "./core.mjs";

export const CDP_METHODS = Object.freeze([
  "Browser.close",
  "Browser.getVersion",
  "Browser.setDownloadBehavior",
  "Target.attachToTarget",
  "Target.closeTarget",
  "Target.createTarget",
  "Target.getTargets",
  "Target.setDiscoverTargets",
  "Page.enable",
  "Page.navigate",
  "Page.getFrameTree",
  "Page.captureScreenshot",
  "Page.handleJavaScriptDialog",
  "Emulation.setDeviceMetricsOverride",
  "DOM.enable",
  "DOM.getDocument",
  "DOM.querySelector",
  "DOM.describeNode",
  "DOM.getBoxModel",
  "DOM.scrollIntoViewIfNeeded",
  "DOM.focus",
  "Input.dispatchMouseEvent",
  "Input.insertText",
  "Fetch.enable",
  "Fetch.continueRequest",
  "Fetch.failRequest",
]);
const ALLOWED = new Set(CDP_METHODS);

export class CdpSession {
  constructor(proc) {
    this.proc = proc;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Set();
    this.closed = false;
    let buf = Buffer.alloc(0);
    proc.stdio[4].on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      for (let i = buf.indexOf(0); i >= 0; i = buf.indexOf(0)) {
        const text = buf.subarray(0, i).toString("utf8");
        buf = buf.subarray(i + 1);
        let msg;
        try {
          msg = JSON.parse(text);
        } catch {
          continue;
        }
        this.#dispatch(msg);
      }
    });
    const end = () => this.#closeAll("the browser closed the DevTools pipe");
    proc.stdio[4].on("close", end);
    proc.stdio[4].on("error", end);
    proc.stdio[3].on("error", end);
    proc.on("exit", end);
  }

  #dispatch(msg) {
    if (msg.id !== undefined && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id);
      this.pending.delete(msg.id);
      // A protocol error is reported by method name only; its message can
      // quote page content.
      if (msg.error) reject(Object.assign(new Error(`CDP error ${msg.error.code}`), { cdp: msg.error.code }));
      else resolve(msg.result || {});
      return;
    }
    if (msg.method) for (const fn of this.listeners) fn(msg);
  }

  #closeAll(reason) {
    if (this.closed) return;
    this.closed = true;
    for (const { reject } of this.pending.values()) reject(Object.assign(new Error(reason), { closed: true }));
    this.pending.clear();
  }

  send(method, params = {}, sessionId) {
    if (!ALLOWED.has(method)) return Promise.reject(new Error(`CDP method not on ow-tools' allowlist: ${method}`));
    if (this.closed) return Promise.reject(Object.assign(new Error("the browser is not running"), { closed: true }));
    const id = this.nextId++;
    const msg = { id, method, params, ...(sessionId ? { sessionId } : {}) };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc.stdio[3].write(`${JSON.stringify(msg)}\0`);
    });
  }

  on(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // Resolves with the first event matching `pred`, or rejects after `ms`.
  waitFor(pred, ms, what = "an event") {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        off();
        reject(Object.assign(new Error(`timed out waiting for ${what}`), { timeout: true }));
      }, ms);
      timer.unref(); // an abandoned wait never holds the process open
      const off = this.on((m) => {
        if (pred(m)) {
          clearTimeout(timer);
          off();
          resolve(m);
        }
      });
    });
  }
}

// Starts the browser with the DevTools pipe on fds 3 and 4. The process gets
// its own process group so the whole tree can be killed on every exit path.
export function launchBrowser(binary, args, { env = process.env } = {}) {
  if (args.some((a) => /^--remote-debugging-port\b/.test(a))) throw failed("refusing to open a TCP debugging port");
  if (!args.includes("--remote-debugging-pipe")) throw failed("the DevTools pipe flag is required");
  const proc = spawn(binary, args, { stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"], detached: true, env });
  proc.stdio[2].on("data", () => {}); // drained, never logged: browser logs can carry page text
  const session = new CdpSession(proc);
  const exited = new Promise((resolve) => proc.on("exit", (code, signal) => resolve({ code, signal })));
  const spawnError = new Promise((resolve) => proc.on("error", (err) => resolve(err)));
  return { proc, session, exited, spawnError };
}

export function killTree(proc) {
  if (!proc || proc.exitCode !== null || proc.signalCode !== null) return;
  try {
    process.kill(-proc.pid, "SIGKILL");
  } catch {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* already gone */
    }
  }
}
