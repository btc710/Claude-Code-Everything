'use strict';

const { withStore, load } = require('./store');
const { tripleKey, nowIso } = require('./ids');

// Closed vocabulary for predicates. Keeping this list small is the whole
// point of a graph — open-ended labels turn the store back into a
// keyword search and you lose the ability to walk relationships.
const PREDICATES = [
  'decided',            // subject decided X (resolved followup, accepted plan, etc.)
  'confirmed-intent',   // subject confirmed they want X
  'resolved-with',      // followup resolved with answer X
  'stakeholder',        // person X is a stakeholder of project / topic
  'constraint',         // hard constraint X applies
  'assumption',         // assumption X was baked into the plan
  'dependency',         // depends on X (system, team, integration)
  'risk-mitigated',     // risk X was mitigated by Y
  'success-criterion',  // success criterion X
];

function isPredicate(p) {
  return PREDICATES.includes(p);
}

// Normalize whitespace and lowercase so token-overlap recall is reliable
// without dragging in a stemming dep. Free-form objects (e.g. resolved-with
// notes) keep their original casing in `objectRaw` so the CLI can echo
// them back unchanged.
function normalize(s) {
  return String(s || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

function addTriple(file, t) {
  if (!t || !t.subject || !t.predicate || !t.object) {
    throw new Error('subject, predicate, object are required');
  }
  if (!isPredicate(t.predicate)) {
    throw new Error(`unknown predicate ${t.predicate}; allowed: ${PREDICATES.join(', ')}`);
  }
  if (!t.tenantId) throw new Error('tenantId required');
  return withStore(file, data => {
    const subject = normalize(t.subject);
    const object = normalize(t.object);
    const key = tripleKey({
      subject, predicate: t.predicate, object,
      tenantId: t.tenantId, projectId: t.projectId || null,
    });
    const existing = data.triples.find(x => x.id === key);
    if (existing) {
      // Last write wins for mutable fields (confidence, asOf) so re-ingest
      // refreshes provenance without duplicating rows.
      if (typeof t.confidence === 'number') existing.confidence = t.confidence;
      if (t.asOf) existing.asOf = t.asOf;
      if (t.source) existing.source = t.source;
      return existing;
    }
    const row = {
      id: key,
      subject,
      subjectRaw: String(t.subject),
      predicate: t.predicate,
      object,
      objectRaw: String(t.object),
      tenantId: t.tenantId,
      projectId: t.projectId || null,
      confidence: typeof t.confidence === 'number' ? t.confidence : 1,
      asOf: t.asOf || nowIso(),
      source: t.source || null,
    };
    data.triples.push(row);
    return row;
  });
}

function listTriples(file, filter = {}) {
  const data = load(file);
  return data.triples.filter(t =>
    (!filter.tenantId || t.tenantId === filter.tenantId) &&
    (!filter.projectId || t.projectId === filter.projectId) &&
    (!filter.predicate || t.predicate === filter.predicate) &&
    (!filter.subject || t.subject === normalize(filter.subject))
  );
}

module.exports = { addTriple, listTriples, normalize, PREDICATES, isPredicate };
