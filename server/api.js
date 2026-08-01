import express from 'express';
import { processRawTextToLines } from '../shared/lyricsParsing.js';
import {
  getStatus,
  getSetlistFiles,
  addSetlistFilesInternal,
  removeSetlistFileInternal,
  clearSetlistInternal,
  reorderSetlistInternal,
  loadSetlistFileInternal,
  nextLineInternal,
  prevLineInternal,
  gotoLineInternal,
  loadRawTextInternal,
  toggleOutputInternal,
  getCurrentLyricsState,
  setSelectedLineInternal,
} from './events.js';
import {
  search as bibleSearch,
  resolveReference as bibleResolve,
  getActiveBible,
  getAllBibles,
  getActiveBibleId,
} from './bibleManager.js';
import createServerLogger from './logger.js';

const log = createServerLogger('API');

const router = express.Router();

router.get('/status', (req, res) => {
  try {
    const status = getStatus();
    const lyricsState = getCurrentLyricsState();
    res.json({
      success: true,
      status: {
        ...status,
        currentLyrics: lyricsState.lyrics?.slice(0, 10) || [],
        lyricsFileName: lyricsState.fileName,
        sectionsCount: lyricsState.sections?.length || 0,
      },
      timestamp: Date.now(),
    });
  } catch (e) {
    log.error('Status error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/setlist', (req, res) => {
  try {
    const files = getSetlistFiles();
    const mapped = files.map(f => ({
      id: f.id,
      name: f.displayName || f.originalName,
      displayName: f.displayName,
      originalName: f.originalName,
      fileType: f.fileType,
      addedAt: f.addedAt,
      lastModified: f.lastModified,
      metadata: f.metadata || null,
    }));
    res.json({ success: true, count: mapped.length, setlist: mapped });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/setlist/load', (req, res) => {
  try {
    const { fileId } = req.body || {};
    if (!fileId) return res.status(400).json({ success: false, error: 'fileId required' });
    const result = loadSetlistFileInternal(fileId);
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/setlist/add', (req, res) => {
  try {
    const { name, content, originalName, fileType, metadata } = req.body || {};
    const fileName = name || originalName;
    if (!fileName || !content) return res.status(400).json({ success: false, error: 'name and content required' });
    if (typeof content !== 'string' || content.length > 5 * 1024 * 1024) return res.status(400).json({ success: false, error: 'Invalid content size' });
    const filesArray = [{
      name: fileName,
      content,
      fileType,
      metadata: metadata || null,
      lastModified: Date.now(),
    }];
    const added = addSetlistFilesInternal(filesArray, { clientType: 'api', deviceId: req.user?.deviceId || 'api', sessionId: req.user?.sessionId || 'api' });
    res.json({ success: true, added: added.map(f => ({ id: f.id, displayName: f.displayName, originalName: f.originalName, fileType: f.fileType })), totalCount: getSetlistFiles().length });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/setlist/reorder', (req, res) => {
  try {
    const { orderedIds } = req.body || {};
    if (!Array.isArray(orderedIds)) return res.status(400).json({ success: false, error: 'orderedIds array required' });
    const reordered = reorderSetlistInternal(orderedIds);
    res.json({ success: true, orderedIds, totalCount: reordered.length });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.delete('/setlist/:fileId', (req, res) => {
  try {
    const { fileId } = req.params;
    if (!fileId) return res.status(400).json({ success: false, error: 'fileId required' });
    const removed = removeSetlistFileInternal(fileId);
    if (!removed) return res.status(404).json({ success: false, error: 'File not found' });
    res.json({ success: true, removedId: fileId, totalCount: getSetlistFiles().length });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/setlist/clear', (req, res) => {
  try {
    clearSetlistInternal();
    res.json({ success: true, message: 'Setlist cleared', totalCount: 0 });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

router.post('/lyrics/next', (req, res) => {
  try {
    const newIndex = nextLineInternal();
    res.json({ success: true, selectedLine: newIndex });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/lyrics/prev', (req, res) => {
  try {
    const newIndex = prevLineInternal();
    res.json({ success: true, selectedLine: newIndex });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/lyrics/goto', (req, res) => {
  try {
    const { lineIndex } = req.body || {};
    if (lineIndex === undefined || lineIndex === null) return res.status(400).json({ success: false, error: 'lineIndex required' });
    const idx = Number(lineIndex);
    if (!Number.isInteger(idx)) return res.status(400).json({ success: false, error: 'lineIndex must be integer' });
    const newIndex = gotoLineInternal(idx);
    res.json({ success: true, selectedLine: newIndex });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/lyrics/load-text', (req, res) => {
  try {
    const { title, content } = req.body || {};
    if (!content) return res.status(400).json({ success: false, error: 'content required' });
    const result = loadRawTextInternal(title || 'Untitled', content);
    res.json({ success: true, ...result, title: result.fileName });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/output/toggle', (req, res) => {
  try {
    const { on } = req.body || {};
    let newState;
    if (typeof on === 'boolean') {
      newState = toggleOutputInternal(on);
    } else if (on === undefined || on === null) {
      newState = toggleOutputInternal();
    } else {
      const boolVal = String(on).toLowerCase() === 'true' || on === 1 || on === '1';
      newState = toggleOutputInternal(boolVal);
    }
    res.json({ success: true, isOutputOn: newState });
  } catch (e) {
    res.status(400).json({ success: false, error: e.message });
  }
});

router.post('/bible/reference', (req, res) => {
  try {
    const { reference, text, slides, bible } = req.body || {};
    if (!reference) return res.status(400).json({ success: false, error: 'reference required' });

    let verseText = text || '';
    let slideTexts = [];
    let resolvedBibleName = bible || '';

    const activeBible = getActiveBible();
    if (activeBible) {
      const results = bibleResolve(reference, 20);
      if (results && results.length > 0) {
        const first = results[0];
        resolvedBibleName = first.bibleName || activeBible.name || resolvedBibleName;
        if (first.text) {
          verseText = first.text;
          slideTexts = results.map(r => r.text).filter(Boolean);
          if (first.reference) {
            // Use resolved reference if available
          }
        }
        if (first.verses && first.verses.length > 0) {
          // multi-verse
        }
      }
    }

    if (slides && Array.isArray(slides) && slides.length > 0) {
      slideTexts = slides;
    } else if (!slideTexts.length) {
      if (verseText) {
        slideTexts = [verseText];
      } else {
        slideTexts = [reference];
      }
    }

    const lines = slideTexts.map(slide => `${slide}\n\n${reference}`.trim());
    const combinedContent = lines.join('\n\n');

    const result = loadRawTextInternal(reference, combinedContent);

    res.json({
      success: true,
      reference,
      resolved: verseText ? true : false,
      bible: resolvedBibleName || getActiveBible()?.name || null,
      activeBibleId: getActiveBibleId(),
      slides: slideTexts.length,
      fileName: result.fileName,
      linesCount: result.linesCount,
    });
  } catch (e) {
    log.error('Bible reference error:', e.message);
    res.status(400).json({ success: false, error: e.message });
  }
});

router.get('/bible/search', (req, res) => {
  try {
    const q = req.query.q || req.query.query;
    const limit = parseInt(req.query.limit || '20', 10);
    const searchAll = String(req.query.searchAll || '').toLowerCase() === 'true';

    if (!q) return res.status(400).json({ success: false, error: 'q query param required' });

    const activeBible = getActiveBible();
    if (!activeBible) {
      return res.json({
        success: true,
        query: q,
        results: [],
        count: 0,
        message: 'No bible loaded on server. Place bible files in uploads/bibles directory.',
        bibles: getAllBibles(),
      });
    }

    const results = bibleSearch(q, Number.isNaN(limit) ? 20 : Math.min(Math.max(limit, 1), 100), searchAll);

    res.json({
      success: true,
      query: q,
      count: results.length,
      results,
      activeBible: { id: activeBible.id, name: activeBible.name },
      bibles: getAllBibles(),
    });
  } catch (e) {
    log.error('Bible search error:', e.message);
    res.status(500).json({ success: false, error: e.message });
  }
});

router.get('/bible/list', (req, res) => {
  try {
    res.json({
      success: true,
      bibles: getAllBibles(),
      activeBibleId: getActiveBibleId(),
      activeBible: getActiveBible() ? { id: getActiveBible().id, name: getActiveBible().name, bookCount: getActiveBible().books?.length } : null,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
