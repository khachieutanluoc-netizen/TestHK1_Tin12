import { AttemptRecord } from '../types/exam';

export async function fetchServerAttempts(): Promise<AttemptRecord[]> {
  const res = await fetch('/api/attempts', {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Không thể tải dữ liệu đồng bộ từ máy chủ (${res.status})`);
  }
  const data = (await res.json()) as { attempts?: AttemptRecord[] };
  return Array.isArray(data.attempts) ? data.attempts : [];
}

export async function pushAttemptsToServer(
  attempts: readonly AttemptRecord[]
): Promise<AttemptRecord[]> {
  const realAttempts = attempts.filter((a) => !a.isSeedData);
  if (realAttempts.length === 0) {
    return fetchServerAttempts();
  }
  const res = await fetch('/api/attempts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ attempts: realAttempts }),
  });
  if (!res.ok) {
    throw new Error(`Không thể đẩy dữ liệu đồng bộ lên máy chủ (${res.status})`);
  }
  const data = (await res.json()) as { attempts?: AttemptRecord[] };
  return Array.isArray(data.attempts) ? data.attempts : [];
}

export function subscribeServerAttemptStream(onUpdate: () => void): () => void {
  if (typeof window === 'undefined' || typeof EventSource === 'undefined') {
    return () => {};
  }
  const source = new EventSource('/api/attempts/stream');
  const handler = () => {
    onUpdate();
  };
  source.addEventListener('attempts-updated', handler);
  source.addEventListener('connected', handler);

  return () => {
    source.removeEventListener('attempts-updated', handler);
    source.removeEventListener('connected', handler);
    source.close();
  };
}
