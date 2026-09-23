const OBS_WS_OP = {
  Hello: 0,
  Identify: 1,
  Identified: 2,
  Reidentify: 3,
  Event: 5,
  Request: 6,
  RequestResponse: 7,
};

export const OBS_WS_DEFAULT_PORT = 4455;
export const OBS_WS_RPC_VERSION = 1;

let requestSequence = 0;

export const buildRequestId = (prefix = 'ld') => {
  requestSequence += 1;
  return `${prefix}_${Date.now().toString(36)}_${requestSequence}`;
};

export function buildRequest(requestType, requestData = {}, requestId = buildRequestId()) {
  return {
    op: OBS_WS_OP.Request,
    d: { requestId, requestType, requestData },
  };
}

export function buildGetVersionRequest(requestId) {
  return buildRequest('GetVersion', {}, requestId);
}

export function buildGetSceneListRequest(requestId) {
  return buildRequest('GetSceneList', {}, requestId);
}

export function buildCreateBrowserSourceInput({
  sceneName,
  inputName,
  url,
  width = 1920,
  height = 1080,
  enabled = true,
}) {
  if (!sceneName || !inputName || !url) {
    throw new Error('sceneName, inputName, and url are required to create a browser source');
  }
  return buildRequest('CreateInput', {
    sceneName,
    inputName,
    inputKind: 'browser_source',
    inputSettings: {
      url,
      width,
      height,
      shutdown: true,
      restart_when_active: false,
    },
    sceneItemEnabled: enabled,
  });
}

export function buildGetSceneItemId({ sceneName, sourceName }) {
  if (!sceneName || !sourceName) {
    throw new Error('sceneName and sourceName are required to resolve a scene item id');
  }
  return buildRequest('GetSceneItemId', { sceneName, sourceName });
}

export function buildSetSceneItemTransform({
  sceneName,
  sceneItemId,
  x = 0,
  y = 0,
  scaleX = 1,
  scaleY = 1,
}) {
  if (!sceneName || sceneItemId == null) {
    throw new Error('sceneName and sceneItemId are required to position a scene item');
  }
  return buildRequest('SetSceneItemTransform', {
    sceneName,
    sceneItemId,
    sceneItemTransform: {
      positionX: x,
      positionY: y,
      scaleX,
      scaleY,
    },
  });
}

export function buildLyricSourceUrl({ origin, slug = 'output1' }) {
  const base = String(origin || '').replace(/\/+$/, '');
  const safeSlug = String(slug || 'output1').replace(/[^a-zA-Z0-9_-]/g, '') || 'output1';
  return `${base}/#/${safeSlug}`;
}

export function lyricDockSetupSteps({ sceneName, inputName, url, width, height, x, y }) {
  return {
    create: buildCreateBrowserSourceInput({ sceneName, inputName, url, width, height }),
    resolveId: buildGetSceneItemId({ sceneName, sourceName: inputName }),
    position: { x: x ?? 0, y: y ?? 0 },
  };
}

export async function ensureLyricBrowserSource(send, { sceneName, inputName, url, width = 1920, height = 1080, x = 0, y = 0 }) {
  const steps = lyricDockSetupSteps({ sceneName, inputName, url, width, height, x, y });
  const created = await send(steps.create);
  throwIfObsError(created, 'CreateInput');

  const resolved = await send(steps.resolveId);
  throwIfObsError(resolved, 'GetSceneItemId');
  const sceneItemId = resolved?.responseData?.sceneItemId;
  if (sceneItemId == null) {
    throw new Error('OBS did not return a sceneItemId for the lyric browser source');
  }

  const positioned = await send(buildSetSceneItemTransform({ sceneName, sceneItemId, x: steps.position.x, y: steps.position.y }));
  throwIfObsError(positioned, 'SetSceneItemTransform');
  return { sceneItemId, createResponse: created, positionResponse: positioned };
}

function throwIfObsError(response, requestType) {
  const status = response?.requestStatus;
  if (status && status.result === false) {
    throw new Error(`OBS ${requestType} failed: ${status.comment || status.code}`);
  }
}

const textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

async function sha256Base64(text) {
  const subtle = typeof globalThis !== 'undefined' ? globalThis.crypto?.subtle : null;
  if (!subtle || !textEncoder) {
    throw new Error('WebCrypto subtle is unavailable; cannot compute OBS-WebSocket auth hash in this environment');
  }
  const digest = await subtle.digest('SHA-256', textEncoder.encode(text));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  if (typeof btoa === 'function') return btoa(binary);
  const { Buffer } = await import('node:buffer').catch(() => ({}));
  if (Buffer) return Buffer.from(binary, 'binary').toString('base64');
  throw new Error('No base64 encoder available for OBS-WebSocket auth hash');
}

export async function computeObsAuthHash({ password, salt, challenge }) {
  if (!password || !salt || !challenge) {
    throw new Error('password, salt, and challenge are required for OBS-WebSocket authentication');
  }
  const secret = await sha256Base64(`${password}${salt}`);
  return sha256Base64(`${secret}${challenge}`);
}

export function createObsWebSocketClient({ url = `ws://127.0.0.1:${OBS_WS_DEFAULT_PORT}`, password = '', onEvent = null } = {}) {
  const WebSocketImpl = typeof WebSocket !== 'undefined' ? WebSocket : null;
  if (!WebSocketImpl) {
    throw new Error('Global WebSocket is unavailable; pass a browser or OBS environment');
  }

  const pending = new Map();
  const listeners = { open: [], close: [], error: [], identified: [] };
  let socket = null;
  let helloPayload = null;

  const on = (event, fn) => {
    if (listeners[event]) listeners[event].push(fn);
  };

  const emit = (event, payload) => {
    for (const fn of listeners[event] || []) {
      try { fn(payload); } catch { /* listener errors must not break the socket loop */ }
    }
  };

  const sendRaw = (message) => {
    if (!socket || socket.readyState !== 1) {
      throw new Error('OBS-WebSocket is not connected');
    }
    socket.send(JSON.stringify(message));
  };

  const send = (request) => new Promise((resolve, reject) => {
    try {
      const requestId = request?.d?.requestId || buildRequestId();
      const envelope = request?.op === OBS_WS_OP.Request
        ? request
        : { op: OBS_WS_OP.Request, d: { ...request?.d, requestId } };
      pending.set(envelope.d.requestId, { resolve, reject });
      sendRaw(envelope);
    } catch (error) {
      reject(error);
    }
  });

  const handleMessage = async (raw) => {
    let message;
    try {
      message = JSON.parse(typeof raw === 'string' ? raw : String(raw));
    } catch {
      return;
    }
    if (message.op === OBS_WS_OP.Hello) {
      helloPayload = message.d;
      const identify = { op: OBS_WS_OP.Identify, d: { rpcVersion: OBS_WS_RPC_VERSION } };
      if (helloPayload?.authentication && password) {
        identify.d.authentication = await computeObsAuthHash({
          password,
          salt: helloPayload.authentication.salt,
          challenge: helloPayload.authentication.challenge,
        });
      }
      sendRaw(identify);
      return;
    }
    if (message.op === OBS_WS_OP.Identified) {
      emit('identified', message.d);
      return;
    }
    if (message.op === OBS_WS_OP.Event) {
      if (typeof onEvent === 'function') {
        try { onEvent(message.d); } catch { /* ignore handler errors */ }
      }
      return;
    }
    if (message.op === OBS_WS_OP.RequestResponse) {
      const entry = pending.get(message.d?.requestId);
      if (entry) {
        pending.delete(message.d.requestId);
        entry.resolve(message.d);
      }
    }
  };

  const connect = () => new Promise((resolve, reject) => {
    try {
      socket = new WebSocketImpl(url);
    } catch (error) {
      reject(error);
      return;
    }
    const fail = (error) => {
      emit('error', error);
      reject(error instanceof Error ? error : new Error('OBS-WebSocket connection failed'));
    };
    socket.addEventListener('open', () => emit('open'));
    socket.addEventListener('message', (event) => { handleMessage(event.data); });
    socket.addEventListener('error', fail);
    socket.addEventListener('close', (event) => {
      for (const [, entry] of pending) entry.reject(new Error('OBS-WebSocket closed before responding'));
      pending.clear();
      emit('close', event);
    });
    const onIdentified = () => resolve();
    on('identified', onIdentified);
    setTimeout(() => reject(new Error('OBS-WebSocket identify timed out')), 10000);
  });

  const disconnect = () => {
    try { socket?.close(); } catch { /* already closed */ }
    socket = null;
  };

  return { on, send, connect, disconnect, ensureLyricBrowserSource: (opts) => ensureLyricBrowserSource(send, opts) };
}
