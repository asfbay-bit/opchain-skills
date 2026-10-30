// IP address rules (design §5.8 and §5.6), with no imports at all, so both
// net.mjs (health) and capture.mjs can use them without capture pulling a
// network module into the no-network verbs' import graph (C25 a).

// A public host name: dot-separated labels of letters, digits and hyphens,
// ending in an alphabetic top-level label. health's hosts and (1.1.1,
// SA-020) capture's origins are held to it, so nothing else (`,`, `*`, `!`)
// can reach a request or Chrome's --host-resolver-rules.
export const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,61}[a-z0-9]$/;

export function ipv4(a) {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(a)) return null;
  const p = a.split(".").map(Number);
  return p.every((n) => n <= 255) ? p : null;
}

export function ipv6Words(a) {
  let s = String(a).toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  if (!/^[0-9a-f:.]+$/.test(s) || !s.includes(":")) return null;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) {
    const p = ipv4(tail[1]);
    if (!p) return null;
    s = s.slice(0, -tail[1].length) + `${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  if ((s.match(/::/g) || []).length > 1) return null;
  const [head, rest] = s.split("::");
  const h = head ? head.split(":") : [];
  const r = rest !== undefined && rest ? rest.split(":") : [];
  const fill = s.includes("::") ? 8 - h.length - r.length : 0;
  if (fill < 0 || (!s.includes("::") && h.length !== 8)) return null;
  const parts = [...h, ...new Array(fill).fill("0"), ...r];
  if (parts.some((w) => !/^[0-9a-f]{1,4}$/.test(w))) return null;
  const words = parts.map((w) => parseInt(w, 16));
  return words.length === 8 ? words : null;
}

export function v4Blocked([a, b, c]) {
  return (
    a === 0 || // "this" network
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // IETF protocol assignments, TEST-NET-1
    (a === 192 && b === 88 && c === 99) || // 6to4 relay anycast
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  );
}

const embedded = (hi, lo) => [hi >> 8, hi & 255, lo >> 8, lo & 255];

// True when ow-tools must not connect to this address. IPv6 is an allowlist:
// only global unicast (2000::/3) passes, minus the special ranges inside it;
// forms that embed an IPv4 address are judged by that address.
export function blockedAddress(address) {
  if (isMetadataAddress(address)) return true;
  const four = ipv4(address);
  if (four) return v4Blocked(four);
  const w = ipv6Words(address);
  if (!w) return true;
  const zeros = (n) => w.slice(0, n).every((x) => x === 0);
  if (zeros(5) && w[5] === 0xffff) return v4Blocked(embedded(w[6], w[7])); // IPv4-mapped ::ffff:a.b.c.d
  if (zeros(4) && w[4] === 0xffff && w[5] === 0) return true; // IPv4-translated ::ffff:0:0/96 (SIIT): never a public destination
  if (zeros(6)) return true; // ::, ::1 and IPv4-compatible
  if (w[0] === 0x64 && w[1] === 0xff9b && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0) return v4Blocked(embedded(w[6], w[7])); // NAT64 well-known
  if ((w[0] & 0xe000) !== 0x2000) return true; // outside global unicast: fc00::/7, fe80::/10, fec0::/10, ff00::/8, 100::/64, 64:ff9b:1::/48, …
  if (w[0] === 0x2001 && w[1] === 0) return true; // Teredo
  if (w[0] === 0x2001 && w[1] === 2 && w[2] === 0) return true; // benchmarking 2001:2::/48
  if (w[0] === 0x3fff && (w[1] & 0xf000) === 0) return true; // documentation 3fff::/20 (RFC 9637)
  if (w[0] === 0x2001 && w[1] === 0xdb8) return true; // documentation
  if (w[0] === 0x2001 && (w[1] & 0xffe0) === 0x0020) return true; // ORCHIDv2 2001:20::/28
  if (w[0] === 0x2001 && (w[1] & 0xfff0) === 0x0010) return true; // ORCHID 2001:10::/28
  if (w[0] === 0x2002) return v4Blocked(embedded(w[1], w[2])); // 6to4
  return false;
}

// The IPv4 address an IPv6 address wraps, if it is one of the forms that do:
// IPv4-mapped, IPv4-translated, IPv4-compatible (::a.b.c.d), NAT64
// (64:ff9b::/96) and 6to4 (2002::/16). Bug 6: the capture origin rules judge
// these by the address inside, as blockedAddress already did.
export function embeddedIpv4(w) {
  const zeros = (n) => w.slice(0, n).every((x) => x === 0);
  if (zeros(5) && w[5] === 0xffff) return embedded(w[6], w[7]);
  if (zeros(4) && w[4] === 0xffff && w[5] === 0) return embedded(w[6], w[7]);
  if (zeros(6)) return embedded(w[6], w[7]);
  if (w[0] === 0x64 && w[1] === 0xff9b && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0) return embedded(w[6], w[7]);
  if (w[0] === 0x2002) return embedded(w[1], w[2]);
  return null;
}

// Loopback or unspecified, in any spelling a URL's host can take (SA-013):
// `localhost`, `*.localhost`, either with a trailing dot, IPv4 and IPv6
// literals of 127/8, 0/8, ::1 and ::, and every IPv6 form that wraps one.
export function isLoopbackHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  const four = ipv4(h);
  if (four) return four[0] === 127 || four[0] === 0;
  const w = ipv6Words(h);
  if (!w) return false;
  const v4 = embeddedIpv4(w);
  return Boolean(v4 && (v4[0] === 127 || v4[0] === 0)); // ::, ::1, ::a.b.c.d, mapped, NAT64, 6to4
}

// Link-local, where cloud metadata services live (169.254.169.254): IPv4,
// fe80::/10, and every IPv6 form that wraps 169.254/16 (::a9fe:a9fe,
// ::ffff:169.254.x.x, 64:ff9b::a9fe:a9fe, 2002:a9fe:…). Never a capture origin.
export function isLinkLocalHost(hostname) {
  const h = String(hostname).toLowerCase().replace(/\.$/, "");
  if (isMetadataAddress(h)) return true; // 1.1.1 (Bug 5): metadata outside 169.254/16 too
  const four = ipv4(h);
  if (four) return four[0] === 169 && four[1] === 254;
  const w = ipv6Words(h);
  if (!w) return false;
  const v4 = embeddedIpv4(w);
  if (v4) return v4[0] === 169 && v4[1] === 254;
  return (w[0] & 0xffc0) === 0xfe80;
}

// Cloud metadata services, in one place (1.1.1, Bug 5): capture refuses them
// as origins and as answers for an allowed name, and health refuses them as
// destinations. Link-local 169.254/16 is refused as a range besides; these
// are the ones outside it, and the common link-local ones by name.
export const METADATA_ADDRESSES = Object.freeze([
  "169.254.169.254", // AWS, Azure, Google Cloud, Oracle, DigitalOcean and others
  "169.254.170.2", // AWS ECS task metadata
  "fd00:ec2::254", // AWS IPv6
  "100.100.100.200", // Alibaba Cloud
  "192.0.0.192", // Oracle Cloud Classic
]);
const canonical = (a) => {
  const s = String(a).toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  const four = ipv4(s);
  if (four) return `4:${four.join(".")}`;
  const w = ipv6Words(s);
  if (!w) return null;
  const v4 = embeddedIpv4(w);
  return v4 ? `4:${v4.join(".")}` : `6:${w.join(":")}`;
};
const METADATA = new Set(METADATA_ADDRESSES.map(canonical));
// True for a metadata address in any spelling (IPv4-mapped, NAT64, 6to4 included).
export function isMetadataAddress(address) {
  const c = canonical(address);
  return c !== null && METADATA.has(c);
}
