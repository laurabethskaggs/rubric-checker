import { NextResponse } from 'next/server';

interface GrammarRequestItem {
  id: string;
  text: string;
}

interface LanguageToolMatch {
  message: string;
  shortMessage?: string;
  replacements?: { value: string }[];
  context?: { text: string };
  offset?: number;
  length?: number;
  rule?: { id?: string };
}

const DEFAULT_API_URL = 'https://api.languagetool.org/v2/check';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const items: GrammarRequestItem[] = Array.isArray(body?.items) ? body.items : [];

    if (!items.length) {
      return NextResponse.json({ error: 'items array is required' }, { status: 400 });
    }

    // Always use the public HTTP endpoint; no API key required/accepted here.
    const apiUrl = DEFAULT_API_URL;

    const results = await Promise.all(
      items.map(async (item) => {
        const params = new URLSearchParams({
          text: item.text,
          language: 'en-US',
          level: 'picky'
        });

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          body: params,
          credentials: 'omit'
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(`LanguageTool error (${response.status}): ${message}`);
        }

        const data = (await response.json()) as { matches?: LanguageToolMatch[] };
        const issues = (data.matches || []).map((match) => ({
          message: match.message,
          shortMessage: match.shortMessage,
          replacements: (match.replacements || []).map((r) => r.value),
          context: match.context?.text ?? '',
          offset: match.offset ?? 0,
          length: match.length ?? 0,
          ruleId: match.rule?.id
        }));

        return { id: item.id, issues };
      })
    );

    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
