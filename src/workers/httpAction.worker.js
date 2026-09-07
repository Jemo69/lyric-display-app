// Separate thread for HTTP — never blocks the UI thread (renderer).
// Mirrors fetch but runs off the main thread. Main process (Electron) still bypasses CORS via IPC.
self.onmessage = async (e) => {
  const { id, url, method, headers, body } = e.data || {};
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
    self.postMessage({ id, success: res.ok, status: res.status, statusText: res.statusText, result, text });
  } catch (err) {
    self.postMessage({ id, success: false, error: err?.message || String(err) });
  }
};
