'use strict';

const { load } = require('./store');
const { normalize } = require('./triples');

// Graph walk from a starting subject. Returns the set of triples reachable
// within `depth` hops, scoped to one tenant. We treat the graph as
// undirected for the walk (both subject->object and object->subject edges
// are followed) since a downstream caller usually wants the full
// neighbourhood, not just outgoing edges.
function findRelated(file, tenantId, subject, depth = 2) {
  if (!tenantId) throw new Error('tenantId required');
  if (!subject) throw new Error('subject required');
  const data = load(file);
  const scoped = data.triples.filter(t => t.tenantId === tenantId);

  const start = normalize(subject);
  const visited = new Set([start]);
  let frontier = [start];
  const hits = [];

  for (let hop = 0; hop < depth && frontier.length; hop++) {
    const next = new Set();
    for (const node of frontier) {
      for (const t of scoped) {
        if (t.subject === node || t.object === node) {
          hits.push({ ...t, hop: hop + 1 });
          if (!visited.has(t.subject)) next.add(t.subject);
          if (!visited.has(t.object)) next.add(t.object);
        }
      }
    }
    for (const n of next) visited.add(n);
    frontier = [...next];
  }

  // De-dupe by triple id, keeping the earliest hop count for each.
  const byId = new Map();
  for (const h of hits) {
    const prev = byId.get(h.id);
    if (!prev || h.hop < prev.hop) byId.set(h.id, h);
  }
  return [...byId.values()].sort((a, b) =>
    a.hop - b.hop || b.confidence - a.confidence
  );
}

// Token-overlap recall. Deliberately naive: we want the smallest possible
// surface area for a sketch. Future work plugs in embeddings here without
// changing the call signature.
function recall(file, tenantId, freeText) {
  if (!tenantId) throw new Error('tenantId required');
  const data = load(file);
  const queryTokens = tokenize(freeText);
  if (!queryTokens.size) return [];

  const scoped = data.triples.filter(t => t.tenantId === tenantId);
  const scored = [];
  for (const t of scoped) {
    const haystack = `${t.subject} ${t.object}`;
    const docTokens = tokenize(haystack);
    if (!docTokens.size) continue;
    const overlap = intersectionSize(queryTokens, docTokens);
    if (overlap === 0) continue;
    // Jaccard so longer matches don't drown out short, precise ones.
    const union = docTokens.size + queryTokens.size - overlap;
    const score = (overlap / union) * (t.confidence || 1);
    scored.push({ ...t, score, overlap });
  }
  // Decisions and resolved followups carry the most signal — break ties
  // toward them so the top of the list is actionable.
  const weight = p =>
    p === 'decided' ? 1.2 :
    p === 'resolved-with' ? 1.15 :
    p === 'confirmed-intent' ? 1.1 : 1;
  scored.sort((a, b) =>
    (b.score * weight(b.predicate)) - (a.score * weight(a.predicate))
  );
  return scored;
}

function summarize(file, tenantId) {
  if (!tenantId) throw new Error('tenantId required');
  const data = load(file);
  const scoped = data.triples.filter(t => t.tenantId === tenantId);
  const predicates = {};
  const subjects = {};
  const projects = new Set();
  for (const t of scoped) {
    predicates[t.predicate] = (predicates[t.predicate] || 0) + 1;
    subjects[t.subject] = (subjects[t.subject] || 0) + 1;
    if (t.projectId) projects.add(t.projectId);
  }
  const topDecisions = scoped
    .filter(t => t.predicate === 'decided')
    .sort((a, b) => (b.confidence - a.confidence) || (b.asOf || '').localeCompare(a.asOf || ''))
    .slice(0, 5)
    .map(t => ({
      subject: t.subjectRaw || t.subject,
      object: t.objectRaw || t.object,
      asOf: t.asOf,
      projectId: t.projectId,
    }));
  return {
    tenantId,
    triples: scoped.length,
    projects: projects.size,
    predicates,
    topSubjects: Object.entries(subjects)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([subject, count]) => ({ subject, count })),
    topDecisions,
  };
}

// Tokenize: lowercase, split on non-alphanumeric, drop English stopwords
// and tokens shorter than 3 chars. Good enough for sketch-quality recall.
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'are',
  'was', 'were', 'will', 'have', 'has', 'had', 'but', 'not', 'you',
  'your', 'our', 'their', 'they', 'them', 'his', 'her', 'its', 'who',
  'what', 'when', 'where', 'how', 'why', 'than', 'then', 'too', 'too',
  'plan', 'project', 'about',
]);
function tokenize(s) {
  const out = new Set();
  for (const raw of String(s || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (raw.length < 3) continue;
    if (STOPWORDS.has(raw)) continue;
    out.add(raw);
  }
  return out;
}
function intersectionSize(a, b) {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
}

module.exports = { findRelated, recall, summarize, tokenize };
