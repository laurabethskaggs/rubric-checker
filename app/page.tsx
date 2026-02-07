'use client';

import { useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { parseRubric, type RubricEntry } from './lib/parseRubric';

interface GrammarIssue {
  message: string;
  shortMessage?: string;
  replacements: string[];
  context: string;
  offset: number;
  length: number;
  ruleId?: string;
}

interface GrammarResult {
  id: string;
  issues: GrammarIssue[];
}

const SAMPLE = `Q2_A_1_score: 0 
Q2_A_1_verdict: "WRONG_ANSWER"
Q2_A_1_justification: Although the descriptions are mostly correct, no figure was drawn, and no Python script was provided.

Q2_A_2_score: 0
Q2_A_2_verdict: "WRONG_ANSWER"
Q2_A_2_justification: The smiles description is correct for structure C, but no drawing is provided. 

Q2_B_1_score: 0
Q2_B_1_verdict: "WRONG_ANSWER"
Q2_B_1_justification: The table shown in the solution made 0/6 correct answers. 

Q2_B_2_score: 0
Q2_B_2_verdict: "WRONG_ANSWER"
Q2_B_2_justification: The SMILES failed to render, and no Python drawing was provided. 

Q2_C_1_score: 12 
Q2_C_1_verdict: "WRONG_ANSWER"
Q2_C_1_justification: All molecular formulas provided are correct. However, the three structures in the rectangles have not accounted for steroreochemistry, and the detailed structure of "Cyclohexenyl-Core" was not described.

Q2_D_1_score: 0
Q2_D_1_verdict: "WRONG_ANSWER"
Q2_D_1_justification: The Python drawing failed to run. Hence, the drawing is absent.

Q2_D_2_score: 0
Q2_D_2_verdict: "WRONG_ANSWER"
Q2_D_2_justification: The Python drawing failed to run. Hence, the drawing is absent.

Q2_D_3_score: 0
Q2_D_3_verdict: "WRONG_ANSWER"
Q2_D_3_justification: The Python drawing failed to run. Hence, the drawing is absent.

Q2_score: 12
Q2_verdict: "WRONG_ANSWER"
Q2_justification: The majority of the question involves drawing. No Python drawing is provided except 2.4. However, the drawing in 2.4 cannot be run in python returned a sequencing error.`;

function formatScore(value?: number) {
  if (value === undefined || value === null) return '—';
  const frac = Math.abs(value - Math.trunc(value));
  if (frac >= 0.95) return Math.round(value).toString();
  const fixed = value.toFixed(2);
  return fixed.replace(/\.?0+$/, '');
}

export default function Page() {
  const [rawRubric, setRawRubric] = useState<string>(SAMPLE);
  const [modelResponse, setModelResponse] = useState<string>('');
  const [grammarResults, setGrammarResults] = useState<Record<string, GrammarIssue[]>>({});
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo(() => parseRubric(rawRubric), [rawRubric]);

  const justificationItems = useMemo(
    () => parsed.entries.filter((e) => e.justification).map((e) => ({ id: e.id, text: e.justification as string })),
    [parsed.entries]
  );

  async function runGrammarCheck() {
    if (!justificationItems.length) {
      setError('No justifications were found to check.');
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await fetch('/api/grammar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: justificationItems })
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg);
      }

      const data: { results: GrammarResult[] } = await res.json();
      const mapped: Record<string, GrammarIssue[]> = {};
      data.results.forEach((item) => {
        mapped[item.id] = item.issues;
      });
      setGrammarResults(mapped);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Grammar check failed.';
      setError(message);
    } finally {
      setChecking(false);
    }
  }

  const totalIssues = Object.values(grammarResults).reduce((sum, arr) => sum + arr.length, 0);

  const formattingAlerts = [
    parsed.invalidVerdicts.length ? `${parsed.invalidVerdicts.length} invalid verdict format(s)` : null,
    parsed.missingJustifications.length ? `${parsed.missingJustifications.length} missing justification(s)` : null,
    parsed.totalMismatches.length ? `${parsed.totalMismatches.length} total mismatch(es)` : null,
    parsed.casingIssues.length ? `${parsed.casingIssues.length} casing issue(s)` : null
  ].filter(Boolean);

  const totalErrors =
    parsed.invalidVerdicts.length +
    parsed.missingJustifications.length +
    parsed.totalMismatches.length +
    parsed.casingIssues.length;

  return (
    <div className="container">
      <header>
        <h1>Rubric Checker</h1>
        <p>Paste rubric text, double-check scoring, and spot grammar issues in one sweep.</p>
      </header>

      <div className="section-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Rubric Text</h3>
          <textarea
            className="textarea"
            value={rawRubric}
            onChange={(e) => setRawRubric(e.target.value)}
            spellCheck={false}
          />
          <div className="controls">
            <button onClick={() => setRawRubric('')}>Clear</button>
            <button className="button-secondary" onClick={() => setRawRubric(SAMPLE)}>Load Sample</button>
            <button onClick={runGrammarCheck} disabled={checking}>
              {checking ? 'Checking…' : `Check grammar (${justificationItems.length})`}
            </button>
          </div>
          {error ? (
            <p style={{ color: 'var(--error)', marginTop: 10 }}>{error}</p>
          ) : (
            <p style={{ color: 'var(--muted)', marginTop: 10 }}>
              Parsed {parsed.entries.length} items · {justificationItems.length} with justifications
            </p>
          )}
        </div>

        <div className="card card-strong">
          <h3 style={{ marginTop: 0 }}>At a glance</h3>
          <div className="stats">
            <div className="stat">
              <h3>Expected Total</h3>
              <strong>{formatScore(parsed.expectedTotal)}</strong>
            </div>
            <div className="stat">
              <h3>Items</h3>
              <strong>{parsed.entries.length}</strong>
            </div>
            <div className="stat">
              <h3>Wrong Verdicts</h3>
              <strong>{parsed.wrongVerdicts}</strong>
            </div>
            <div className="stat">
              <h3>Grammar Flags</h3>
              <strong>{totalIssues}</strong>
            </div>
            <div className="stat">
              <h3>Total Errors</h3>
              <strong>{totalErrors}</strong>
            </div>
          </div>
          <p className="footer" style={{ marginTop: 16 }}>
            Tip: Keep LanguageTool credentials in <code className="code-chip">.env.local</code> when deploying to Vercel.
          </p>
        </div>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Enter the model response here for a markdown preview</h3>
        <textarea
          className="textarea"
          style={{ minHeight: 180, minWidth: '50%' }}
          value={modelResponse}
          onChange={(e) => setModelResponse(e.target.value)}
          placeholder="Type or paste the model's response here..."
        />
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Scores &amp; verdicts</h3>
        {formattingAlerts.length > 0 && (
          <div className="card" style={{ margin: '12px 0', background: 'rgba(244, 63, 94, 0.08)', borderColor: 'rgba(244, 63, 94, 0.4)' }}>
            <strong>Formatting issues found:</strong>
              <ul className="issues">
                {parsed.invalidVerdicts.length > 0 && (
                <li>
                  Invalid verdict format: {parsed.invalidVerdicts.length} item(s). Allowed: "ACCEPTED" or "WRONG_ANSWER".
                </li>
              )}
              {parsed.missingJustifications.length > 0 && (
                <li>Missing justification: {parsed.missingJustifications.length} item(s).</li>
              )}
              {parsed.totalMismatches.length > 0 && (
                <li>
                  Total mismatches:
                  <ul className="issues">
                    {parsed.totalMismatches.map((m) => (
                      <li key={`total-${m.id}`}>
                        {m.id} reported {formatScore(m.reported)}, expected {formatScore(m.expected)}
                      </li>
                    ))}
                  </ul>
                </li>
              )}
              {parsed.casingIssues.length > 0 && (
                <li>
                  Casing issues:
                  <ul className="issues">
                    {parsed.casingIssues.map((c, idx) => (
                      <li key={`casing-${idx}`}>
                        {c.id}: ensure {c.type === 'SMILES' ? 'SMILES' : 'Python'} is uppercase/correct casing.
                      </li>
                    ))}
                  </ul>
                </li>
              )}
              </ul>
            </div>
          )}
        <table className="table">
          <thead>
            <tr>
              <th style={{ width: '18%' }}>Item</th>
              <th style={{ width: '10%' }}>Score</th>
              <th style={{ width: '16%' }}>Verdict</th>
              <th>Justification</th>
            </tr>
          </thead>
          <tbody>
            {parsed.entries.map((entry) => {
              const verdict = (entry.verdict ?? '').toUpperCase();
              const issues = grammarResults[entry.id];
              const badgeLabel = issues
                ? issues.length === 0
                  ? 'Clean'
                  : `${issues.length} issue${issues.length > 1 ? 's' : ''}`
                : 'Not checked';
              const badgeClass = issues
                ? issues.length === 0
                  ? 'badge-ok'
                  : 'badge-warn'
                : 'badge';

              return (
                <tr key={entry.id}>
                  <td><strong>{entry.id}</strong></td>
                  <td>{formatScore(entry.score)}</td>
                  <td>
                    <span
                      className={
                        verdict.includes('WRONG')
                          ? 'badge badge-error'
                          : verdict.includes('CORRECT')
                            ? 'badge badge-ok'
                            : 'badge'
                      }
                    >
                      {entry.verdict ?? '—'}
                    </span>
                  </td>
                  <td>
                    {entry.justification ? (
                      <div>
                        <div className="justification">{entry.justification}</div>
                        <div style={{ marginTop: 6 }}>
                          <span className={`badge ${badgeClass}`}>{badgeLabel}</span>
                        </div>
                        {issues && issues.length > 0 && (
                          <ul className="issues">
                            {issues.map((issue, idx) => (
                              <li key={`${entry.id}-issue-${idx}`}>
                                {issue.shortMessage ?? issue.message}
                                {issue.replacements.length ? (
                                  <span style={{ marginLeft: 6, color: 'var(--muted)' }}>
                                    → {issue.replacements.slice(0, 3).join(', ')}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ) : (
                      <span className="justification" style={{ color: 'var(--muted)' }}>
                        No justification provided.
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 18 }}>
        <h3 style={{ marginTop: 0 }}>Markdown Preview</h3>
        <p className="justification">Live rendering of the model response you entered above.</p>
        <div style={{ marginTop: 12, padding: '12px 14px', borderRadius: 12, border: '1px solid var(--surface-strong)', background: 'rgba(255,255,255,0.02)' }}>
          <ReactMarkdown
            className="markdown"
            remarkPlugins={[remarkMath]}
            rehypePlugins={[rehypeKatex]}
          >
            {modelResponse || '_Nothing to preview_'}
          </ReactMarkdown>
        </div>
      </div>

      <p className="footer">
        All processing happens client-side except grammar checks, which use the LanguageTool API via a serverless route.
      </p>
    </div>
  );
}
