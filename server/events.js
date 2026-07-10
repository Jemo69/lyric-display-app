import { processRawTextToLines, parseLrcContent, deriveSectionsFromProcessedLines } from '../shared/lyricsParsing.js';
import createServerLogger from './logger.js';

const log = createServerLogger('Events');

let currentLyrics = [];
let currentLyricsTimestamps = [];
let currentLyricsFileName = '';
let currentSelectedLine = null;
let currentLyricsSections = [];
let currentLineToSection = {};
let currentOutput1Settings = {};
let currentOutput2Settings = {};
let currentStageSettings = {};
let currentCustomOutputs = [];
let currentCustomOutputSettings = {};
let currentCustomOutputEnabled = {};
let currentIsOutputOn = false;
let currentOutput1Enabled = true;
let currentOutput2Enabled = true;
let currentStageEnabled = true;
let setlistFiles = [];
let connectedClients = new Map();
let outputInstances = {
  output1: new Map(),
  output2: new Map(),
  stage: new Map()
};
let currentStageTimerState = { running: false, paused: false, endTime: null, remaining: null };
let currentStageMessages = [];
let pendingDrafts = new Map();
let lastStateFingerprintBySocket = new Map();

let ioInstance = null;

function computeStateFingerprint() {
  const parts = [
    currentLyrics.length,
    currentLyricsTimestamps.length,
    currentSelectedLine,
    currentLyricsFileName,
    currentIsOutputOn,
    currentOutput1Enabled,
    currentOutput2Enabled,
    currentStageEnabled,
    setlistFiles.length,
    setlistFiles.map(f => f.id).join(','),
    JSON.stringify(currentOutput1Settings),
    JSON.stringify(currentOutput2Settings),
    JSON.stringify(currentStageSettings),
    JSON.stringify(currentCustomOutputs),
    JSON.stringify(currentCustomOutputSettings),
    JSON.stringify(currentCustomOutputEnabled),
    currentLyricsSections.length,
  ];
  return parts.join('|');
}

export function getIoInstance() {
  return ioInstance;
}

export function getStatus() {
  return {
    lyricsFile: currentLyricsFileName || '',
    selectedLine: currentSelectedLine,
    isOutputOn: currentIsOutputOn,
    output1Enabled: currentOutput1Enabled,
    output2Enabled: currentOutput2Enabled,
    stageEnabled: currentStageEnabled,
    setlistCount: setlistFiles.length,
    lyricsCount: currentLyrics.length,
    activeLyrics: currentLyrics.slice(0, 5),
    totalLyrics: currentLyrics.length,
    fileName: currentLyricsFileName,
    timestamp: Date.now(),
    hasLyrics: currentLyrics.length > 0,
  };
}

export function getSetlistFiles() {
  return [...setlistFiles];
}

export function getCurrentLyricsState() {
  return {
    lyrics: currentLyrics,
    timestamps: currentLyricsTimestamps,
    fileName: currentLyricsFileName,
    selectedLine: currentSelectedLine,
    sections: currentLyricsSections,
    lineToSection: currentLineToSection,
    isOutputOn: currentIsOutputOn,
  };
}

function normalizeSetlistName(value = '') {
  return String(value).trim().replace(/\.(txt|lrc)$/i, '').toLowerCase();
}

export function addSetlistFilesInternal(files, addedBy = { clientType: 'api', deviceId: 'api', sessionId: 'api' }) {
  if (!Array.isArray(files)) throw new Error('files must be an array');
  const totalAfterAdd = setlistFiles.length + files.length;
  if (totalAfterAdd > 50) throw new Error(`Cannot add ${files.length} files. Maximum 50 files allowed.`);

  const newFiles = files.map((file, index) => {
    if (!file.name || !file.content) throw new Error(`File ${index + 1} is missing name or content`);
    const lowerName = file.name.toLowerCase();
    const isLrc = lowerName.endsWith('.lrc');
    const displayName = file.name.replace(/\.(txt|lrc)$/i, '');
    const normalizedIncoming = normalizeSetlistName(file.name);
    const alreadyExists = setlistFiles.some((existing) => {
      const candidate = existing?.displayName ?? existing?.originalName ?? '';
      return normalizeSetlistName(candidate) === normalizedIncoming;
    });
    if (alreadyExists) throw new Error(`File "${displayName}" already exists in setlist`);
    return {
      id: `setlist_${Date.now()}_${index}_${Math.random().toString(36).slice(2,7)}`,
      displayName,
      originalName: file.name,
      content: file.content,
      lastModified: file.lastModified || Date.now(),
      addedAt: Date.now(),
      fileType: isLrc ? 'lrc' : 'txt',
      metadata: file.metadata || null,
      addedBy,
    };
  });

  setlistFiles.push(...newFiles);
  log.info(`Added ${newFiles.length} files to setlist via API. Total: ${setlistFiles.length}`);
  if (ioInstance) ioInstance.emit('setlistUpdate', setlistFiles);
  return newFiles;
}

export function removeSetlistFileInternal(fileId) {
  const initialCount = setlistFiles.length;
  setlistFiles = setlistFiles.filter(file => file.id !== fileId);
  const removed = setlistFiles.length < initialCount;
  if (removed && ioInstance) ioInstance.emit('setlistUpdate', setlistFiles);
  return removed;
}

export function clearSetlistInternal() {
  setlistFiles = [];
  if (ioInstance) ioInstance.emit('setlistUpdate', setlistFiles);
  log.info('Setlist cleared via API');
}

export function reorderSetlistInternal(orderedIds) {
  if (!Array.isArray(orderedIds)) throw new Error('Invalid reorder payload');
  if (orderedIds.length !== setlistFiles.length) throw new Error('Reorder payload does not match setlist size');
  const idToFile = new Map(setlistFiles.map((file) => [file.id, file]));
  const seen = new Set();
  const reordered = [];
  for (const id of orderedIds) {
    if (seen.has(id)) throw new Error('Duplicate entries in reorder payload');
    seen.add(id);
    const file = idToFile.get(id);
    if (!file) throw new Error('Unknown setlist entry in reorder payload');
    reordered.push(file);
  }
  if (reordered.length !== setlistFiles.length) throw new Error('Reorder payload incomplete');
  setlistFiles = reordered;
  if (ioInstance) ioInstance.emit('setlistUpdate', setlistFiles);
  return setlistFiles;
}

export function loadSetlistFileInternal(fileId) {
  const file = setlistFiles.find(f => f.id === fileId);
  if (!file) throw new Error('File not found in setlist');
  let processedLines;
  let timestamps = [];
  let sanitizedRawContent = file.content;
  let sections = [];
  let lineToSection = {};
  const isLrc = (file.fileType === 'lrc') ||
    (typeof file.originalName === 'string' && file.originalName.toLowerCase().endsWith('.lrc'));
  if (isLrc) {
    const parsed = parseLrcContent(file.content);
    processedLines = parsed.processedLines;
    timestamps = parsed.timestamps || [];
    sanitizedRawContent = parsed.rawText;
    sections = parsed.sections || [];
    lineToSection = parsed.lineToSection || {};
  } else {
    processedLines = processRawTextToLines(file.content);
    timestamps = [];
    const derived = deriveSectionsFromProcessedLines(processedLines);
    sections = derived.sections || [];
    lineToSection = derived.lineToSection || {};
  }
  const cleanDisplayName = (file.displayName || file.originalName || '').replace(/\.(txt|lrc)$/i, '') || file.displayName;
  currentLyrics = processedLines;
  currentLyricsTimestamps = timestamps;
  currentSelectedLine = null;
  currentLyricsFileName = cleanDisplayName;
  currentLyricsSections = sections;
  currentLineToSection = lineToSection;
  log.info(`Loaded "${cleanDisplayName}" from setlist via API (${processedLines.length} lines)`);
  if (ioInstance) {
    ioInstance.emit('lyricsLoad', processedLines);
    ioInstance.emit('lyricsTimestampsUpdate', timestamps);
    ioInstance.emit('lyricsSectionsUpdate', { sections, lineToSection });
    ioInstance.emit('setlistLoadSuccess', {
      fileId,
      fileName: cleanDisplayName,
      originalName: file.originalName,
      fileType: file.fileType || (isLrc ? 'lrc' : 'txt'),
      linesCount: processedLines.length,
      rawContent: sanitizedRawContent,
      loadedBy: 'api',
      metadata: {
        ...(file.metadata || {}),
        sections,
        lineToSection,
      }
    });
  }
  return {
    fileId,
    fileName: cleanDisplayName,
    linesCount: processedLines.length,
    rawContent: sanitizedRawContent,
  };
}

export function setSelectedLineInternal(index) {
  if (index !== null && (!Number.isInteger(index) || index < 0)) throw new Error('Invalid line index');
  if (index !== null && currentLyrics.length > 0 && index >= currentLyrics.length) throw new Error('Line index out of bounds');
  currentSelectedLine = index;
  if (ioInstance) ioInstance.emit('lineUpdate', { index });
  return currentSelectedLine;
}

export function nextLineInternal() {
  if (currentLyrics.length === 0) throw new Error('No lyrics loaded');
  if (currentSelectedLine === null || currentSelectedLine === undefined) {
    currentSelectedLine = 0;
  } else {
    currentSelectedLine = Math.min(currentSelectedLine + 1, currentLyrics.length - 1);
  }
  if (ioInstance) ioInstance.emit('lineUpdate', { index: currentSelectedLine });
  return currentSelectedLine;
}

export function prevLineInternal() {
  if (currentLyrics.length === 0) throw new Error('No lyrics loaded');
  if (currentSelectedLine === null || currentSelectedLine === undefined) {
    currentSelectedLine = 0;
  } else {
    currentSelectedLine = Math.max(currentSelectedLine - 1, 0);
  }
  if (ioInstance) ioInstance.emit('lineUpdate', { index: currentSelectedLine });
  return currentSelectedLine;
}

export function gotoLineInternal(lineIndex) {
  if (!Number.isInteger(lineIndex) || lineIndex < 0) throw new Error('Invalid line index');
  if (currentLyrics.length > 0 && lineIndex >= currentLyrics.length) throw new Error('Line index out of bounds');
  currentSelectedLine = lineIndex;
  if (ioInstance) ioInstance.emit('lineUpdate', { index: currentSelectedLine });
  return currentSelectedLine;
}

export function loadRawTextInternal(title, content) {
  if (!content || typeof content !== 'string') throw new Error('Content is required');
  const processedLines = processRawTextToLines(content);
  const derived = deriveSectionsFromProcessedLines(processedLines);
  currentLyrics = processedLines;
  currentLyricsTimestamps = [];
  currentLyricsSections = derived.sections || [];
  currentLineToSection = derived.lineToSection || {};
  currentSelectedLine = null;
  currentLyricsFileName = title || 'Untitled';
  log.info(`Loaded raw text via API: "${currentLyricsFileName}" (${processedLines.length} lines)`);
  if (ioInstance) {
    ioInstance.emit('lyricsLoad', currentLyrics);
    ioInstance.emit('lyricsTimestampsUpdate', currentLyricsTimestamps);
    ioInstance.emit('lyricsSectionsUpdate', { sections: currentLyricsSections, lineToSection: currentLineToSection });
    ioInstance.emit('fileNameUpdate', currentLyricsFileName);
    ioInstance.emit('setlistLoadSuccess', {
      fileId: null,
      fileName: currentLyricsFileName,
      originalName: `${currentLyricsFileName}.txt`,
      fileType: 'txt',
      linesCount: currentLyrics.length,
      rawContent: content,
      loadedBy: 'api',
    });
  }
  return {
    fileName: currentLyricsFileName,
    linesCount: processedLines.length,
    lines: processedLines,
  };
}

export function toggleOutputInternal(on) {
  if (typeof on === 'boolean') {
    currentIsOutputOn = on;
  } else {
    currentIsOutputOn = !currentIsOutputOn;
  }
  if (ioInstance) ioInstance.emit('outputToggle', currentIsOutputOn);
  return currentIsOutputOn;
}

export default function registerSocketEvents(io, { hasPermission }) {
  ioInstance = io;
  if (typeof global !== 'undefined') {
    global.ioInstance = io;
  }
  io.on('connection', (socket) => {
    const { clientType, deviceId, sessionId } = socket.userData;
    log.info(`Authenticated user connected: ${clientType} (${deviceId}) - Socket: ${socket.id}`);

    connectedClients.set(socket.id, {
      type: clientType,
      deviceId,
      sessionId,
      socket,
      permissions: socket.userData.permissions,
      connectedAt: socket.userData.connectedAt
    });

    socket.on('clientConnect', ({ type }) => {
      if (type !== clientType) {
        log.warn(`Client ${socket.id} claimed type ${type} but authenticated as ${clientType}`);
        socket.emit('authError', 'Client type mismatch with authentication');
        return;
      }

      log.info(`Client ${socket.id} confirmed as: ${type}`);
      socket.emit('currentState', buildCurrentState(connectedClients.get(socket.id)));
    });

    socket.on('requestCurrentState', () => {
      if (!hasPermission(socket, 'lyrics:read')) {
        socket.emit('permissionError', 'Insufficient permissions to read current state');
        return;
      }

      log.info('State requested by authenticated client:', socket.id);
      const clientInfo = connectedClients.get(socket.id);
      socket.emit('currentState', buildCurrentState(clientInfo));
      log.info(`Current state sent to: ${socket.id} (${currentLyrics.length} lyrics, ${setlistFiles.length} setlist items)`);
    });

    socket.on('requestSetlist', () => {
      if (!hasPermission(socket, 'setlist:read')) {
        socket.emit('permissionError', 'Insufficient permissions to access setlist');
        return;
      }

      socket.emit('setlistUpdate', setlistFiles);
      log.info('Setlist sent to authenticated client:', socket.id, `(${setlistFiles.length} items)`);
    });

    socket.on('setlistAdd', (files) => {
      if (!hasPermission(socket, 'setlist:write')) {
        socket.emit('permissionError', 'Insufficient permissions to modify setlist');
        return;
      }

      try {
        const added = addSetlistFilesInternal(files, { clientType, deviceId, sessionId });
        socket.emit('setlistAddSuccess', {
          addedCount: added.length,
          totalCount: setlistFiles.length
        });
      } catch (error) {
        log.error('setlistAdd error:', error.message);
        socket.emit('setlistError', error.message);
      }
    });

    socket.on('setlistRemove', (fileId) => {
      if (!hasPermission(socket, 'setlist:write')) {
        socket.emit('permissionError', 'Insufficient permissions to modify setlist');
        return;
      }

      try {
        const fileToRemove = setlistFiles.find(file => file.id === fileId);

        if (!hasPermission(socket, 'admin:full') &&
          fileToRemove?.addedBy?.sessionId !== sessionId) {
          socket.emit('permissionError', 'You can only remove files you added');
          return;
        }

        const removed = removeSetlistFileInternal(fileId);
        if (removed) {
          log.info(`${clientType} client removed file ${fileId} from setlist. Remaining: ${setlistFiles.length}`);
          socket.emit('setlistRemoveSuccess', fileId);
        } else {
          socket.emit('setlistError', 'File not found in setlist');
        }
      } catch (error) {
        log.error('setlistRemove error:', error.message);
        socket.emit('setlistError', error.message);
      }
    });

    socket.on('setlistLoad', (fileId) => {
      if (!hasPermission(socket, 'setlist:read')) {
        socket.emit('permissionError', 'Insufficient permissions to read setlist');
        return;
      }

      try {
        loadSetlistFileInternal(fileId);
      } catch (error) {
        log.error('setlistLoad error:', error.message);
        socket.emit('setlistError', error.message);
      }
    });

    socket.on('setlistClear', () => {
      if (!hasPermission(socket, 'setlist:delete')) {
        socket.emit('permissionError', 'Insufficient permissions to clear setlist');
        return;
      }

      clearSetlistInternal();
      log.info(`Setlist cleared by ${clientType} client`);
      socket.emit('setlistClearSuccess');
    });

    socket.on('setlistReorder', (payload) => {
      if (!hasPermission(socket, 'setlist:write')) {
        socket.emit('permissionError', 'Insufficient permissions to modify setlist ordering');
        return;
      }

      try {
        const orderedIds = Array.isArray(payload) ? payload : payload?.orderedIds;
        reorderSetlistInternal(orderedIds);
        log.info(`${clientType} client reordered setlist (${setlistFiles.length} items)`);
        socket.emit('setlistReorderSuccess', {
          orderedIds,
          totalCount: setlistFiles.length,
        });
      } catch (e) {
        socket.emit('setlistError', e.message);
      }
    });

    socket.on('lineUpdate', ({ index }) => {
      if (!hasPermission(socket, 'output:control')) {
        socket.emit('permissionError', 'Insufficient permissions to control output');
        return;
      }

      try {
        setSelectedLineInternal(index);
        log.info(`Line updated to ${index} by ${clientType} client`);
      } catch (e) {
        socket.emit('permissionError', e.message);
      }
    });

    socket.on('outputToggle', (state) => {
      if (!hasPermission(socket, 'output:control')) {
        socket.emit('permissionError', 'Insufficient permissions to control output');
        return;
      }

      currentIsOutputOn = state;
      log.info(`Output toggled to ${state} by ${clientType} client`);
      io.emit('outputToggle', state);
    });

    socket.on('individualOutputToggle', ({ output, enabled }) => {
      if (!hasPermission(socket, 'output:control')) {
        socket.emit('permissionError', 'Insufficient permissions to control individual outputs');
        return;
      }

      if (output === 'output1') {
        currentOutput1Enabled = enabled;
      } else if (output === 'output2') {
        currentOutput2Enabled = enabled;
      } else if (output === 'stage') {
        currentStageEnabled = enabled;
      } else if (output && output.startsWith('custom_')) {
        currentCustomOutputEnabled = { ...currentCustomOutputEnabled, [output]: enabled };
      }

      log.info(`Individual output ${output} toggled to ${enabled} by ${clientType} client`);
      io.emit('individualOutputToggle', { output, enabled });
    });

    socket.on('lyricsLoad', (lyrics) => {
      if (!hasPermission(socket, 'lyrics:write')) {
        socket.emit('permissionError', 'Insufficient permissions to load lyrics');
        return;
      }

      currentLyrics = lyrics;
      currentLyricsTimestamps = [];
      const derived = deriveSectionsFromProcessedLines(currentLyrics);
      currentLyricsSections = derived.sections || [];
      currentLineToSection = derived.lineToSection || {};
      currentSelectedLine = null;
      currentLyricsFileName = '';
      log.info(`Lyrics loaded by ${clientType} client:`, lyrics?.length, 'lines');
      io.emit('lyricsLoad', lyrics);
      io.emit('lyricsTimestampsUpdate', currentLyricsTimestamps);
      io.emit('lyricsSectionsUpdate', { sections: currentLyricsSections, lineToSection: currentLineToSection });
    });

    socket.on('lyricsTimestampsUpdate', (timestamps) => {
      if (!hasPermission(socket, 'lyrics:write')) {
        socket.emit('permissionError', 'Insufficient permissions to update timestamps');
        return;
      }

      currentLyricsTimestamps = timestamps || [];
      log.info(`Lyrics timestamps updated by ${clientType} client:`, timestamps?.length, 'timestamps');
      io.emit('lyricsTimestampsUpdate', timestamps);
    });

    socket.on('splitNormalGroup', (payload = {}) => {
      if (!hasPermission(socket, 'output:control')) {
        socket.emit('permissionError', 'Insufficient permissions to split groups');
        return;
      }

      const index = typeof payload === 'number' ? payload : payload?.index;
      if (!Number.isInteger(index) || index < 0 || index >= currentLyrics.length) {
        socket.emit('lyricsSplitError', 'Invalid group index');
        return;
      }

      const target = currentLyrics[index];
      if (!target || target.type !== 'normal-group') {
        socket.emit('lyricsSplitError', 'Selected line is not a normal group');
        return;
      }

      const newLyrics = [...currentLyrics];
      newLyrics.splice(index, 1, target.line1, target.line2);
      currentLyrics = newLyrics;
      currentLyricsTimestamps = [];
      const derived = deriveSectionsFromProcessedLines(currentLyrics);
      currentLyricsSections = derived.sections || [];
      currentLineToSection = derived.lineToSection || {};

      if (typeof currentSelectedLine === 'number') {
        if (currentSelectedLine > index) {
          currentSelectedLine += 1;
        }
      }

      log.info(`Normal group split at index ${index} by ${clientType} client (${deviceId})`);
      io.emit('lyricsLoad', currentLyrics);
      io.emit('lyricsTimestampsUpdate', currentLyricsTimestamps);
      io.emit('lyricsSectionsUpdate', { sections: currentLyricsSections, lineToSection: currentLineToSection });

      if (typeof currentSelectedLine === 'number') {
        io.emit('lineUpdate', { index: currentSelectedLine });
      }

      socket.emit('lyricsSplitSuccess', { index });
    });

    socket.on('styleUpdate', ({ output, settings }) => {
      if (!hasPermission(socket, 'settings:write')) {
        socket.emit('permissionError', 'Insufficient permissions to modify settings');
        return;
      }

      if (output === 'output1') {
        currentOutput1Settings = { ...currentOutput1Settings, ...settings };
      }
      if (output === 'output2') {
        currentOutput2Settings = { ...currentOutput2Settings, ...settings };
      }
      if (output === 'stage') {
        currentStageSettings = { ...currentStageSettings, ...settings };
      }
      if (output && output.startsWith('custom_')) {
        currentCustomOutputSettings = {
          ...currentCustomOutputSettings,
          [output]: {
            ...(currentCustomOutputSettings[output] || {}),
            ...settings,
          },
        };
      }
      log.info(`Style updated for ${output} by ${clientType} client`);
      io.emit('styleUpdate', { output, settings });
    });

    socket.on('outputRegistryUpdate', ({ customOutputs, customOutputSettings, customOutputEnabled } = {}) => {
      if (!hasPermission(socket, 'settings:write')) {
        socket.emit('permissionError', 'Insufficient permissions to update output registry');
        return;
      }
      if (Array.isArray(customOutputs)) {
        const prevIds = new Set(currentCustomOutputs.map((o) => o.id));
        const nextIds = new Set(customOutputs.map((o) => o.id));
        const deletedIds = [...prevIds].filter((id) => !nextIds.has(id));
        if (deletedIds.length > 0 && typeof global.deleteOutputMedia === 'function') {
          deletedIds.forEach((deletedId) => {
            global.deleteOutputMedia(deletedId).catch((err) => {
              log.warn(`Failed to cleanup media for deleted output ${deletedId}:`, err.message);
            });
          });
        }
        currentCustomOutputs = customOutputs;
      }
      if (customOutputSettings && typeof customOutputSettings === 'object') currentCustomOutputSettings = customOutputSettings;
      if (customOutputEnabled && typeof customOutputEnabled === 'object') currentCustomOutputEnabled = customOutputEnabled;
      io.emit('outputRegistryUpdate', {
        customOutputs: currentCustomOutputs,
        customOutputSettings: currentCustomOutputSettings,
        customOutputEnabled: currentCustomOutputEnabled,
      });
    });

    socket.on('stageTimerUpdate', (timerData) => {
      if (!hasPermission(socket, 'output:control')) {
        socket.emit('permissionError', 'Insufficient permissions to control stage timer');
        return;
      }

      currentStageTimerState = { ...timerData };
      log.info(`Stage timer updated by ${clientType} client:`, timerData);
      io.emit('stageTimerUpdate', timerData);
    });

    socket.on('stageMessagesUpdate', (messages) => {
      if (!hasPermission(socket, 'output:control')) {
        socket.emit('permissionError', 'Insufficient permissions to update stage messages');
        return;
      }

      currentStageMessages = Array.isArray(messages) ? [...messages] : [];
      log.info(`Stage messages updated by ${clientType} client: ${messages?.length || 0} messages`);
      io.emit('stageMessagesUpdate', messages);
    });

    socket.on('outputMetrics', ({ output, metrics }) => {
      if (!(clientType === 'output1' || clientType === 'output2')) {
        socket.emit('permissionError', 'Insufficient permissions to publish metrics');
        return;
      }
      if (!output || !metrics || (output !== 'output1' && output !== 'output2' && !output.startsWith('custom_'))) {
        return;
      }
      if (!outputInstances[output]) outputInstances[output] = new Map();

      const safe = {};
      if (Number.isFinite(metrics.adjustedFontSize) || metrics.adjustedFontSize === null) safe.adjustedFontSize = metrics.adjustedFontSize;
      if (typeof metrics.autosizerActive === 'boolean') safe.autosizerActive = metrics.autosizerActive;
      if (Number.isFinite(metrics.viewportWidth)) safe.viewportWidth = metrics.viewportWidth;
      if (Number.isFinite(metrics.viewportHeight)) safe.viewportHeight = metrics.viewportHeight;
      if (Number.isFinite(metrics.timestamp)) safe.timestamp = metrics.timestamp;

      outputInstances[output].set(socket.id, {
        ...safe,
        socketId: socket.id,
        lastUpdate: Date.now()
      });

      const allInstances = Array.from(outputInstances[output].values());

      const primaryInstance = allInstances.reduce((largest, current) => {
        if (!largest) return current;
        const largestArea = (largest.viewportWidth || 0) * (largest.viewportHeight || 0);
        const currentArea = (current.viewportWidth || 0) * (current.viewportHeight || 0);
        return currentArea > largestArea ? current : largest;
      }, null);

      io.emit('outputMetrics', {
        output,
        metrics: primaryInstance || safe,
        allInstances: allInstances,
        instanceCount: allInstances.length
      });
    });

    socket.on('fileNameUpdate', (fileName) => {
      if (!hasPermission(socket, 'lyrics:write')) {
        socket.emit('permissionError', 'Insufficient permissions to update filename');
        return;
      }

      currentLyricsFileName = fileName;
      log.info(`Filename updated to "${fileName}" by ${clientType} client`);
      io.emit('fileNameUpdate', fileName);
    });

    socket.on('lyricsDraftSubmit', ({ title, rawText, processedLines }) => {
      if (!hasPermission(socket, 'lyrics:draft')) {
        socket.emit('permissionError', 'Insufficient permissions to submit drafts');
        return;
      }

      log.info(`Lyrics draft submitted by ${clientType} client: "${title}" (${processedLines?.length || 0} lines)`);

      const desktopClients = Array.from(connectedClients.values()).filter(c => c.type === 'desktop');

      if (desktopClients.length === 0) {
        socket.emit('draftError', 'No desktop client available to approve draft');
        return;
      }

      const timestamp = Date.now();
      const draftId = `${sessionId}_${timestamp}`;

      const draftPayload = {
        draftId,
        title: title || 'Untitled',
        rawText: rawText || '',
        processedLines: processedLines || [],
        submittedBy: {
          clientType,
          deviceId,
          sessionId,
          timestamp
        }
      };

      pendingDrafts.set(draftId, {
        submitterSocketId: socket.id,
        submitterSessionId: sessionId,
        title: draftPayload.title,
        timestamp
      });

      setTimeout(() => {
        pendingDrafts.delete(draftId);
      }, 10 * 60 * 1000);

      desktopClients.forEach(client => {
        if (client.socket && client.socket.connected) {
          client.socket.emit('lyricsDraftReceived', draftPayload);
        }
      });

      socket.emit('draftSubmitted', { success: true, title });
    });

    socket.on('lyricsDraftApprove', ({ draftId, title, rawText, processedLines }) => {
      if (!hasPermission(socket, 'lyrics:write')) {
        socket.emit('permissionError', 'Insufficient permissions to approve drafts');
        return;
      }

      currentLyrics = processedLines || [];
      currentSelectedLine = null;
      currentLyricsFileName = title || '';
      const derived = deriveSectionsFromProcessedLines(currentLyrics);
      currentLyricsSections = derived.sections || [];
      currentLineToSection = derived.lineToSection || {};

      log.info(`Desktop client approved draft: "${title}" (${processedLines?.length || 0} lines)`);

      io.emit('lyricsLoad', currentLyrics);
      io.emit('fileNameUpdate', currentLyricsFileName);
      io.emit('lyricsSectionsUpdate', { sections: currentLyricsSections, lineToSection: currentLineToSection });
      if (rawText) {
        io.emit('setlistLoadSuccess', {
          fileId: null,
          fileName: title,
          originalName: null,
          fileType: 'draft',
          linesCount: currentLyrics.length,
          rawContent: rawText,
          loadedBy: 'desktop',
          origin: 'draft'
        });
      }

      if (draftId && pendingDrafts.has(draftId)) {
        const draftInfo = pendingDrafts.get(draftId);
        const submitterClients = Array.from(connectedClients.values())
          .filter(c => c.sessionId === draftInfo.submitterSessionId)
          .sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0));

        const targetClient = submitterClients[0];
        if (targetClient?.socket && targetClient.socket.connected) {
          targetClient.socket.emit('draftApproved', { success: true, title, draftId });
        }

        pendingDrafts.delete(draftId);
      } else {
        socket.emit('draftApproved', { success: true, title, draftId: draftId || null });
      }
    });

    socket.on('lyricsDraftReject', ({ draftId, title, reason }) => {
      if (!hasPermission(socket, 'lyrics:write')) {
        socket.emit('permissionError', 'Insufficient permissions to reject drafts');
        return;
      }

      log.info(`Desktop client rejected draft "${title}": ${reason || 'No reason provided'}`);

      if (draftId && pendingDrafts.has(draftId)) {
        const draftInfo = pendingDrafts.get(draftId);

        const submitterClients = Array.from(connectedClients.values())
          .filter(c => c.sessionId === draftInfo.submitterSessionId)
          .sort((a, b) => (b.connectedAt || 0) - (a.connectedAt || 0));

        const targetClient = submitterClients[0];
        if (targetClient?.socket && targetClient.socket.connected) {
          targetClient.socket.emit('draftRejected', {
            success: true,
            title: title || draftInfo.title,
            reason: reason || 'No reason provided',
            draftId
          });
        }

        pendingDrafts.delete(draftId);
        log.info(`Rejection notification sent to submitter (session: ${draftInfo.submitterSessionId})`);
      } else {
        log.warn(`Draft ${draftId} not found in pending drafts, cannot notify submitter`);
        socket.emit('draftRejected', { success: true, reason, draftId: draftId || null, title: title || null });
      }
    });

    socket.on('autoplayStateUpdate', ({ isActive, clientType: autoplayClientType }) => {
      if (!hasPermission(socket, 'output:control')) {
        socket.emit('permissionError', 'Insufficient permissions to update autoplay state');
        return;
      }

      log.info(`Autoplay state updated by ${clientType} client: ${isActive ? 'active' : 'inactive'}`);

      socket.broadcast.emit('autoplayStateUpdate', { isActive, clientType: autoplayClientType });
    });

    socket.on('heartbeat', () => {
      socket.emit('heartbeat_ack', { timestamp: Date.now() });
    });

    socket.on('disconnect', (reason) => {
      log.info(`Authenticated user disconnected: ${clientType} (${deviceId}) - Reason: ${reason}`);
      connectedClients.delete(socket.id);

      if (clientType === 'output1' || clientType === 'output2') {
        outputInstances[clientType]?.delete(socket.id);

        const remainingInstances = Array.from(outputInstances[clientType]?.values() || []);
        if (remainingInstances.length > 0) {
          const primaryInstance = remainingInstances.reduce((largest, current) => {
            if (!largest) return current;
            const largestArea = (largest.viewportWidth || 0) * (largest.viewportHeight || 0);
            const currentArea = (current.viewportWidth || 0) * (current.viewportHeight || 0);
            return currentArea > largestArea ? current : largest;
          }, null);

          io.emit('outputMetrics', {
            output: clientType,
            metrics: primaryInstance,
            allInstances: remainingInstances,
            instanceCount: remainingInstances.length
          });
        }
      }

      socket.broadcast.emit('clientDisconnected', {
        clientType,
        deviceId,
        disconnectedAt: Date.now(),
        reason
      });
    });

    setTimeout(() => {
      if (socket.connected) {
        const clientInfo = connectedClients.get(socket.id);
        socket.emit('currentState', buildCurrentState(clientInfo));
      }
    }, 100);

    const stateBroadcastInterval = setInterval(() => {
      if (socket.connected) {
        const fingerprint = computeStateFingerprint();
        const lastFingerprint = lastStateFingerprintBySocket.get(socket.id);

        if (fingerprint !== lastFingerprint) {
          lastStateFingerprintBySocket.set(socket.id, fingerprint);
          const clientInfo = connectedClients.get(socket.id);
          socket.emit('periodicStateSync', buildCurrentState(clientInfo));
        }
      }
    }, 60000);

    socket.on('disconnect', () => {
      clearInterval(stateBroadcastInterval);
      lastStateFingerprintBySocket.delete(socket.id);
    });
  });

  setInterval(() => {
    const stats = {
      totalConnections: connectedClients.size,
      clientTypes: {},
      timestamp: Date.now()
    };

    connectedClients.forEach(client => {
      stats.clientTypes[client.type] = (stats.clientTypes[client.type] || 0) + 1;
    });

    log.info('Connection statistics:', stats);
  }, 5 * 60 * 1000);
}

export function buildCurrentState(clientInfo) {
  const timestamp = Date.now();
  const state = {
    lyrics: currentLyrics,
    lyricsTimestamps: currentLyricsTimestamps,
    selectedLine: currentSelectedLine,
    lyricsSections: currentLyricsSections,
    lineToSection: currentLineToSection,
    output1Settings: currentOutput1Settings,
    output2Settings: currentOutput2Settings,
    stageSettings: currentStageSettings,
    customOutputs: currentCustomOutputs,
    customOutputSettings: currentCustomOutputSettings,
    customOutputEnabled: currentCustomOutputEnabled,
    isOutputOn: currentIsOutputOn,
    output1Enabled: currentOutput1Enabled,
    output2Enabled: currentOutput2Enabled,
    stageEnabled: currentStageEnabled,
    setlistFiles,
    lyricsFileName: currentLyricsFileName || '',
    isDesktopClient: clientInfo?.type === 'desktop',
    clientPermissions: clientInfo?.permissions || [],
    timestamp,
    syncTimestamp: timestamp,
  };

  if (clientInfo?.type === 'stage') {
    state.stageTimerState = currentStageTimerState;
    state.stageMessages = currentStageMessages;
  }

  return state;
}

export function getOutputRegistry() {
  return {
    customOutputs: currentCustomOutputs,
    customOutputSettings: currentCustomOutputSettings,
    customOutputEnabled: currentCustomOutputEnabled,
  };
}

export function getConnectedClients() {
  const clients = [];

  const sessionMap = new Map();

  connectedClients.forEach((client, socketId) => {
    const key = `${client.type}_${client.sessionId}`;

    if (!sessionMap.has(key)) {
      sessionMap.set(key, {
        id: socketId,
        type: client.type,
        sessionId: client.sessionId,
        deviceId: client.deviceId,
        connectedAt: client.connectedAt,
        permissions: client.permissions,
        socketCount: 1
      });
    } else {
      sessionMap.get(key).socketCount++;
    }
  });

  sessionMap.forEach((client) => {
    clients.push(client);
  });

  return clients;
}

if (typeof global !== 'undefined') {
  global.getConnectedClients = getConnectedClients;
  global.getOutputRegistry = getOutputRegistry;
}
