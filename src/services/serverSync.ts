import { AttemptRecord } from '../types/exam';

function isJsonResponse(res: Response): boolean {
  const ct = res.headers.get('content-type') ?? '';
  return ct.includes('application/json');
}

// Phát hiện sớm môi trường static (GitHub Pages không có Express /api/*)
let serverBackendAvailable: boolean | null =
  typeof window !== 'undefined' && window.location.hostname.endsWith('.github.io')
    ? false
    : null;
let availabilityProbePromise: Promise<boolean> | null = null;

async function isServerBackendAvailable(): Promise<boolean> {
  if (serverBackendAvailable !== null) {
    return serverBackendAvailable;
  }
  if (!availabilityProbePromise) {
    availabilityProbePromise = (async () => {
      try {
        const res = await fetch('/api/health', { method: 'GET', cache: 'no-store' });
        serverBackendAvailable = res.ok && isJsonResponse(res);
      } catch {
        serverBackendAvailable = false;
      }
      return serverBackendAvailable;
    })();
  }
  return availabilityProbePromise;
}

export async function fetchServerAttempts(): Promise<AttemptRecord[] | null> {
  if (!(await isServerBackendAvailable())) {
    return null;
  }
  try {
    const res = await fetch('/api/attempts', {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok || !isJsonResponse(res)) {
      serverBackendAvailable = false;
      return null;
    }
    const data = (await res.json()) as { attempts?: AttemptRecord[] };
    return Array.isArray(data.attempts) ? data.attempts : [];
  } catch {
    return null;
  }
}

export async function pushAttemptsToServer(
  attempts: readonly AttemptRecord[]
): Promise<AttemptRecord[] | null> {
  if (!(await isServerBackendAvailable())) {
    return null;
  }
  const realAttempts = attempts.filter((a) => !a.isSeedData);
  if (realAttempts.length === 0) {
    return fetchServerAttempts();
  }
  try {
    const res = await fetch('/api/attempts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attempts: realAttempts }),
    });
    if (!res.ok || !isJsonResponse(res)) {
      serverBackendAvailable = false;
      return null;
    }
    const data = (await res.json()) as { attempts?: AttemptRecord[] };
    return Array.isArray(data.attempts) ? data.attempts : [];
  } catch {
    return null;
  }
}

export function subscribeServerAttemptStream(onUpdate: () => void): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }

  let closed = false;
  let source: EventSource | null = null;
  const handler = () => {
    onUpdate();
  };

  void (async () => {
    if (closed || !(await isServerBackendAvailable())) {
      return;
    }
    source = new EventSource('/api/attempts/stream');
    source.addEventListener('attempts-updated', handler);
    source.addEventListener('connected', handler);
  })();

  return () => {
    closed = true;
    if (source) {
      source.removeEventListener('attempts-updated', handler);
      source.removeEventListener('connected', handler);
      source.close();
      source = null;
    }
  };
}
