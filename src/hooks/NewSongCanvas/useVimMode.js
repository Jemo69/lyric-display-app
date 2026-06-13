import { useState, useCallback, useRef, useEffect } from 'react';

const NORMAL = 'normal';
const INSERT = 'insert';

export default function useVimMode({ textareaRef, content, setContent, vimEnabled }) {
  const [vimState, setVimState] = useState(NORMAL);
  const pendingCountRef = useRef('');
  const yankedLineRef = useRef('');
  const lastActionRef = useRef('');

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
          for (let i = 0; i < count; i++) moveVertically(1);
          break;
        case 'k':
          e.preventDefault();
          for (let i = 0; i < count; i++) moveVertically(-1);
          break;
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
          break;
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
          break;
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
        case 'u':
          e.preventDefault();
          document.execCommand('undo');
          break;
        case ':':
          e.preventDefault();
          break;
        default:
          e.preventDefault();
          break;
      }

      if (key !== 'd' && key !== 'y') {
        lastActionRef.current = '';
      }
    }
  }, [vimEnabled, vimState, textareaRef, content, setContent, getLineIndex, getLineStart, getLineEnd, setCursor, setCursorLineStart, moveVertically, deleteLine, yankLine, pasteAfter, openLineBelow, openLineAbove]);

  useEffect(() => {
    if (!vimEnabled) {
      setVimState(NORMAL);
      pendingCountRef.current = '';
      lastActionRef.current = '';
    }
  }, [vimEnabled]);

  return {
    vimState,
    handleKeyDown,
    isActive: vimEnabled && vimState === NORMAL,
  };
}
