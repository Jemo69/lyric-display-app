import { parentPort } from 'worker_threads';

// Dedicated thread for HTTP fetches — main never freezes while "optimization" or HTTP is in flight.
parentPort.on('message', async ({ id, url, method, headers, body }) => {
  try {
    const hasBody = body != null && String(body).trim() !== '' && method !== 'GET' && method !== 'HEAD';
    const res = await fetch(url, {
      method: method || 'GET',
      headers: headers || {},
      body: hasBody ? String(body) : undefined,
    });
    const text = await res.text().catch(() => '');
    let result = null;
    try { result = text ? JSON.parse(text) : null; } catch { result = text; }
    parentPort.postMessage({ id, success: res.ok, status: res.status, statusText: res.statusText, result });
  } catch (err) {
    parentPort.postMessage({ id, success: false, error: err?.message || String(err) });
  }
});
