/**
 * Offline validator for building-evidence discovery records.
 * It validates identity, provenance links and invalidation bindings only; it
 * does not browse, search, judge source truth, or grant an external capability.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';

const HASH = /^[a-f0-9]{64}$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const TERMINAL = new Set(['RESOLVED', 'PARTIAL', 'CONFLICTED', 'UNKNOWN', 'BUDGET_EXHAUSTED']);
const digest = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function jobFile(root, id, relative) {
  const base = path.join(realpathSync(root), 'jobs', id);
  const target = path.resolve(base, relative);
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error('Discovery reference escaped its job directory.');
  const actual = realpathSync(target);
  if (!actual.startsWith(`${base}${path.sep}`)) throw new Error('Discovery reference escaped through a symlink.');
  return actual;
}

function loadJSON(file) {
  const value = JSON.parse(readFileSync(file, 'utf8'));
  if (!object(value)) throw new Error('Expected a JSON object.');
  return value;
}

/** Recompute the discovery state from current files; no cached PASS is trusted. */
export function evaluateDiscovery(root, id) {
  if (typeof id !== 'string' || !SLUG.test(id)) throw new Error('Invalid discovery job id.');
  const directory = path.join(realpathSync(root), 'jobs', id);
  if (!existsSync(directory) || realpathSync(directory) !== directory) throw new Error('Discovery job directory must exist and must not be a symlink.');
  const issues = [];
  const add = (code, detail, severity = 'BLOCKER') => issues.push({ code, detail, severity });
  const planCandidate = path.join(directory, 'discovery-plan.json');
  const indexCandidate = path.join(directory, 'discovery', 'index.json');
  if (!existsSync(planCandidate) || !existsSync(indexCandidate)) return {
    schema_version: 'discovery-evaluation.v1', job_id: id, status: 'NOT_CONFIGURED', ready: false,
    current_attempt_id: null, gaps: [], issues: [{ code: 'DISCOVERY_RECORDS_MISSING', severity: 'BLOCKER', detail: 'Create discovery-plan.json and discovery/index.json before declaring the discovery station complete.' }],
  };
  const planPath = jobFile(root, id, 'discovery-plan.json');
  const indexPath = jobFile(root, id, 'discovery/index.json');
  let plan; let index;
  try {
    plan = loadJSON(planPath); index = loadJSON(indexPath);
  } catch (error) {
    return { schema_version: 'discovery-evaluation.v1', job_id: id, status: 'INVALID', ready: false, current_attempt_id: null, gaps: [], issues: [{ code: 'DISCOVERY_JSON_INVALID', severity: 'ERROR', detail: error.message }] };
  }
  const planHash = digest(planPath);
  if (plan.schema_version !== 'discovery-plan.v1' || plan.job_id !== id || plan.kind !== 'PROJECT_EVIDENCE_GAP_COMPLETION' || !['DRAFT', 'READY'].includes(plan.status) || !Array.isArray(plan.gaps)) add('DISCOVERY_PLAN_INVALID', 'Plan version, job identity, discovery kind, status or gaps list is invalid.', 'ERROR');
  const requestCandidate = path.join(directory, 'request.json');
  const sourcesCandidate = path.join(directory, 'sources.json');
  const requestPath = existsSync(requestCandidate) ? jobFile(root, id, 'request.json') : requestCandidate;
  const sourcesPath = existsSync(sourcesCandidate) ? jobFile(root, id, 'sources.json') : sourcesCandidate;
  const requestHash = existsSync(requestPath) ? digest(requestPath) : null;
  const sourcesHash = existsSync(sourcesPath) ? digest(sourcesPath) : null;
  if (!requestHash || plan.bindings?.request_sha256 !== requestHash) add('STALE_DISCOVERY_PLAN', 'Plan must bind the current request.json bytes.');

  const gapById = new Map();
  for (const gap of plan.gaps ?? []) {
    if (!object(gap) || typeof gap.gap_id !== 'string' || !gap.gap_id.trim() || gapById.has(gap.gap_id) || !['P1', 'P2', 'P3'].includes(gap.priority) || !['identity', 'planning', 'construction', 'visual_review', 'video'].includes(gap.blocked_station) || typeof gap.question !== 'string' || !gap.question.trim()) {
      add('DISCOVERY_GAP_INVALID', 'Gap IDs must be unique and each gap must declare P1/P2/P3 priority.', 'ERROR');
      continue;
    }
    gapById.set(gap.gap_id, gap);
    if (!Array.isArray(gap.evidence_types) || !gap.evidence_types.length || !Array.isArray(gap.allowed_sources) || !gap.allowed_sources.length || !Array.isArray(gap.stop_conditions) || !gap.stop_conditions.length || !object(gap.search_budget)) add('DISCOVERY_GAP_CONTRACT_INCOMPLETE', `${gap.gap_id} needs evidence types, allowed sources, a bounded search budget and stop conditions.`);
    if (!object(gap.search_budget) || !Number.isInteger(gap.search_budget.max_queries) || gap.search_budget.max_queries < 1 || !Number.isFinite(gap.search_budget.max_minutes) || gap.search_budget.max_minutes <= 0) add('DISCOVERY_BUDGET_INVALID', `${gap.gap_id} needs positive query and time budgets.`);
  }
  if (index.schema_version !== 'discovery-index.v1' || index.job_id !== id || !Array.isArray(index.attempts)) add('DISCOVERY_INDEX_INVALID', 'Index version, job identity or attempt list is invalid.', 'ERROR');
  const attempts = new Map();
  for (const entry of index.attempts ?? []) {
    if (!object(entry) || typeof entry.attempt_id !== 'string' || attempts.has(entry.attempt_id) || typeof entry.reference?.path !== 'string' || !HASH.test(entry.reference?.sha256 ?? '')) {
      add('DISCOVERY_INDEX_ENTRY_INVALID', 'Attempt IDs and file references must be unique and complete.', 'ERROR');
      continue;
    }
    attempts.set(entry.attempt_id, entry);
    try {
      const expectedPath = `jobs/${id}/discovery/attempts/${entry.attempt_id}.json`;
      if (entry.reference.path !== expectedPath) throw new Error('Attempt path does not match its immutable attempt ID.');
      const file = jobFile(root, id, path.relative(`jobs/${id}`, entry.reference.path));
      if (digest(file) !== entry.reference.sha256) throw new Error('Attempt SHA-256 differs from the indexed bytes.');
    } catch (error) { add('DISCOVERY_ATTEMPT_REFERENCE_INVALID', `${entry.attempt_id}: ${error.message}`, 'ERROR'); }
  }
  const currentId = index.current_attempt_id;
  let current = null;
  const sourceDoc = existsSync(sourcesPath) ? loadJSON(sourcesPath) : {};
  const sourceIds = new Set((Array.isArray(sourceDoc.entries) ? sourceDoc.entries : []).map((entry) => entry?.id).filter((value) => typeof value === 'string'));
  const evaluatedGaps = [];
  let currentAttemptHash = null;
  if (!currentId || !attempts.has(currentId)) add('DISCOVERY_ATTEMPT_NOT_SELECTED', 'Index must select a recorded current attempt.');
  else {
    const indexed = attempts.get(currentId);
    try {
      current = loadJSON(jobFile(root, id, path.relative(`jobs/${id}`, indexed.reference.path)));
      currentAttemptHash = indexed.reference.sha256;
      if (current.schema_version !== 'discovery-attempt.v1' || current.job_id !== id || current.attempt_id !== currentId) add('DISCOVERY_ATTEMPT_IDENTITY_INVALID', 'Current attempt identity does not match the index.', 'ERROR');
      const module = current.module;
      if (!object(module) || !['module_id', 'version', 'owner', 'capability', 'data_retention'].every((key) => typeof module[key] === 'string' && module[key].trim()) || !['input_contract', 'output_contract', 'evidence_contract', 'allowed_actions', 'forbidden_actions', 'side_effects', 'limitations'].every((key) => Array.isArray(module[key]) && (key === 'side_effects' || module[key].length > 0)) || !object(module.lifecycle) || !['upgrade', 'rollback', 'replacement', 'revocation'].every((key) => typeof module.lifecycle[key] === 'string' && module.lifecycle[key].trim())) add('DISCOVERY_MODULE_CONTRACT_INCOMPLETE', 'Attempt must bind module owner/version, capability, I/O, evidence, permissions, data retention, lifecycle and limitations.', 'ERROR');
      if (current.bindings?.request_sha256 !== requestHash || current.bindings?.plan_sha256 !== planHash || current.bindings?.sources_sha256 !== sourcesHash) add('STALE_DISCOVERY_ATTEMPT', 'Current attempt must bind current request, plan and sources bytes.');
      const started = Date.parse(current.started_at);
      const completed = Date.parse(current.completed_at);
      if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) add('DISCOVERY_TIME_INVALID', 'Attempt start and completion times must be ordered timestamps.', 'ERROR');
      if (!Array.isArray(current.queries)) add('DISCOVERY_QUERIES_INVALID', 'Attempt queries must be an array.', 'ERROR');
      const queriesByGap = new Map();
      for (const query of current.queries ?? []) {
        if (!object(query) || !Array.isArray(query.gap_ids) || !query.gap_ids.length || ![query.query, query.source_scope, query.result].every((value) => typeof value === 'string' && value.trim())) { add('DISCOVERY_QUERY_INVALID', 'Each query needs text, an allowed source scope, related gap IDs and an observed result.', 'ERROR'); continue; }
        for (const gapId of query.gap_ids) {
          const gap = gapById.get(gapId);
          if (!gap) { add('DISCOVERY_QUERY_GAP_UNKNOWN', `${gapId} in query is absent from the plan.`, 'ERROR'); continue; }
          if (!gap.allowed_sources.includes(query.source_scope)) add('DISCOVERY_SOURCE_SCOPE_FORBIDDEN', `${gapId} query used an unlisted source scope: ${query.source_scope}.`, 'ERROR');
          queriesByGap.set(gapId, (queriesByGap.get(gapId) ?? 0) + 1);
          if (queriesByGap.get(gapId) > (gap.search_budget?.max_queries ?? Number.POSITIVE_INFINITY)) add('DISCOVERY_QUERY_BUDGET_EXCEEDED', `${gapId} used more queries than its plan allows.`, 'ERROR');
        }
      }
      for (const [gapId, gap] of gapById) if ((queriesByGap.get(gapId) ?? 0) === 0) add('DISCOVERY_GAP_NOT_SEARCHED', `${gapId} has no query record in this attempt.`);
      if (Number.isFinite(started) && Number.isFinite(completed)) for (const [gapId, gap] of gapById) if ((completed - started) / 60000 > (gap.search_budget?.max_minutes ?? Number.POSITIVE_INFINITY)) add('DISCOVERY_TIME_BUDGET_EXCEEDED', `${gapId} exceeded its planned time budget.`, 'ERROR');
      const claims = new Map();
      if (!Array.isArray(current.observations)) add('DISCOVERY_OBSERVATIONS_INVALID', 'Attempt observations must be an array.', 'ERROR');
      for (const observation of current.observations ?? []) {
        if (!object(observation) || typeof observation.claim_id !== 'string' || claims.has(observation.claim_id) || !gapById.has(observation.gap_id) || !['OBSERVED', 'SOURCE_REPORTED', 'CONTRADICTS', 'UNKNOWN'].includes(observation.claim_kind) || typeof observation.statement !== 'string' || !observation.statement.trim() || typeof observation.locator !== 'string' || !observation.locator.trim() || (observation.source_id != null && !sourceIds.has(observation.source_id)) || (observation.claim_kind !== 'UNKNOWN' && !observation.source_id)) { add('DISCOVERY_OBSERVATION_INVALID', 'Observation must preserve a unique claim ID, planned gap, claim kind, precise locator and existing source ID when known.', 'ERROR'); continue; }
        claims.set(observation.claim_id, observation);
      }
      if (!Array.isArray(current.outcomes)) add('DISCOVERY_OUTCOMES_INVALID', 'Attempt outcomes must be an array.', 'ERROR');
      const outcomes = new Map();
      for (const outcome of current.outcomes ?? []) {
        if (!object(outcome) || !gapById.has(outcome.gap_id) || outcomes.has(outcome.gap_id) || !TERMINAL.has(outcome.status)) { add('DISCOVERY_OUTCOME_INVALID', 'Outcome must identify one planned gap exactly once and use a declared terminal status.', 'ERROR'); continue; }
        outcomes.set(outcome.gap_id, outcome);
        if (!Array.isArray(outcome.source_ids) || outcome.source_ids.some((sourceId) => !sourceIds.has(sourceId))) add('DISCOVERY_OUTCOME_SOURCE_UNKNOWN', `${outcome.gap_id} cites a source ID absent from current sources.json.`);
        if (outcome.status === 'RESOLVED' && (!Array.isArray(outcome.source_ids) || outcome.source_ids.length === 0)) add('DISCOVERY_RESOLUTION_UNSOURCED', `${outcome.gap_id} cannot be RESOLVED without at least one current source ID.`);
        if (outcome.status === 'RESOLVED' && (!Array.isArray(outcome.claim_ids) || !outcome.claim_ids.length || outcome.claim_ids.some((claimId) => claims.get(claimId)?.gap_id !== outcome.gap_id || !outcome.source_ids.includes(claims.get(claimId)?.source_id)))) add('DISCOVERY_RESOLUTION_UNSUPPORTED', `${outcome.gap_id} resolution must cite observations and the same source IDs for that gap.`);
        if (outcome.status === 'CONFLICTED' && (!Array.isArray(outcome.source_ids) || !Array.isArray(outcome.claim_ids) || new Set(outcome.claim_ids.map((claimId) => claims.get(claimId)?.gap_id === outcome.gap_id ? claims.get(claimId)?.source_id : null).filter(Boolean)).size < 2)) add('DISCOVERY_CONFLICT_EVIDENCE_INCOMPLETE', `${outcome.gap_id} must preserve observations from at least two distinct sources.`);
        if (!Array.isArray(outcome.limitations)) add('DISCOVERY_LIMITATIONS_MISSING', `${outcome.gap_id} must preserve limitations as a list.`);
      }
      for (const [gapId, gap] of gapById) {
        const outcome = outcomes.get(gapId);
        const status = outcome?.status ?? 'NOT_RUN';
        evaluatedGaps.push({ gap_id: gapId, priority: gap.priority, blocked_station: gap.blocked_station, status });
        if (!outcome) add('DISCOVERY_GAP_NOT_RUN', `${gapId} has no result in the selected attempt.`);
        else if (gap.priority !== 'P3' && status !== 'RESOLVED') add('REQUIRED_DISCOVERY_GAP_OPEN', `${gapId} is ${status}; its dependent station must remain blocked.`);
        else if (status !== 'RESOLVED') add('OPTIONAL_DISCOVERY_GAP_OPEN', `${gapId} remains ${status} and must be carried into the model limitations.`);
      }
      for (const gapId of outcomes.keys()) if (!gapById.has(gapId)) add('UNPLANNED_DISCOVERY_OUTCOME', `${gapId} is absent from the current plan.`, 'ERROR');
      if (!Array.isArray(current.source_coverage) || !current.source_coverage.length || current.source_coverage.some((sourceId) => !sourceIds.has(sourceId))) add('DISCOVERY_SOURCE_COVERAGE_INVALID', 'Source coverage must cite at least one ID from the bound source package.');
      if (typeof current.stop_reason !== 'string' || !current.stop_reason.trim()) add('DISCOVERY_STOP_REASON_MISSING', 'Record why this attempt stopped.');
    } catch (error) { add('DISCOVERY_CURRENT_ATTEMPT_INVALID', error.message, 'ERROR'); }
  }
  const blocking = issues.some((issue) => issue.severity === 'ERROR' || !issue.code.startsWith('OPTIONAL_'));
  const ready = plan.status === 'READY' && current !== null && !blocking;
  return {
    schema_version: 'discovery-evaluation.v1', job_id: id,
    status: ready ? 'READY' : issues.some((issue) => issue.code === 'STALE_DISCOVERY_ATTEMPT' || issue.code === 'STALE_DISCOVERY_PLAN') ? 'STALE' : current ? 'NEEDS_REVISION' : 'NOT_RUN',
    ready, current_attempt_id: currentId ?? null, gaps: evaluatedGaps, issues,
    bindings: { request_sha256: requestHash, plan_sha256: planHash, sources_sha256: sourcesHash, attempt_sha256: currentAttemptHash },
    limits: { performs_search: false, judges_truth: false, authorizes_source_republication: false },
  };
}
