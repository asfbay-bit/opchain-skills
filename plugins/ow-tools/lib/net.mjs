// The one module through which ow-tools makes an outbound request (design §8,
// Network). Only `health` uses it. Rules, all here so a test can hold them:
//
// - https only, to a host on this run's destination list; GET or HEAD, and
//   POST only to the advisory API;
// - the name is resolved once, every address is checked, and the socket
//   connects to that checked address (SNI and the certificate still use the
//   name), so a DNS answer that changes between check and connect can't
//   reach a loopback, private, link-local, CGNAT or metadata address;
// - no redirect is followed, no cookie or auth header is sent, a fixed
//   User-Agent, a timeout, and a cap on the response body.
//
// The resolver, the connector and the destination table are parameters, for
// tests only: no environment variable or flag changes them in a shipped build.
import { request as httpsRequest } from "node:https";
import { lookup } from "node:dns";
import { isIP } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { blockedAddress } from "./addr.mjs";
import { VERSION } from "./core.mjs";

export const DESTINATIONS = Object.freeze({
  osv: "api.osv.dev",
  npm: "registry.npmjs.org",
  iana: "data.iana.org",
});
export const USER_AGENT = `ow-tools/${VERSION} (health; read-only)`;
export const BODY_CAP = 64 * 1024;
const TIMEOUT_MS = 15000;

// ---- address rules: lib/addr.mjs (shared with capture) -------------------------
export { blockedAddress } from "./addr.mjs";

// ---- the client --------------------------------------------------------------
const defaultResolver = (host) =>
  new Promise((resolve, reject) => lookup(host, { all: true, verbatim: true }, (err, list) => (err ? reject(err) : resolve(list.map((x) => x.address)))));

// `inspect` (the certificate check) completes the handshake even for an
// untrusted certificate, to read its dates; nothing is sent over it.
const defaultConnector = ({ address, port, servername, inspect = false }) =>
  tlsConnect({ host: address, port, servername, rejectUnauthorized: !inspect, ALPNProtocols: ["http/1.1"] });

const CHECKED = Symbol("ow-tools checked address");
const connected = (sock, address) => Object.assign(sock, { [CHECKED]: address });

export class NetError extends Error {
  constructor(reason, message) {
    super(message);
    this.reason = reason;
  }
}

export function createNet({ hosts = [], resolver = defaultResolver, connector = defaultConnector, destinations = DESTINATIONS, timeoutMs = TIMEOUT_MS, log } = {}) {
  const allowed = new Set([...Object.values(destinations), ...hosts].map((h) => h.toLowerCase()));
  const postHost = destinations.osv.toLowerCase();

  // Resolve once and refuse any blocked answer: a name that resolves to both
  // a public and a private address is refused outright.
  async function resolveChecked(host) {
    if (isIP(host)) throw new NetError("address-not-allowed", "an IP address is not a destination ow-tools contacts");
    let list;
    try {
      list = await resolver(host);
    } catch {
      throw new NetError("unreachable", "the name did not resolve");
    }
    if (!list.length) throw new NetError("unreachable", "the name did not resolve");
    if (list.some(blockedAddress)) throw new NetError("address-not-allowed", "the name resolves to a loopback, private, link-local or reserved address");
    return list[0];
  }

  function checkUrl(url, method) {
    let u;
    try {
      u = new URL(url);
    } catch {
      throw new NetError("bad-url", "not a URL");
    }
    if (u.protocol !== "https:") throw new NetError("not-https", "only https is used");
    if (u.username || u.password) throw new NetError("userinfo", "a URL with a user name or password is never used");
    const host = u.hostname.toLowerCase();
    if (!allowed.has(host)) throw new NetError("not-a-destination", "the host is not on this run's destination list");
    if (method === "POST" && host !== postHost) throw new NetError("method-not-allowed", "POST goes to the advisory API only");
    if (!["GET", "HEAD", "POST"].includes(method)) throw new NetError("method-not-allowed", "only GET, HEAD and POST");
    return u;
  }

  // TLS handshake only: the certificate's dates and whether it is trusted.
  async function certificate(host, port = 443) {
    const h = host.toLowerCase();
    if (!allowed.has(h)) throw new NetError("not-a-destination", "the host is not on this run's destination list");
    const address = await resolveChecked(h);
    log?.({ kind: "tls", host: h, port });
    return new Promise((resolve, reject) => {
      const sock = connector({ address, port, servername: h, inspect: true });
      const done = (fn, v) => {
        clearTimeout(timer);
        sock.destroy();
        fn(v);
      };
      const timer = setTimeout(() => done(reject, new NetError("unreachable", "timed out")), timeoutMs);
      sock.once("secureConnect", () => {
        const c = sock.getPeerCertificate();
        done(resolve, { valid_to: c?.valid_to || null, authorized: sock.authorized, error: sock.authorizationError ? String(sock.authorizationError.code || sock.authorizationError) : null });
      });
      sock.once("error", (err) => {
        // An untrusted or expired certificate is a finding, not a failure.
        const code = err?.code || "";
        if (/CERT|SELF_SIGNED|UNABLE_TO|HOSTNAME|ERR_TLS/.test(code)) done(resolve, { valid_to: null, authorized: false, error: code });
        else done(reject, new NetError("unreachable", "the connection failed"));
      });
    });
  }

  async function request(url, { method = "GET", body = null, accept = "application/json", cap = BODY_CAP } = {}) {
    const u = checkUrl(url, method);
    const host = u.hostname.toLowerCase();
    const port = Number(u.port || 443);
    const address = await resolveChecked(host);
    const payload = body === null ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const headers = { Host: u.host, "User-Agent": USER_AGENT, Accept: accept, Connection: "close" };
    if (payload) Object.assign(headers, { "Content-Type": "application/json", "Content-Length": String(payload.length) });
    log?.({ kind: "http", method, host, path: u.pathname, bytes: payload?.length || 0 });
    return new Promise((resolve, reject) => {
      const req = httpsRequest({
        method,
        host,
        port,
        path: `${u.pathname}${u.search}`,
        headers,
        // No `agent`: with one (even `agent: false`, which makes a fresh Agent)
        // Node ignores createConnection and resolves the name again itself,
        // which would skip the address check above.
        createConnection: () => connected(connector({ address, port, servername: host }), address),
      });
      const timer = setTimeout(() => req.destroy(new NetError("unreachable", "timed out")), timeoutMs);
      // Belt and braces (F-016): the socket must be the one this module
      // opened to the checked address, never one Node opened by itself. The
      // 'socket' event fires before the request is flushed, so a regression
      // here fails with nothing sent.
      req.on("socket", (sock) => {
        if (sock?.[CHECKED] !== address) req.destroy(new NetError("address-not-allowed", "the connection was not made to the checked address"));
      });
      req.on("response", (res) => {
        const chunks = [];
        let n = 0;
        res.on("data", (c) => {
          n += c.length;
          if (n > cap) {
            req.destroy(new NetError("too-large", "the response was larger than ow-tools reads"));
            return;
          }
          chunks.push(c);
        });
        res.on("end", () => {
          clearTimeout(timer);
          const location = res.headers.location;
          let locationHost = null;
          if (location) {
            try {
              locationHost = new URL(location, url).hostname;
            } catch {
              locationHost = "(unreadable)";
            }
          }
          resolve({ status: res.statusCode, body: Buffer.concat(chunks), locationHost });
        });
        res.on("error", (e) => {
          clearTimeout(timer);
          reject(e instanceof NetError ? e : new NetError("unreachable", "the response broke off"));
        });
      });
      req.on("error", (e) => {
        clearTimeout(timer);
        reject(e instanceof NetError ? e : new NetError(/CERT|SELF_SIGNED|UNABLE_TO|HOSTNAME/.test(e?.code || "") ? "tls-untrusted" : "unreachable", "the request failed"));
      });
      if (payload) req.end(payload);
      else req.end();
    });
  }

  return { request, certificate, allowed, resolveChecked };
}
