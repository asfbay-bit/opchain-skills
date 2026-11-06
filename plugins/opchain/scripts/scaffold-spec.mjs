#!/usr/bin/env node
/**
 * scripts/scaffold-spec.mjs — materialise the `spec/` tree oc-app-architect
 * describes but never creates.
 *
 *   node scripts/scaffold-spec.mjs [--root <dir>] [--force] [--ai] [--json]
 *
 * The 2026-10-08 effectiveness audit (I-09) found a one-week launch with no
 * `spec/` tree at all: the artifact layout `spec/00..10` is described in
 * skills/oc-app-architect/SKILL.md (“Spec Documents” table) but nothing wrote
 * it, so every artifact-keyed handoff in orchestrator.md §3 (06-testing.md →
 * oc-qa-ops, 03-security-auth.md → oc-security-auditor, …) had nothing to key
 * on. This script writes one stub per spec document. Each stub's first line is
 * a marker naming the skill or verb that owns the real content:
 *
 *   <!-- opchain:stub produced-by=/oc-qa pyramid; this line is removed by that skill when it writes the file -->
 *
 * The producing skill replaces the stub (dropping the marker). `stubFiles(root)`
 * finds stubs that still carry the marker. A commit gate that refuses a build
 * phase on a placeholder 06-testing.md is specified, not yet wired: nothing
 * calls `stubFiles` from a hook yet, so the skill asks the agent to check.
 *
 * The file list and section headings are read from the skill's own SKILL.md
 * table and references/spec-template.md when those are reachable (authoring
 * checkout, or a consumer install under .claude/skills / .agents/skills); a
 * hard-coded copy of the same table is the fallback so a consumer without the
 * skill installed still gets the canonical layout.
 *
 * Existing files are never overwritten unless they still carry the marker, or
 * --force is passed.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { realpathSync } from "node:fs";

export const STUB_MARKER = /^<!-- opchain:stub produced-by=([^;]+); this line is removed by that skill when it writes the file -->$/;
export const SPEC_DIR = "spec";
const SCRIPT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Canonical copy of the SKILL.md “Spec Documents” table (00–10 always, 11 for AI apps). */
export const FALLBACK_DOCUMENTS = [
  { file: "00-project-overview.md", title: "Project Overview", contents: "Problem, personas, success metrics, scope", source: "Discovery interview", producedBy: "/oc-discover" },
  { file: "01-tech-stack.md", title: "Tech Stack", contents: "Stack recommendation + rationale", source: "Stack-forge output", producedBy: "oc-stack-forge" },
  { file: "02-architecture.md", title: "Architecture Design", contents: "System diagram, data model, API design", source: "architecture-patterns.md", producedBy: "/oc-spec" },
  { file: "03-security-auth.md", title: "Security & Auth", contents: "Auth (from oc-stack-forge), authorization, OWASP", source: "spec-template", producedBy: "/oc-spec" },
  { file: "04-integrations.md", title: "Integration Layer", contents: "Third-party services, webhooks, retry logic", source: "spec-template", producedBy: "/oc-spec" },
  { file: "05-monetization.md", title: "Monetization", contents: "Pricing, payments (if applicable)", source: "spec-template", producedBy: "/oc-spec" },
  { file: "06-testing.md", title: "Testing Strategy", contents: "Test strategy for chosen stack", source: "oc-qa-ops", producedBy: "/oc-qa pyramid" },
  { file: "07-devops.md", title: "DevOps & Deployment", contents: "Deploy pattern for chosen platform", source: "oc-stack-forge patterns", producedBy: "oc-stack-forge" },
  { file: "08-analytics.md", title: "Analytics & Metrics", contents: "Tracking, metrics (if warranted)", source: "—", producedBy: "/oc-spec" },
  { file: "09-documentation-plan.md", title: "Documentation", contents: "Docs plan (if warranted)", source: "spec-template", producedBy: "/oc-spec" },
  { file: "10-cost-estimate.md", title: "Cost Estimate", contents: "Infra costs from oc-stack-forge projection", source: "oc-stack-forge", producedBy: "oc-stack-forge" },
  { file: "11-ai-architecture.md", title: "AI Architecture", contents: "AI apps only — see the AI-App Branch", source: "oc-claude-api and the AI skills it routes to", producedBy: "oc-claude-api", aiOnly: true },
];

/** Section headings per document when references/spec-template.md is not readable. */
export const FALLBACK_SECTIONS = {
  "00-project-overview.md": ["Problem Statement", "Solution Summary", "Prior Art & Competitive Analysis", "Target Users", "Success Metrics", "Assumptions & Constraints", "Risk Register", "Scope Boundaries"],
  "01-tech-stack.md": ["Selection Criteria", "Recommended Stack", "Stack Diagram", "Cost Estimate"],
  "02-architecture.md": ["Pattern", "System Diagram", "Component Breakdown", "Data Model", "API Design", "State Management", "Caching Strategy", "Error Handling & Recovery", "Background Jobs (if applicable)"],
  "03-security-auth.md": ["Authentication", "Authorization", "Data Protection", "API Security", "OWASP Top 10 (This Project)"],
  "04-integrations.md": ["Third-Party Services", "Webhook Patterns", "Data Sync Strategy", "API Credential Management"],
  "05-monetization.md": ["Pricing Model", "Tier Structure", "Payment Integration", "Subscription Lifecycle", "Analytics"],
  "06-testing.md": ["Coverage Targets", "Critical Flows to E2E Test", "Test Data Strategy", "Performance Budget", "Accessibility Testing"],
  "07-devops.md": ["Environments", "CI/CD Pipeline", "Database Migrations", "Monitoring & Observability", "Backup & Recovery", "Secrets Management", "Disaster Recovery Plan"],
  "08-analytics.md": ["Product Metrics", "Instrumentation", "Dashboards", "Data Privacy"],
  "09-documentation-plan.md": ["External Documentation", "Internal Documentation", "Compliance & Legal Docs"],
  "10-cost-estimate.md": ["Infrastructure Costs", "Third-Party Services", "Scaling Projections", "Total Monthly Estimate"],
  "11-ai-architecture.md": ["Model Selection", "Prompt Architecture", "Context & Retrieval", "Eval Plan", "Cost & Rate Limits", "Safety & Fallbacks"],
};

function producerFor(source, file) {
  const s = source.replace(/\*/g, "").trim();
  if (/^discovery interview/i.test(s)) return "/oc-discover";
  if (/oc-qa-ops/.test(s)) return "/oc-qa pyramid";
  const skill = /(oc-[a-z0-9-]+)/.exec(s)?.[1];
  if (skill) return skill;
  if (/stack-forge/i.test(s)) return "oc-stack-forge";
  return FALLBACK_DOCUMENTS.find((d) => d.file === file)?.producedBy ?? "/oc-spec";
}

/** Parse the “Spec Documents” table out of oc-app-architect's SKILL.md. Returns null when it is not there. */
export function parseSpecTable(skillMd) {
  const start = skillMd.indexOf("### Spec Documents");
  if (start < 0) return null;
  const rows = [];
  for (const line of skillMd.slice(start).split("\n").slice(1)) {
    if (/^#{1,3} /.test(line) && rows.length) break;
    const m = /^\|\s*(\d\d-[a-z0-9-]+\.md)\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$/.exec(line);
    if (!m) continue;
    const [, file, contents, source] = m;
    const fallback = FALLBACK_DOCUMENTS.find((d) => d.file === file);
    rows.push({
      file,
      title: fallback?.title ?? file.replace(/^\d\d-/, "").replace(/\.md$/, "").replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      contents,
      source,
      producedBy: producerFor(source, file),
      aiOnly: /AI apps only/i.test(contents) || file.startsWith("11-"),
    });
  }
  return rows.length ? rows : null;
}

/** Parse `## NN — Title` chunks of references/spec-template.md into {NN: [level-2 headings]}. */
export function parseTemplateSections(template) {
  const sections = {};
  let current = null;
  for (const line of template.split("\n")) {
    const chunk = /^## (\d\d) — /.exec(line);
    if (chunk) { current = chunk[1]; sections[current] = []; continue; }
    if (/^## [^\d]/.test(line) && !/^## Implementation Roadmap/.test(line) && current) {
      sections[current].push(line.slice(3).trim());
    } else if (/^## Implementation Roadmap/.test(line)) current = null;
  }
  return sections;
}

function firstReadable(paths) {
  for (const p of paths) { try { return readFileSync(p, "utf8"); } catch { /* next */ } }
  return null;
}

/** Resolve the document list and headings from the skill source when reachable, else the fallback. */
export function specDocuments({ root = process.cwd(), skillMd, template } = {}) {
  const skillDirs = [
    join(root, "skills/oc-app-architect"),
    join(root, ".claude/skills/oc-app-architect"),
    join(root, ".agents/skills/oc-app-architect"),
    join(SCRIPT_ROOT, "skills/oc-app-architect"),
  ];
  skillMd ??= firstReadable(skillDirs.map((d) => join(d, "SKILL.md")));
  template ??= firstReadable(skillDirs.map((d) => join(d, "references/spec-template.md")));
  const docs = (skillMd && parseSpecTable(skillMd)) ?? FALLBACK_DOCUMENTS;
  const parsed = template ? parseTemplateSections(template) : {};
  return docs.map((doc) => {
    const nn = doc.file.slice(0, 2);
    const sections = parsed[nn]?.length ? parsed[nn] : FALLBACK_SECTIONS[doc.file] ?? ["Overview", "Decisions", "Open Questions"];
    return { ...doc, sections, fromSource: Boolean(skillMd && parseSpecTable(skillMd)) };
  });
}

export function stubMarker(producedBy) {
  return `<!-- opchain:stub produced-by=${producedBy}; this line is removed by that skill when it writes the file -->`;
}

export function renderStub(doc) {
  const lines = [
    stubMarker(doc.producedBy),
    `# ${doc.title}`,
    "",
    `<!-- ${doc.file}: ${doc.contents}. Source: ${doc.source}. Written by ${doc.producedBy}; this stub was created by scripts/scaffold-spec.mjs. -->`,
    "",
  ];
  for (const section of doc.sections) lines.push(`## ${section}`, "", "_TODO_", "");
  return lines.join("\n");
}

export function isStub(text) {
  return STUB_MARKER.test(text.split(/\r?\n/, 1)[0]);
}

/** Spec files under `<root>/spec` whose first line still carries the stub marker. */
export function stubFiles(root = process.cwd(), dir = SPEC_DIR) {
  const base = join(root, dir);
  let names;
  try { names = readdirSync(base); } catch { return []; }
  const stubs = [];
  for (const name of names.sort()) {
    if (!name.endsWith(".md")) continue;
    let text;
    try { text = readFileSync(join(base, name), "utf8"); } catch { continue; }
    const m = STUB_MARKER.exec(text.split(/\r?\n/, 1)[0]);
    if (m) stubs.push({ path: `${dir}/${name}`, producedBy: m[1] });
  }
  return stubs;
}

export function scaffoldSpec({ root = process.cwd(), force = false, ai = false, dir = SPEC_DIR, skillMd, template } = {}) {
  root = resolve(root);
  const base = join(root, dir);
  mkdirSync(base, { recursive: true });
  const written = [];
  const refreshed = [];
  const skipped = [];
  for (const doc of specDocuments({ root, skillMd, template })) {
    if (doc.aiOnly && !ai) continue;
    const target = join(base, doc.file);
    if (existsSync(target)) {
      const existing = readFileSync(target, "utf8");
      if (!isStub(existing) && !force) { skipped.push(`${dir}/${doc.file}`); continue; }
      writeFileSync(target, renderStub(doc));
      refreshed.push(`${dir}/${doc.file}`);
      continue;
    }
    writeFileSync(target, renderStub(doc));
    written.push(`${dir}/${doc.file}`);
  }
  return { root, dir, written, refreshed, skipped, stubs: stubFiles(root, dir) };
}

function parseArgs(argv) {
  const opts = { root: process.cwd(), force: false, ai: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--force") opts.force = true;
    else if (a === "--ai") opts.ai = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--root") opts.root = argv[++i];
    else if (a.startsWith("--root=")) opts.root = a.slice(7);
    else if (a === "--help" || a === "-h") opts.help = true;
    else throw new Error(`Unknown option: ${a}`);
  }
  if (!opts.root) throw new Error("--root needs a directory");
  return opts;
}

export function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.log("node scripts/scaffold-spec.mjs [--root <dir>] [--force] [--ai] [--json]\nWrites spec/00..10 stubs (and 11-ai-architecture.md with --ai). Each stub's first line names the producing skill; non-stub files are left alone unless --force.");
    return 0;
  }
  const result = scaffoldSpec(opts);
  if (opts.json) { console.log(JSON.stringify(result, null, 2)); return 0; }
  for (const p of result.written) console.log(`wrote     ${p}`);
  for (const p of result.refreshed) console.log(`refreshed ${p}${opts.force ? " (--force)" : " (was a stub)"}`);
  for (const p of result.skipped) console.log(`kept      ${p} (not a stub; pass --force to overwrite)`);
  if (!result.written.length && !result.refreshed.length) console.log(`${result.dir}/ already complete; nothing written.`);
  console.log(`${result.stubs.length} stub(s) still waiting for their producing skill${result.stubs.length ? ": " + result.stubs.map((s) => `${s.path} ← ${s.producedBy}`).join(", ") : ""}.`);
  return 0;
}

if (process.argv[1] && existsSync(process.argv[1]) && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  try { process.exitCode = main(); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
