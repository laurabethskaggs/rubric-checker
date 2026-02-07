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
  totalScore: number;
  wrongVerdicts: number;
}

const FIELD_NAMES = ['score', 'verdict', 'justification'];

function detectField(key: string): RubricFieldKey {
  const part = key.split('_').pop() ?? '';
  if (FIELD_NAMES.includes(part)) return part as RubricFieldKey;
  return 'other';
}

export function parseRubric(raw: string): ParseResult {
  const map = new Map<string, RubricEntry>();
  const lines = raw.split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const match = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (!match) return;

    const key = match[1].trim();
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      value = value.slice(1, -1);
    }

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
  const wrongVerdicts = entries.filter((e) => (e.verdict ?? '').toUpperCase().includes('WRONG')).length;

  return { entries, totalScore, wrongVerdicts };
}
