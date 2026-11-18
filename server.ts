import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Request, Response } from 'express';
import type { AttemptRecord } from './src/types/exam.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT =
  process.env.NODE_ENV === 'production' ? Number(process.env.PORT || 3000) : 3000;
const DATA_DIR = path.join(__dirname, '.data');
const DATA_FILE = path.join(DATA_DIR, 'attempts.json');

const attemptsStore = new Map<string, AttemptRecord>();
const sseClients = new Set<Response>();

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadStoreFromDisk(): void {
  try {
    ensureDataDir();
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        if (isValidAttemptPayload(item)) {
          if (!item.isSeedData) {
            attemptsStore.set(item.id, item);
          }
        }
      }
    }
  } catch (err) {
    console.error('Failed to load attempts store from disk:', err);
  }
}

function saveStoreToDisk(): void {
  try {
    ensureDataDir();
    const list = getSortedAttempts();
    const tmpFile = `${DATA_FILE}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(list, null, 2), 'utf-8');
    fs.renameSync(tmpFile, DATA_FILE);
  } catch (err) {
    console.error('Failed to persist attempts store to disk:', err);
  }
}

function getSortedAttempts(): AttemptRecord[] {
  return Array.from(attemptsStore.values()).sort(
    (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime()
  );
}

function isValidAttemptPayload(item: unknown): item is AttemptRecord {
  if (!item || typeof item !== 'object') return false;
  const r = item as Partial<AttemptRecord>;
  return (
    typeof r.id === 'string' &&
    r.id.length > 0 &&
    typeof r.sbd === 'string' &&
    /^[0-9]{8}$/.test(r.sbd) &&
    typeof r.school === 'string' &&
    typeof r.totalScore === 'number' &&
    typeof r.submittedAt === 'string' &&
    Boolean(r.exam) &&
    Array.isArray(r.lessonBreakdown)
  );
}

function upsertAttempts(incoming: AttemptRecord[]): { added: number; updated: number } {
  let added = 0;
  let updated = 0;
  for (const item of incoming) {
    if (!isValidAttemptPayload(item) || item.isSeedData) continue;
    const existing = attemptsStore.get(item.id);
    if (!existing) {
      attemptsStore.set(item.id, { ...item, isSeedData: false });
      added += 1;
    } else {
      const nextSynced = Boolean(existing.syncedToDrive || item.syncedToDrive);
      if (nextSynced !== Boolean(existing.syncedToDrive)) {
        attemptsStore.set(item.id, {
          ...existing,
          syncedToDrive: nextSynced,
          isSeedData: false,
        });
        updated += 1;
      }
    }
  }
  if (added > 0 || updated > 0) {
    saveStoreToDisk();
    broadcastUpdate();
  }
  return { added, updated };
}

function broadcastUpdate(): void {
  const payload = JSON.stringify({
    updatedAt: new Date().toISOString(),
    count: attemptsStore.size,
  });
  for (const client of sseClients) {
    try {
      client.write(`event: attempts-updated\ndata: ${payload}\n\n`);
    } catch {
      sseClients.delete(client);
    }
  }
}

async function startServer(): Promise<void> {
  loadStoreFromDisk();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      attemptsCount: attemptsStore.size,
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/attempts', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({
      attempts: getSortedAttempts(),
      updatedAt: new Date().toISOString(),
    });
  });

  app.post('/api/attempts', (req: Request, res: Response) => {
    const body = req.body as { attempt?: unknown; attempts?: unknown[] } | undefined;
    const list: AttemptRecord[] = [];
    if (body?.attempt && isValidAttemptPayload(body.attempt)) {
      list.push(body.attempt);
    }
    if (Array.isArray(body?.attempts)) {
      for (const item of body.attempts) {
        if (isValidAttemptPayload(item)) {
          list.push(item);
        }
      }
    }

    const { added, updated } = upsertAttempts(list);
    res.json({
      ok: true,
      added,
      updated,
      attempts: getSortedAttempts(),
    });
  });

  app.get('/api/attempts/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    res.write(
      `event: connected\ndata: ${JSON.stringify({ count: attemptsStore.size })}\n\n`
    );

    sseClients.add(res);
    const heartbeat = setInterval(() => {
      try {
        res.write(': keepalive\n\n');
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(res);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(res);
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
