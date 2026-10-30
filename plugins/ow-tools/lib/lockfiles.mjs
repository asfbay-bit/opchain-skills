// Lockfile readers for `ow-tools health` (design §5.8): npm (lockfile v1–v3),
// pnpm (v6, v9) and yarn (v1, berry). Each gives the same shape: every
// package with its name, version and where it resolves from. Read-only, and
// never a registry config file: `.npmrc` and `.yarnrc.yml` can hold tokens,
// so a lockfile that doesn't record its registry (pnpm, yarn berry) leaves
// the source "unrecorded" and health.yaml decides (`registry: public`).
import { lstatSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const LOCKFILES = ["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock"];
const PUBLIC_HOSTS = new Set(["registry.npmjs.org", "registry.yarnpkg.com"]);
const MAX_BYTES = 50 * 1024 * 1024;

// source: "public" | "unrecorded" | "private" | "local"
export function sourceOfUrl(url) {
  if (!url) return "unrecorded";
  if (/^(file|link|workspace|portal):/.test(url)) return "local";
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PUBLIC_HOSTS.has(u.hostname) ? "public" : "private";
  } catch {
    return "private";
  }
}

// A version that isn't plain semver is a URL, a git spec, an alias or a
// path: whatever the lockfile says about its registry, it never leaves the
// machine (Bug 1, OD-1). `registry: public` can't cover it either.
export const PLAIN_SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
export function versionSource(version) {
  const v = String(version ?? "");
  if (PLAIN_SEMVER.test(v)) return null;
  if (/^(file|link|workspace|portal|exec):/.test(v) || /^[./~]/.test(v)) return "local";
  return "private"; // git+…, github:…, https://…tgz, npm:alias@…, user/repo, anything else
}

const pkg = (name, version, source, direct = false) => ({ name, version, source: versionSource(version) ?? source, direct });
const nameFromPath = (p) => p.slice(p.lastIndexOf("node_modules/") + "node_modules/".length);

export function parseNpm(json) {
  const out = [];
  if (json.packages && typeof json.packages === "object") {
    for (const [path, v] of Object.entries(json.packages)) {
      if (path === "" || !path.includes("node_modules/")) continue; // root, workspace folders
      if (v.link) continue;
      const name = v.name || nameFromPath(path);
      out.push(pkg(name, v.version, v.inBundle ? "local" : sourceOfUrl(v.resolved), path === `node_modules/${name}`));
    }
    return out;
  }
  const walk = (deps, top) => {
    for (const [name, v] of Object.entries(deps || {})) {
      if (/^(file|link):/.test(v.version || "")) continue;
      const alias = npmAlias(v.version); // "npm:left-pad@1.3.0": check left-pad 1.3.0
      if (alias) out.push(pkg(alias.name, alias.version, v.bundled ? "local" : sourceOfUrl(v.resolved), top));
      else out.push(pkg(name, v.version, v.bundled ? "local" : sourceOfUrl(v.resolved), top));
      walk(v.dependencies, false);
    }
  };
  walk(json.dependencies, true);
  return out;
}

// pnpm-lock.yaml is YAML; ow-tools reads only the `packages:` keys and each
// entry's `resolution:` line, which pnpm writes in one fixed layout.
export function parsePnpm(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const ver = /^lockfileVersion:\s*'?"?(\d+)/m.exec(text)?.[1];
  const out = [];
  let inPackages = false;
  let cur = null;
  const flush = () => {
    if (cur) out.push(pkg(cur.name, cur.version, cur.source, false));
    cur = null;
  };
  for (const l of lines) {
    if (/^\S/.test(l)) {
      flush();
      inPackages = /^packages:\s*$/.test(l);
      continue;
    }
    if (!inPackages) continue;
    const key = /^ {2}(['"]?)(\/?)(.+?)\1:\s*$/.exec(l);
    if (key) {
      flush();
      const spec = key[3].replace(/\(.*$/, ""); // peer suffix "(react@18.2.0)"
      // The first "@" after a scope's: a git or URL version can hold more.
      const at = spec.indexOf("@", 1);
      if (at <= 0) continue;
      cur = { name: spec.slice(0, at), version: spec.slice(at + 1), source: "unrecorded" };
      if (/^(link|file|workspace):/.test(cur.version)) cur = null;
      continue;
    }
    const res = /^ {4}resolution:\s*\{(.*)\}\s*$/.exec(l);
    if (res && cur) {
      const tarball = /tarball:\s*([^,}\s]+)/.exec(res[1])?.[1];
      if (tarball) cur.source = sourceOfUrl(tarball);
      else if (/\b(type|repo|commit|directory):/.test(res[1])) cur.source = "private";
    }
  }
  flush();
  // Direct dependencies: importers['.'] (v9) or the top-level lists (v6).
  const direct = new Set();
  let section = null;
  for (const l of lines) {
    if (/^(dependencies|devDependencies|optionalDependencies):\s*$/.test(l)) section = "top";
    else if (/^importers:\s*$/.test(l)) section = "importers";
    else if (/^\S/.test(l)) section = null;
    const top = section === "top" && /^ {2}(['"]?)([^'"\s][^:]*?)\1:\s*$/.exec(l);
    const imp = section === "importers" && /^ {6}(['"]?)([^'"\s][^:]*?)\1:\s*$/.exec(l);
    if (top) direct.add(top[2]);
    if (imp) direct.add(imp[2]);
  }
  for (const p of out) p.direct = direct.has(p.name);
  return { packages: out, version: ver };
}

const keyName = (k) => {
  const s = k.trim().replace(/^"|"$/g, "");
  const at = s.indexOf("@", 1);
  return at > 0 ? s.slice(0, at) : s;
};
const keySpec = (k) => {
  const s = k.trim().replace(/^"|"$/g, "");
  const at = s.indexOf("@", 1);
  return at > 0 ? s.slice(at + 1) : "";
};

// `npm:<real name>@<version or range>`: an alias. Only the real package is
// ever checked, under its own name; the alias label never leaves (Bug 3).
// yarn berry writes `npm:<range>` for every registry package (`npm:^1.2.3`):
// a range or version there is no alias.
export function npmAlias(spec) {
  const m = /^npm:((?:@[^@/\s]+\/)?[^@\s]+)(?:@(.+))?$/.exec(String(spec || ""));
  if (!m || /^(?:[\d^~<>=*]|v\d)/.test(m[1]) || /\s/.test(m[1])) return null;
  return { name: m[1], version: m[2] ?? null };
}

// What a yarn key's spec says about where the package comes from (Bug 3):
// `file:` / `link:` / `portal:` / `workspace:` / `exec:` are local (yarn v1
// writes no `resolved` for them), git and URL specs private.
export function specSource(spec) {
  // A path: "./x", "../x", "~/x", "/x" (not "~1.0", a range).
  if (/^(file|link|portal|workspace|exec):/.test(spec) || /^(\.{1,2}\/|~\/|\/)/.test(spec)) return "local";
  if (/^(git\+|git:|github:|gitlab:|bitbucket:|gist:|https?:|ssh:)/.test(spec) || /^[\w.-]+\/[\w.-]+(#.*)?$/.test(spec)) return "private";
  return null;
}

export function parseYarn(text) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const berry = /^__metadata:/m.test(text);
  const out = [];
  let cur = null;
  const flush = () => {
    if (cur && cur.version && cur.source !== "skip") out.push(pkg(cur.name, cur.version, cur.source, false));
    cur = null;
  };
  for (const l of lines) {
    if (!l.trim() || l.startsWith("#")) continue;
    if (/^\S/.test(l)) {
      flush();
      if (l.startsWith("__metadata")) continue;
      const keys = l.replace(/:\s*$/, "").split(/,\s*/);
      const specs = keys.map(keySpec);
      const alias = specs.map(npmAlias).find(Boolean);
      const fixed = specs.map(specSource).find((x) => x === "local") ?? specs.map(specSource).find(Boolean) ?? null;
      cur = { name: alias ? alias.name : keyName(keys[0]), version: null, source: fixed ?? "unrecorded", fixed };
      continue;
    }
    if (!cur) continue;
    const v = berry ? /^ {2}version:\s*"?([^"\s]+)"?/.exec(l) : /^ {2}version\s+"([^"]+)"/.exec(l);
    if (v) cur.version = v[1];
    if (berry) {
      const r = /^ {2}resolution:\s*"?(.+?)"?\s*$/.exec(l);
      if (r) {
        const proto = /@(npm|workspace|patch|git|https?|file|link|portal|exec):/.exec(r[1])?.[1];
        cur.source = proto === "npm" ? "unrecorded" : proto === "workspace" || proto === "link" || proto === "portal" || proto === "file" ? "skip" : "private";
        if (proto === "npm") cur.name = keyName(r[1]); // the resolution names the real package
        if (cur.fixed === "private" && cur.source === "unrecorded") cur.source = "private";
      }
    } else {
      const r = /^ {2}resolved\s+"([^"]+)"/.exec(l);
      if (r && !cur.fixed) cur.source = sourceOfUrl(r[1]);
    }
  }
  flush();
  return { packages: out, berry };
}

function readSmall(path) {
  const st = lstatSync(path);
  if (st.isSymbolicLink()) return { error: "symlink" };
  if (!st.isFile()) return { error: "not a file" };
  if (st.size > MAX_BYTES) return { error: "lockfile over 50 MB" };
  return { text: readFileSync(path, "utf8") };
}

// Reads one lockfile. Returns { kind, packages } or { error }.
export function readLockfile(path) {
  let r;
  try {
    r = readSmall(path);
  } catch {
    return { error: "no lockfile" };
  }
  if (r.error) return r;
  const base = path.split(/[\\/]/).pop();
  try {
    if (base === "package-lock.json" || base === "npm-shrinkwrap.json") return { kind: "npm", packages: parseNpm(JSON.parse(r.text)) };
    if (base === "pnpm-lock.yaml") return { kind: "pnpm", packages: parsePnpm(r.text).packages };
    if (base === "yarn.lock") {
      const y = parseYarn(r.text);
      return { kind: y.berry ? "yarn-berry" : "yarn-v1", packages: y.packages };
    }
  } catch {
    return { error: "lockfile could not be read" };
  }
  return { error: "not a known lockfile" };
}

// Direct dependency names from package.json (never its scripts or config).
export function directDeps(repo) {
  let r;
  try {
    r = readSmall(join(repo, "package.json"));
  } catch {
    return null;
  }
  if (r.error) return null;
  try {
    const j = JSON.parse(r.text);
    return [...new Set([...Object.keys(j.dependencies || {}), ...Object.keys(j.devDependencies || {})])];
  } catch {
    return null;
  }
}

// The scope of the project's own package name ("@acme/app" → "@acme"), held
// back from every request by default (SA-014).
export function projectScope(repo) {
  try {
    const r = readSmall(join(repo, "package.json"));
    if (r.error) return null;
    const m = /^(@[a-z0-9][a-z0-9._-]*)\//.exec(String(JSON.parse(r.text).name || ""));
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// One entry per name@version; "public" wins only when every copy says so.
export function packageSet(packages) {
  const map = new Map();
  for (const p of packages) {
    if (!p.name || !p.version) continue;
    const k = `${p.name}@${p.version}`;
    const prev = map.get(k);
    if (!prev) map.set(k, { ...p });
    else {
      if (prev.source !== p.source) prev.source = [prev.source, p.source].includes("private") ? "private" : "unrecorded";
      prev.direct ||= p.direct;
    }
  }
  return [...map.values()].sort((a, b) => (a.name === b.name ? a.version.localeCompare(b.version) : a.name < b.name ? -1 : 1));
}
