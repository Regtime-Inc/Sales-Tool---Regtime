import type { ExtractedPdfData } from '../../types/pdf';

const DB_NAME = 'pdf-extraction-cache';
const STORE_NAME = 'extractions';
const DB_VERSION = 1;
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export async function computeFileHash(file: File): Promise<string> {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return `${file.name}_${file.size}_${file.lastModified}`;
  }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

interface CacheEntry {
  hash: string;
  data: ExtractedPdfData;
  storedAt: number;
}

export async function getCachedResult(hash: string): Promise<ExtractedPdfData | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(hash);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (!entry) {
          resolve(null);
          return;
        }

        if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
          removeCachedResult(hash).catch(() => {});
          resolve(null);
          return;
        }

        resolve({ ...entry.data, status: 'cached' });
      };

      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function setCachedResult(
  hash: string,
  data: ExtractedPdfData
): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const entry: CacheEntry = { hash, data, storedAt: Date.now() };
      const request = store.put(entry);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // Silently fail -- caching is best-effort
  }
}

export async function removeCachedResult(hash: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.delete(hash);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}

export async function clearAllCachedResults(): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } catch {
    // Silently fail
  }
}
