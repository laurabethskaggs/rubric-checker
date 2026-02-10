export type RubricFieldKey = 'score' | 'verdict' | 'justification' | 'other';

export interface RubricEntry {
  id: string;
  score?: number;
  verdict?: string;
  justification?: string;
  raw: Record<string, string>;
}

export interface ParseResult {
  entries: RubricEntry[];
  totalScore: number; // reported grand totals included; kept for backward compatibility
  expectedTotal: number; // sum of subpart scores (ids containing an underscore)
  wrongVerdicts: number;
  invalidVerdicts: RubricEntry[];
  missingJustifications: RubricEntry[];
  totalMismatches: { id: string; reported: number; expected: number }[];
  casingIssues: { id: string; type: 'SMILES' | 'PYTHON'; snippet: string }[];
  missingComponents: { id: string; missing: ('score' | 'verdict' | 'justification')[] }[];
  duplicateKeys: string[];
  skippedIndices: { group: string; missing: number[] }[];
  zeroScoreAccepted: RubricEntry[];
  verdictConsistency: { id: string; message: string }[];
  extraQuoteVerdicts: { id: string; raw: string }[];
}

const FIELD_NAMES = ['score', 'verdict', 'justification'];
const ALLOWED_VERDICTS = new Set(['ACCEPTED', 'WRONG_ANSWER']);

function detectField(key: string): RubricFieldKey {
  const part = key.split('_').pop() ?? '';
  if (FIELD_NAMES.includes(part)) return part as RubricFieldKey;
  return 'other';
}

export function parseRubric(raw: string): ParseResult {
  const map = new Map<string, RubricEntry>();
  const duplicateKeys: string[] = [];
  const rawValues = new Map<string, string>();
  const lines = raw.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!match) return;

    const key = match[1].trim();
    const originalValue = match[2].trim();
    let value = originalValue;
    if (value.startsWith('"') && value.endsWith('"') && value.length >= 2) {
      value = value.slice(1, -1);
    }

    if (rawValues.has(key)) {
      duplicateKeys.push(key);
    }
    rawValues.set(key, originalValue);

    const field = detectField(key);
    const baseId = key.split('_').slice(0, -1).join('_') || key;
    const record = map.get(baseId) ?? { id: baseId, raw: {} };

    if (field === 'score') {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) record.score = numeric;
    } else if (field === 'verdict') {
      record.verdict = value;
    } else if (field === 'justification') {
      record.justification = value;
    }

    record.raw[key] = value;
    map.set(baseId, record);
  });

  const entries = Array.from(map.values()).sort((a, b) => a.id.localeCompare(b.id));
  const totalScore = entries.reduce((sum, entry) => sum + (entry.score ?? 0), 0);
  const expectedTotal = entries
    .filter((e) => e.id.includes('_'))
    .reduce((sum, entry) => sum + (entry.score ?? 0), 0);
  const wrongVerdicts = entries.filter((e) => (e.verdict ?? '').toUpperCase().includes('WRONG')).length;

const invalidVerdicts = entries.filter(
  (e) => e.verdict && !ALLOWED_VERDICTS.has(e.verdict.trim().toUpperCase())
);

  const missingJustifications = entries.filter((e) => !(e.justification && e.justification.trim().length));

  const missingComponents: { id: string; missing: ('score' | 'verdict' | 'justification')[] }[] = [];
  entries.forEach((e) => {
    const missing: ('score' | 'verdict' | 'justification')[] = [];
    if (e.score === undefined) missing.push('score');
    if (!e.verdict) missing.push('verdict');
    if (!e.justification) missing.push('justification');
    if (missing.length) missingComponents.push({ id: e.id, missing });
  });

  const casingIssues: { id: string; type: 'SMILES' | 'PYTHON'; snippet: string }[] = [];
  entries.forEach((e) => {
    if (!e.justification) return;
    const text = e.justification;
    if (/smiles/i.test(text) && !text.includes('SMILES')) {
      casingIssues.push({ id: e.id, type: 'SMILES', snippet: text.slice(0, 120) });
    }
    if (/python/i.test(text) && !text.includes('Python')) {
      casingIssues.push({ id: e.id, type: 'PYTHON', snippet: text.slice(0, 120) });
    }
  });

  // Treat entries without underscores (e.g., "Q2") as totals; they should equal the sum of their subparts.
  const totalMismatches: { id: string; reported: number; expected: number }[] = [];
  const totals = entries.filter((e) => !e.id.includes('_') && typeof e.score === 'number');
  totals.forEach((total) => {
    const expected = entries
      .filter((e) => e.id.startsWith(`${total.id}_`) && typeof e.score === 'number')
      .reduce((sum, e) => sum + (e.score ?? 0), 0);

    if (typeof total.score === 'number' && total.score !== expected) {
      totalMismatches.push({ id: total.id, reported: total.score, expected });
    }
  });

  const zeroScoreAccepted = entries.filter(
    (e) => e.score === 0 && (e.verdict ?? '').toUpperCase() === 'ACCEPTED'
  );

  // Verdict consistency: final totals without underscore treated as summary verdicts.
  const verdictConsistency: { id: string; message: string }[] = [];
  const topLevelVerdicts = entries.filter((e) => !e.id.includes('_') && e.verdict);
  const anyWrong = entries.some((e) => (e.verdict ?? '').toUpperCase() === 'WRONG_ANSWER');
  const allAccepted =
    entries.filter((e) => e.id.includes('_')).length > 0 &&
    entries
      .filter((e) => e.id.includes('_'))
      .every((e) => (e.verdict ?? '').toUpperCase() === 'ACCEPTED');

  topLevelVerdicts.forEach((e) => {
    const verdict = (e.verdict ?? '').toUpperCase();
    if (anyWrong && verdict === 'ACCEPTED') {
      verdictConsistency.push({ id: e.id, message: 'Contains WRONG_ANSWER sub-items but final verdict is ACCEPTED.' });
    }
    if (allAccepted && verdict.includes('WRONG')) {
      verdictConsistency.push({ id: e.id, message: 'All sub-items ACCEPTED but final verdict is WRONG.' });
    }
  });

  // Detect skipped indices per group prefix (e.g., Q1_A_)
  const groupMap = new Map<string, number[]>();
  entries.forEach((e) => {
    const match = e.id.match(/^(.*_)(\d+)$/);
    if (!match) return;
    const group = match[1];
    const idx = Number(match[2]);
    if (!Number.isNaN(idx)) {
      const arr = groupMap.get(group) ?? [];
      arr.push(idx);
      groupMap.set(group, arr);
    }
  });

  const skippedIndices: { group: string; missing: number[] }[] = [];
  groupMap.forEach((indices, group) => {
    const sorted = Array.from(new Set(indices)).sort((a, b) => a - b);
    if (sorted.length === 0) return;
    const max = sorted[sorted.length - 1];
    const missing: number[] = [];
    for (let i = sorted[0]; i <= max; i++) {
      if (!sorted.includes(i)) missing.push(i);
    }
    if (missing.length) skippedIndices.push({ group, missing });
  });

  // Extra quotes in verdicts (e.g., \"\"ACCEPTED\"\")
  const extraQuoteVerdicts: { id: string; raw: string }[] = [];
  rawValues.forEach((rawValue, key) => {
    if (!key.endsWith('_verdict')) return;
    if (rawValue.startsWith('""') || rawValue.endsWith('""')) {
      const baseId = key.split('_').slice(0, -1).join('_') || key;
      extraQuoteVerdicts.push({ id: baseId, raw: rawValue });
    }
  });

  return {
    entries,
    totalScore,
    expectedTotal,
    wrongVerdicts,
    invalidVerdicts,
    missingJustifications,
    totalMismatches,
    casingIssues,
    missingComponents,
    duplicateKeys,
    skippedIndices,
    zeroScoreAccepted,
    verdictConsistency,
    extraQuoteVerdicts
  };
}
