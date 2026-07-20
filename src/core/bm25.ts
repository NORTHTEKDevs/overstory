export interface Bm25Doc {
  id: string;
  text: string;
}

export interface Bm25Hit {
  id: string;
  score: number;
}

const K1 = 1.4;
const B = 0.75;

export const tokenize = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^a-z0-9_]+/u)
    .filter((t) => t.length >= 2);

/** Small classic BM25 — no dependencies, deterministic, fast enough for tens of
 * thousands of claims. */
export class Bm25Index {
  private docs = new Map<string, { tokens: string[]; length: number }>();
  private df = new Map<string, number>();
  private totalLength = 0;

  constructor(docs: Bm25Doc[] = []) {
    for (const d of docs) this.add(d);
  }

  add(doc: Bm25Doc): void {
    const tokens = tokenize(doc.text);
    this.docs.set(doc.id, { tokens, length: tokens.length });
    this.totalLength += tokens.length;
    for (const t of new Set(tokens)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
  }

  search(query: string, k = 10): Bm25Hit[] {
    const qTokens = [...new Set(tokenize(query))];
    if (qTokens.length === 0 || this.docs.size === 0) return [];
    const n = this.docs.size;
    const avgLen = this.totalLength / n;
    const hits: Bm25Hit[] = [];
    for (const [id, { tokens, length }] of this.docs) {
      let score = 0;
      for (const q of qTokens) {
        const df = this.df.get(q);
        if (!df) continue;
        const tf = tokens.filter((t) => t === q).length;
        if (tf === 0) continue;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (length / (avgLen || 1)))));
      }
      if (score > 0) hits.push({ id, score });
    }
    return hits.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, k);
  }
}
