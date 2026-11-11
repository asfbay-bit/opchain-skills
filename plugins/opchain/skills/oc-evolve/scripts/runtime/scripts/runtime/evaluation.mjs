import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { assert, digest, validateCandidate, validateEvaluation } from './core.mjs';
import { runDataset, validateDataset, datasetIdentity, loadDataset, createHttpJsonAdapter } from './prompt-engine.mjs';

function validateGroups(groups, ids) {
  assert(groups && Object.keys(groups).sort().join(',') === 'heldout,target', 'Groups require target and heldout case IDs');
  const all = [];
  for (const name of ['target', 'heldout']) {
    assert(Array.isArray(groups[name]) && groups[name].length > 0, `${name} group must not be empty`);
    assert(groups[name].every(id => typeof id === 'string' && ids.includes(id)), `Unknown ${name} case`);
    all.push(...groups[name]);
  }
  assert(new Set(all).size === all.length && all.length === ids.length, 'Groups must partition every case exactly once');
  return { target: [...groups.target].sort(), heldout: [...groups.heldout].sort() };
}

// Capture the instructions, outputs and grading during execution. A legacy score
// file cannot be upgraded into evidence for a run that never recorded those bytes.
export async function runTaskEvidence({ dataset, adapter, adapterIdentity, baseInstructions,
  toolPolicy, groups, candidate, synthetic = true, now = () => Date.now() }) {
  dataset = validateDataset(dataset);
  assert(adapter && typeof adapter.run === 'function', 'An explicit evaluation adapter is required');
  assert(typeof adapterIdentity === 'string' && adapterIdentity.trim(), 'Adapter identity is required');
  assert(typeof baseInstructions === 'string' && baseInstructions.trim(), 'Complete base instructions are required');
  assert(toolPolicy && typeof toolPolicy === 'object' && !Array.isArray(toolPolicy), 'Tool policy is required');
  assert(typeof synthetic === 'boolean', 'Synthetic marker must be boolean');
  const partition = validateGroups(groups, dataset.inputs.map(row => row.id));
  const instructionBundle = { base: baseInstructions, rule: candidate?.text ?? '' };
  const manifest = {
    instructionBundle, instructionsHash: digest(instructionBundle), toolPolicyHash: digest(toolPolicy),
    datasetHash: digest({ dataset: datasetIdentity(dataset), groups: partition }),
    modelConfigHash: digest({ config: dataset.config, adapter: adapterIdentity }),
  };
  if (candidate) {
    validateCandidate(candidate, 'rule', now());
    assert(!synthetic, 'Synthetic candidate runs cannot support adoption');
    const baseline = candidate.contract.baseline;
    assert(baseline.instructionBundle.base === baseInstructions, 'Base instructions changed');
    for (const key of ['toolPolicyHash', 'datasetHash', 'modelConfigHash']) {
      assert(manifest[key] === baseline[key], `${key} changed from frozen baseline`);
    }
  }
  const transcript = [];
  const result = await runDataset({ dataset, adapter: {
    async run({ input, model }) {
      const request = { input: JSON.stringify({ instructions: instructionBundle, toolPolicy, task: input }), model };
      const response = await adapter.run(request);
      transcript.push({ kind: 'run', request, response });
      return response;
    },
    async judge(request) {
      assert(typeof adapter.judge === 'function', 'A judge adapter is required');
      const response = await adapter.judge(request);
      transcript.push({ kind: 'judge', request, response });
      return response;
    },
  } });
  assert(result.status === 'completed', `Task evaluation blocked: ${result.failure?.message ?? result.status}`);
  const scores = new Map(result.cases.map(row => [row.id, row.score]));
  const mean = ids => ids.reduce((sum, id) => sum + scores.get(id), 0) / ids.length;
  const evidence = { schemaVersion: 1, mode: 'task', synthetic, runId: randomUUID(),
    generatedAt: new Date(now()).toISOString(), ...manifest,
    outputHash: digest({ transcript, result }),
    metrics: { target: mean(partition.target), heldout: mean(partition.heldout), full: result.pass_rate },
    caseOutcomes: Object.fromEntries(result.cases.map(row => [row.id, row.score])),
  };
  if (candidate) Object.assign(evidence, { candidateDigest: digest(candidate),
    candidateRuleHash: digest(candidate.text), contractDigest: digest(candidate.contract) });
  if (candidate) validateEvaluation(candidate, evidence, now());
  return { evidence, transcript, result };
}

export async function evaluationCommand(args, root) {
  const [operation, ...rest] = args;
  assert(operation === 'run', 'Usage: evaluation run --dataset DIR --instructions FILE --policy FILE --groups FILE --endpoint URL --out FILE [--candidate FILE] [--live]');
  const opts = {}; const allowed = ['dataset', 'instructions', 'policy', 'groups', 'endpoint', 'out', 'candidate'];
  for (let i = 0; i < rest.length; i++) {
    const name = rest[i].replace(/^--/, '');
    assert(rest[i].startsWith('--') && (allowed.includes(name) || name === 'live') && !Object.hasOwn(opts, name), 'Unknown or repeated evaluation option');
    opts[name] = name === 'live' ? true : rest[++i];
    assert(opts[name] && !String(opts[name]).startsWith('--'), `Missing ${name}`);
  }
  for (const name of allowed.filter(name => name !== 'candidate')) assert(opts[name], `--${name} is required`);
  const endpoint = new URL(opts.endpoint);
  assert(endpoint.protocol === 'https:' || (endpoint.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)), 'Endpoint requires HTTPS except on localhost');
  assert(!endpoint.username && !endpoint.password && !endpoint.search && !endpoint.hash, 'Endpoint must not contain credentials, query or fragment');
  const read = file => readFileSync(resolve(root, file), 'utf8');
  const output = resolve(root, opts.out);
  // Reserve before calling a provider so an existing result is never overwritten.
  const { openSync, closeSync, unlinkSync } = await import('node:fs');
  const fd = openSync(output, 'wx', 0o600); closeSync(fd);
  try {
    const run = await runTaskEvidence({ dataset: await loadDataset(resolve(root, opts.dataset)),
      adapter: createHttpJsonAdapter({ endpoint: endpoint.href, apiKey: process.env.OPCHAIN_EVAL_API_KEY }),
      adapterIdentity: `http-json:${endpoint.href}`, baseInstructions: read(opts.instructions),
      toolPolicy: JSON.parse(read(opts.policy)), groups: JSON.parse(read(opts.groups)),
      candidate: opts.candidate ? JSON.parse(read(opts.candidate)) : undefined, synthetic: !opts.live,
    });
    writeFileSync(output, JSON.stringify(run, null, 2) + '\n');
    return { output, evidence: run.evidence };
  } catch (error) { unlinkSync(output); throw error; }
}
