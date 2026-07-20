import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { AskResult } from '../query/ask.js';

export interface ThreadTurn {
  question: string;
  result: AskResult;
  at: string;
}

export interface Thread {
  id: string;
  title: string;
  createdAt: string;
  turns: ThreadTurn[];
}

const threadsPath = (root: string): string => join(root, '.overstory', 'threads.json');

export class ThreadStore {
  private threads: Thread[] = [];
  private loaded = false;
  private chain = Promise.resolve();

  constructor(private root: string) {}

  private async loadOnce(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = JSON.parse(await readFile(threadsPath(this.root), 'utf8')) as { threads?: Thread[] };
      if (Array.isArray(raw.threads)) this.threads = raw.threads;
    } catch {
      this.threads = [];
    }
  }

  private persist(): void {
    const snapshot = JSON.stringify({ threads: this.threads });
    this.chain = this.chain
      .then(async () => {
        const path = threadsPath(this.root);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(`${path}.tmp`, snapshot, 'utf8');
        await rename(`${path}.tmp`, path);
      })
      .catch(() => {});
  }

  async list(): Promise<Array<{ id: string; title: string; createdAt: string; turns: number }>> {
    await this.loadOnce();
    return [...this.threads]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((t) => ({ id: t.id, title: t.title, createdAt: t.createdAt, turns: t.turns.length }));
  }

  async get(id: string): Promise<Thread | null> {
    await this.loadOnce();
    return this.threads.find((t) => t.id === id) ?? null;
  }

  async create(title: string): Promise<Thread> {
    await this.loadOnce();
    const thread: Thread = { id: randomUUID(), title: title.slice(0, 120), createdAt: new Date().toISOString(), turns: [] };
    this.threads.push(thread);
    this.persist();
    return thread;
  }

  async addTurn(id: string, turn: ThreadTurn): Promise<void> {
    await this.loadOnce();
    const thread = this.threads.find((t) => t.id === id);
    if (!thread) return;
    thread.turns.push(turn);
    this.persist();
  }

  async remove(id: string): Promise<boolean> {
    await this.loadOnce();
    const before = this.threads.length;
    this.threads = this.threads.filter((t) => t.id !== id);
    this.persist();
    return this.threads.length < before;
  }
}
