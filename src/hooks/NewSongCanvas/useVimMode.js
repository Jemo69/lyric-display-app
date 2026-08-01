import { useState, useCallback, useRef, useEffect } from 'react';
import { createLogger } from '../../utils/logger';

const log = createLogger('VimMode');

const NORMAL = 'normal';
const INSERT = 'insert';

export default function useVimMode({ textareaRef, content, setContent, vimEnabled, onUndo }) {
  const [vimState, setVimState] = useState(NORMAL);
  const pendingCountRef = useRef('');
  const yankedLineRef = useRef('');
  const lastActionRef = useRef('');
  const pendingGRef = useRef(false);

  const getLines = useCallback(() => content.split('\n'), [content]);

  const getLineIndex = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return 0;
    const pos = ta.selectionStart;
    const text = content.slice(0, pos);
    return text.split('\n').length - 1;
  }, [content, textareaRef]);

  const getLineStart = useCallback((lineIndex) => {
    const lines = getLines();
    let offset = 0;
    for (let i = 0; i < lineIndex && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    return offset;
  }, [getLines]);

  const getLineEnd = useCallback((lineIndex) => {
    const lines = getLines();
    if (lineIndex >= lines.length) return content.length;
    return getLineStart(lineIndex) + lines[lineIndex].length;
  }, [content, getLineStart, getLines]);

  const setCursor = useCallback((pos) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const safePos = Math.max(0, Math.min(pos, ta.value.length));
    ta.setSelectionRange(safePos, safePos);
    ta.focus({ preventScroll: true });
  }, [textareaRef]);

  const setCursorLineStart = useCallback((lineIndex) => {
    setCursor(getLineStart(lineIndex));
  }, [getLineStart, setCursor]);

  const moveVertically = useCallback((delta) => {
    const ta = textareaRef.current;
    if (!ta) return;
    const lines = getLines();
    const currentLine = getLineIndex();
    const currentCol = ta.selectionStart - getLineStart(currentLine);
    const targetLine = Math.max(0, Math.min(lines.length - 1, currentLine + delta));
    const targetLineLen = lines[targetLine].length;
    const targetCol = Math.min(currentCol, targetLineLen);
    setCursor(getLineStart(targetLine) + targetCol);
  }, [textareaRef, getLines, getLineIndex, getLineStart, setCursor]);

  const findWordAt = useCallback((pos) => {
    const text = content;
    if (pos >= text.length) return { start: pos, end: pos };
    // If on whitespace, find the next word
    if (/\s/.test(text[pos])) {
      let end = pos;
      while (end < text.length && /\s/.test(text[end])) end++;
      let start = pos;
      while (start > 0 && /\s/.test(text[start - 1])) start--;
      return { start, end };
    }
    // On a word character - find word boundaries
    let start = pos;
    while (start > 0 && /\S/.test(text[start - 1]) && !/\s/.test(text[start - 1])) start--;
    let end = pos;
    while (end < text.length && /\S/.test(text[end]) && !/\s/.test(text[end])) end++;
    // Include trailing whitespace for 'aw'
    while (end < text.length && /\s/.test(text[end])) end++;
    return { start, end };
  }, [content]);

  const findWordInner = useCallback((pos) => {
    const text = content;
    if (pos >= text.length) return { start: pos, end: pos };
    if (/\s/.test(text[pos])) {
      let end = pos;
      while (end < text.length && /\s/.test(text[end])) end++;
      let start = pos;
      while (start > 0 && /\s/.test(text[start - 1])) start--;
      return { start, end };
    }
    let start = pos;
    while (start > 0 && /\S/.test(text[start - 1]) && !/\s/.test(text[start - 1])) start--;
    let end = pos;
    while (end < text.length && /\S/.test(text[end]) && !/\s/.test(text[end])) end++;
    return { start, end };
  }, [content]);

  const findTextObject = useCallback((pos, char, inner) => {
    const text = content;
    const pairs = { '"': '"', "'": "'", '`': '`', '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{' };
    const closeChar = pairs[char] || char;

    // Find the enclosing pair
    let openPos = -1;
    let closePos = -1;

    // Search backward for opening char
    for (let i = pos; i >= 0; i--) {
      if (text[i] === char) {
        openPos = i;
        break;
      }
      if (text[i] === closeChar) break;
    }

    // Search forward for closing char
    for (let i = pos; i < text.length; i++) {
      if (text[i] === closeChar) {
        closePos = i;
        break;
      }
      if (text[i] === char) break;
    }

    if (openPos === -1 || closePos === -1) return null;

    if (inner) {
      return { start: openPos + 1, end: closePos };
    } else {
      return { start: openPos, end: closePos + 1 };
    }
  }, [content]);

  const deleteRange = useCallback((start, end) => {
    if (start >= end) return;
    const newContent = content.slice(0, start) + content.slice(end);
    yankedLineRef.current = content.slice(start, end);
    setContent(newContent);
    requestAnimationFrame(() => setCursor(start));
  }, [content, setContent, setCursor]);

  const yankRange = useCallback((start, end) => {
    yankedLineRef.current = content.slice(start, end);
  }, [content]);

  const changeRange = useCallback((start, end) => {
    if (start >= end) return;
    const newContent = content.slice(0, start) + content.slice(end);
    setContent(newContent);
    requestAnimationFrame(() => setCursor(start));
    setVimState(INSERT);
  }, [content, setContent, setCursor]);

  const deleteLine = useCallback((lineIndex) => {
    const lines = getLines();
    if (lines.length <= 1) {
      setContent('');
      setCursor(0);
      return;
    }
    yankedLineRef.current = lines[lineIndex];
    const newLines = lines.filter((_, i) => i !== lineIndex);
    const targetLine = Math.min(lineIndex, newLines.length - 1);
    setContent(newLines.join('\n'));
    requestAnimationFrame(() => setCursorLineStart(targetLine));
  }, [getLines, setContent, setCursorLineStart]);

  const yankLine = useCallback((lineIndex) => {
    const lines = getLines();
    yankedLineRef.current = lines[lineIndex] || '';
  }, [getLines]);

  const pasteAfter = useCallback(() => {
    if (!yankedLineRef.current) return;
    const lines = getLines();
    const currentLine = getLineIndex();
    const newLines = [...lines];
    newLines.splice(currentLine + 1, 0, yankedLineRef.current);
    setContent(newLines.join('\n'));
    requestAnimationFrame(() => setCursorLineStart(currentLine + 1));
  }, [getLines, getLineIndex, setContent, setCursorLineStart]);

  const openLineBelow = useCallback(() => {
    const lines = getLines();
    const currentLine = getLineIndex();
    const newLines = [...lines];
    newLines.splice(currentLine + 1, 0, '');
    setContent(newLines.join('\n'));
    requestAnimationFrame(() => setCursorLineStart(currentLine + 1));
    setVimState(INSERT);
  }, [getLines, getLineIndex, setContent, setCursorLineStart]);

  const openLineAbove = useCallback(() => {
    const lines = getLines();
    const currentLine = getLineIndex();
    const newLines = [...lines];
    newLines.splice(currentLine, 0, '');
    setContent(newLines.join('\n'));
    requestAnimationFrame(() => setCursorLineStart(currentLine));
    setVimState(INSERT);
  }, [getLines, getLineIndex, setContent, setCursorLineStart]);

  const handleKeyDown = useCallback((e) => {
    if (!vimEnabled) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const ta = textareaRef.current;
    if (!ta) return;

    const key = e.key;

      if (vimState === INSERT) {
        if (key === 'Escape') {
          e.preventDefault();
          setVimState(NORMAL);
          pendingCountRef.current = '';
          pendingGRef.current = false;
          const pos = ta.selectionStart;
          setCursor(Math.max(0, pos - 1));
          return;
        }
        return;
      }

    if (vimState === NORMAL) {
      const isDigit = /^\d$/.test(key);
      if (isDigit && pendingCountRef.current.length < 3) {
        e.preventDefault();
        pendingCountRef.current += key;
        return;
      }

      const count = pendingCountRef.current ? parseInt(pendingCountRef.current, 10) : 1;
      pendingCountRef.current = '';

      // Handle text objects after pending operator (d/c/y + i/a + char)
      if (lastActionRef.current && (key === 'i' || key === 'a')) {
        const operator = lastActionRef.current;
        const inner = key === 'i';
        const pos = ta.selectionStart;

        // Read the next key for the text object type
        const handleTextObjectKey = (e2) => {
          window.removeEventListener('keydown', handleTextObjectKey, true);
          const objKey = e2.key;

          // iw / aw - word text object
          if (objKey === 'w') {
            e2.preventDefault();
            const range = inner ? findWordInner(pos) : findWordAt(pos);
            if (range) {
              if (operator === 'd') deleteRange(range.start, range.end);
              else if (operator === 'c') changeRange(range.start, range.end);
              else if (operator === 'y') yankRange(range.start, range.end);
            }
          }
          // i" / a" / i' / a' / i` / a` - quote text objects
          // i( / a( / i) / a) / i[ / a[ / i] / a] / i{ / a{ / i} / a} - bracket text objects
          else if (objKey === '"' || objKey === "'" || objKey === '`' ||
                   objKey === '(' || objKey === ')' || objKey === '[' || objKey === ']' ||
                   objKey === '{' || objKey === '}') {
            e2.preventDefault();
            const char = (objKey === ')' || objKey === '(') ? '(' :
                         (objKey === ']' || objKey === '[') ? '[' :
                         (objKey === '}' || objKey === '{') ? '{' : objKey;
            const range = findTextObject(pos, char, inner);
            if (range) {
              if (operator === 'd') deleteRange(range.start, range.end);
              else if (operator === 'c') changeRange(range.start, range.end);
              else if (operator === 'y') yankRange(range.start, range.end);
            }
          }
          // il / al - line text object (entire line content)
          else if (objKey === 'l') {
            e2.preventDefault();
            const lineIdx = getLineIndex();
            const lineStart = getLineStart(lineIdx);
            const lineEnd = getLineEnd(lineIdx);
            if (inner) {
              if (operator === 'd') deleteRange(lineStart, lineEnd);
              else if (operator === 'c') changeRange(lineStart, lineEnd);
              else if (operator === 'y') yankRange(lineStart, lineEnd);
            } else {
              // al includes the newline
              const lines = getLines();
              const endPos = lineIdx < lines.length - 1 ? lineEnd + 1 : lineEnd;
              if (operator === 'd') deleteRange(lineStart, endPos);
              else if (operator === 'c') changeRange(lineStart, endPos);
              else if (operator === 'y') yankRange(lineStart, endPos);
            }
          }
          // if / af - function text object (simple: to matching bracket)
          else if (objKey === 'f') {
            e2.preventDefault();
            const text = content;
            // Find enclosing function by looking for unmatched { or }
            let depth = 0;
            let funcStart = pos;
            let funcEnd = pos;

            // Search backward for opening {
            for (let i = pos; i >= 0; i--) {
              if (text[i] === '}') depth++;
              if (text[i] === '{') {
                if (depth === 0) {
                  funcStart = i;
                  break;
                }
                depth--;
              }
            }

            // Search forward for closing }
            depth = 0;
            for (let i = funcStart; i < text.length; i++) {
              if (text[i] === '{') depth++;
              if (text[i] === '}') {
                depth--;
                if (depth === 0) {
                  funcEnd = i + 1;
                  break;
                }
              }
            }

            if (inner) {
              // Inside the braces
              const innerStart = funcStart + 1;
              const innerEnd = funcEnd - 1;
              if (innerStart < innerEnd) {
                if (operator === 'd') deleteRange(innerStart, innerEnd);
                else if (operator === 'c') changeRange(innerStart, innerEnd);
                else if (operator === 'y') yankRange(innerStart, innerEnd);
              }
            } else {
              // Including the braces
              if (funcStart < funcEnd) {
                if (operator === 'd') deleteRange(funcStart, funcEnd);
                else if (operator === 'c') changeRange(funcStart, funcEnd);
                else if (operator === 'y') yankRange(funcStart, funcEnd);
              }
            }
          }
          lastActionRef.current = '';
        };

        window.addEventListener('keydown', handleTextObjectKey, true);
        return;
      }

      // If pending operator but key is not a text object, clear it
      if (lastActionRef.current && key !== 'd' && key !== 'y' && key !== 'c') {
        lastActionRef.current = '';
      }

      switch (key) {
        case 'i':
          e.preventDefault();
          setVimState(INSERT);
          break;
        case 'I': {
          e.preventDefault();
          const lineIdx = getLineIndex();
          setCursor(getLineStart(lineIdx));
          setVimState(INSERT);
          break;
        }
        case 'a': {
          e.preventDefault();
          const pos = ta.selectionStart;
          setCursor(Math.min(pos + 1, content.length));
          setVimState(INSERT);
          break;
        }
        case 'A': {
          e.preventDefault();
          const lineIdx = getLineIndex();
          setCursor(getLineEnd(lineIdx));
          setVimState(INSERT);
          break;
        }
        case 'o':
          e.preventDefault();
          openLineBelow();
          break;
        case 'O':
          e.preventDefault();
          openLineAbove();
          break;
        case 'h': {
          e.preventDefault();
          const pos = ta.selectionStart;
          setCursor(Math.max(0, pos - count));
          break;
        }
        case 'l': {
          e.preventDefault();
          const pos = ta.selectionStart;
          setCursor(Math.min(content.length, pos + count));
          break;
        }
        case 'j':
          e.preventDefault();
          pendingGRef.current = false;
          for (let i = 0; i < count; i++) moveVertically(1);
          break;
        case 'k':
          e.preventDefault();
          pendingGRef.current = false;
          for (let i = 0; i < count; i++) moveVertically(-1);
          break;
        case 'g': {
          e.preventDefault();
          if (pendingGRef.current) {
            // gg: go to first line
            pendingGRef.current = false;
            setCursorLineStart(0);
          } else {
            pendingGRef.current = true;
          }
          return;
        }
        case 'G': {
          e.preventDefault();
          pendingGRef.current = false;
          const lines = getLines();
          setCursorLineStart(lines.length - 1);
          break;
        }
        case 'w': {
          e.preventDefault();
          const text = content;
          let pos = ta.selectionStart;
          for (let i = 0; i < count; i++) {
            const remaining = text.slice(pos);
            const match = remaining.match(/^(?:\s*\S+)/);
            if (match) {
              pos += match[0].length;
            } else {
              pos = text.length;
              break;
            }
          }
          setCursor(pos);
          break;
        }
        case 'b': {
          e.preventDefault();
          const text = content;
          let pos = ta.selectionStart;
          for (let i = 0; i < count; i++) {
            const before = text.slice(0, pos);
            const match = before.match(/(\S+\s*)$/);
            if (match) {
              pos -= match[0].length;
            } else {
              pos = 0;
              break;
            }
          }
          setCursor(pos);
          break;
        }
        case '0':
          e.preventDefault();
          setCursorLineStart(getLineIndex());
          break;
        case '$': {
          e.preventDefault();
          const lineIdx = getLineIndex();
          setCursor(getLineEnd(lineIdx));
          break;
        }
        case 'd': {
          if (lastActionRef.current === 'd') {
            e.preventDefault();
            deleteLine(getLineIndex());
            lastActionRef.current = '';
          } else {
            e.preventDefault();
            lastActionRef.current = 'd';
          }
          return;
        }
        case 'c': {
          if (lastActionRef.current === 'c') {
            e.preventDefault();
            // cc: change entire line (delete content, keep line, enter insert)
            const lineIdx = getLineIndex();
            const lineStart = getLineStart(lineIdx);
            const lineEnd = getLineEnd(lineIdx);
            changeRange(lineStart, lineEnd);
            lastActionRef.current = '';
          } else {
            e.preventDefault();
            lastActionRef.current = 'c';
          }
          return;
        }
        case 'y': {
          if (lastActionRef.current === 'y') {
            e.preventDefault();
            yankLine(getLineIndex());
            lastActionRef.current = '';
          } else {
            e.preventDefault();
            lastActionRef.current = 'y';
          }
          return;
        }
        case 'p':
          e.preventDefault();
          pasteAfter();
          break;
        case 'x': {
          e.preventDefault();
          const pos = ta.selectionStart;
          if (pos < content.length) {
            const newContent = content.slice(0, pos) + content.slice(pos + 1);
            yankedLineRef.current = content[pos];
            setContent(newContent);
            requestAnimationFrame(() => setCursor(pos));
          }
          break;
        }
        case 'u': {
          e.preventDefault();
          if (onUndo) {
            onUndo();
          } else {
            const ta = textareaRef.current;
            if (ta) {
              ta.dispatchEvent(new KeyboardEvent('keydown', {
                key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true
              }));
            }
          }
          break;
        }
        case ':':
          e.preventDefault();
          break;
        default:
          e.preventDefault();
          pendingGRef.current = false;
          break;
      }

      if (key !== 'd' && key !== 'y' && key !== 'c') {
        lastActionRef.current = '';
      }
      if (key !== 'g') {
        pendingGRef.current = false;
      }
    }
  }, [vimEnabled, vimState, textareaRef, content, setContent, getLineIndex, getLineStart, getLineEnd, setCursor, setCursorLineStart, moveVertically, deleteLine, yankLine, pasteAfter, openLineBelow, openLineAbove, findWordAt, findWordInner, findTextObject, deleteRange, yankRange, changeRange, onUndo]);

  useEffect(() => {
    if (!vimEnabled) {
      log.debug('Vim mode disabled, resetting state');
      setVimState(NORMAL);
      pendingCountRef.current = '';
      lastActionRef.current = '';
      pendingGRef.current = false;
    }
  }, [vimEnabled]);

  return {
    vimState,
    handleKeyDown,
    isActive: vimEnabled && vimState === NORMAL,
  };
}
