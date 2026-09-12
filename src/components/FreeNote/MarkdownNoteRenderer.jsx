import React, { useMemo } from 'react';
import { Info, AlertTriangle, Sparkles, CheckCircle2, BookOpen, Music } from 'lucide-react';

/**
 * Parses inline markdown tokens into React elements.
 * Supports:
 * - Obsidian highlight: ==text==
 * - Bold + Italic: ***text*** or ___text___
 * - Bold: **text** or __text__
 * - Italic: *text* or _text_
 * - Strikethrough: ~~text~~
 * - Inline code: `text`
 * - Scripture shortcode: b:Ref or 📖 Ref
 * - Hymn shortcode: h:Ref or 🎵 Ref
 */
export function renderInlineMarkdown(text, { allCaps = false, compact = false } = {}) {
  if (!text || typeof text !== 'string') return null;

  const processedText = allCaps ? text.toUpperCase() : text;

  // Token regex matching markdown elements
  // Matches:
  // 1: ==highlight==
  // 2: ***bold-italic*** or ___bold-italic___
  // 3: **bold** or __bold__
  // 4: *italic* or _italic_
  // 5: ~~strikethrough~~
  // 6: `code`
  // 7: 📖 Ref or b:Ref
  // 8: 🎵 Ref or h:Ref
  const tokenRegex = /(==[\s\S]+?==|\*\*\*[\s\S]+?\*\*\*|___[\s\S]+?___|\*\*[\s\S]+?\*\*|__[\s\S]+?__|(?<!\*)\*[^*\n]+?\*(?!\*)|(?<!_)_[^_\n]+?_(?!_)|~~[\s\S]+?~~|`[^`\n]+`|(?:📖|\b(?:b|bible):)\s*[A-Za-z0-9:\s-]+|(?:🎵|\b(?:h|hymn):)\s*[^\n]+)/g;

  const elements = [];
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(processedText)) !== null) {
    if (match.index > lastIndex) {
      elements.push(processedText.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `inline_${match.index}`;

    if (token.startsWith('==') && token.endsWith('==') && token.length >= 4) {
      // Obsidian Highlight
      const inner = token.slice(2, -2);
      elements.push(
        <mark
          key={key}
          style={{
            backgroundColor: 'rgba(245, 158, 11, 0.4)',
            color: 'inherit',
            padding: compact ? '0 0.15em' : '0.08em 0.35em',
            borderRadius: '0.25em',
            borderBottom: '2px solid rgba(245, 158, 11, 0.85)',
            boxDecorationBreak: 'clone',
            WebkitBoxDecorationBreak: 'clone',
          }}
        >
          {renderInlineMarkdown(inner, { allCaps, compact })}
        </mark>
      );
    } else if ((token.startsWith('***') && token.endsWith('***') && token.length >= 6) ||
               (token.startsWith('___') && token.endsWith('___') && token.length >= 6)) {
      const inner = token.slice(3, -3);
      elements.push(
        <strong key={key} style={{ fontWeight: 800 }}>
          <em style={{ fontStyle: 'italic' }}>
            {renderInlineMarkdown(inner, { allCaps, compact })}
          </em>
        </strong>
      );
    } else if ((token.startsWith('**') && token.endsWith('**') && token.length >= 4) ||
               (token.startsWith('__') && token.endsWith('__') && token.length >= 4)) {
      const inner = token.slice(2, -2);
      elements.push(
        <strong key={key} style={{ fontWeight: 700 }}>
          {renderInlineMarkdown(inner, { allCaps, compact })}
        </strong>
      );
    } else if ((token.startsWith('*') && token.endsWith('*') && token.length >= 2) ||
               (token.startsWith('_') && token.endsWith('_') && token.length >= 2)) {
      const inner = token.slice(1, -1);
      elements.push(
        <em key={key} style={{ fontStyle: 'italic' }}>
          {renderInlineMarkdown(inner, { allCaps, compact })}
        </em>
      );
    } else if (token.startsWith('~~') && token.endsWith('~~') && token.length >= 4) {
      const inner = token.slice(2, -2);
      elements.push(
        <del key={key} style={{ textDecoration: 'line-through', opacity: 0.75 }}>
          {renderInlineMarkdown(inner, { allCaps, compact })}
        </del>
      );
    } else if (token.startsWith('`') && token.endsWith('`') && token.length >= 2) {
      const inner = token.slice(1, -1);
      elements.push(
        <code
          key={key}
          style={{
            fontFamily: 'monospace',
            backgroundColor: 'rgba(128, 128, 128, 0.25)',
            padding: '0.1em 0.35em',
            borderRadius: '0.25em',
            fontSize: '0.88em',
          }}
        >
          {inner}
        </code>
      );
    } else if (/^(?:📖|\b(?:b|bible):)/i.test(token)) {
      const ref = token.replace(/^(?:📖|\b(?:b|bible):)\s*/i, '').trim();
      elements.push(
        <span
          key={key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25em',
            padding: compact ? '0 0.2em' : '0.1em 0.4em',
            borderRadius: '0.3em',
            backgroundColor: 'rgba(245, 158, 11, 0.15)',
            color: '#FBBF24',
            fontWeight: 600,
            fontSize: '0.9em',
          }}
        >
          <BookOpen style={{ width: '0.85em', height: '0.85em', display: 'inline' }} />
          <span>{ref}</span>
        </span>
      );
    } else if (/^(?:🎵|\b(?:h|hymn):)/i.test(token)) {
      const ref = token.replace(/^(?:🎵|\b(?:h|hymn):)\s*/i, '').trim();
      elements.push(
        <span
          key={key}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.25em',
            padding: compact ? '0 0.2em' : '0.1em 0.4em',
            borderRadius: '0.3em',
            backgroundColor: 'rgba(59, 130, 246, 0.15)',
            color: '#60A5FA',
            fontWeight: 600,
            fontSize: '0.9em',
          }}
        >
          <Music style={{ width: '0.85em', height: '0.85em', display: 'inline' }} />
          <span>{ref}</span>
        </span>
      );
    } else {
      elements.push(token);
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < processedText.length) {
    elements.push(processedText.slice(lastIndex));
  }

  return elements.length === 1 ? elements[0] : elements;
}

/**
 * Parses markdown blocks: headings, lists, blockquotes/callouts, dividers, paragraphs
 */
export function parseMarkdownBlocks(rawText) {
  if (!rawText || typeof rawText !== 'string') return [];

  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');

  const blocks = [];
  let currentList = null;
  let currentQuote = null;
  let currentCodeBlock = null;

  const flushList = () => {
    if (currentList) {
      blocks.push(currentList);
      currentList = null;
    }
  };

  const flushQuote = () => {
    if (currentQuote) {
      blocks.push(currentQuote);
      currentQuote = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    // Code block toggle (```)
    if (trimmed.startsWith('```')) {
      flushList();
      flushQuote();
      if (currentCodeBlock) {
        blocks.push(currentCodeBlock);
        currentCodeBlock = null;
      } else {
        currentCodeBlock = {
          type: 'code_block',
          lang: trimmed.slice(3).trim(),
          lines: [],
        };
      }
      continue;
    }

    if (currentCodeBlock) {
      currentCodeBlock.lines.push(line);
      continue;
    }

    // Horizontal Rule (---, ***, ___)
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
      flushList();
      flushQuote();
      blocks.push({ type: 'divider' });
      continue;
    }

    // Headings (#, ##, ###, ####, #####, ######)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushList();
      flushQuote();
      const level = headingMatch[1].length;
      blocks.push({
        type: 'heading',
        level,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    // Blockquote & Obsidian Callouts (> [!NOTE], > [!TIP], etc.)
    if (trimmed.startsWith('>')) {
      flushList();
      const quoteLine = trimmed.replace(/^>\s?/, '');

      if (!currentQuote) {
        // Check for Obsidian Callout header: [!TYPE] Title
        const calloutMatch = quoteLine.match(/^\[!([A-Za-z0-9_-]+)\](?:\s*(.*))?$/);
        if (calloutMatch) {
          currentQuote = {
            type: 'callout',
            calloutType: calloutMatch[1].toUpperCase(),
            title: calloutMatch[2] || calloutMatch[1],
            lines: [],
          };
          continue;
        } else {
          currentQuote = {
            type: 'quote',
            lines: [quoteLine],
          };
          continue;
        }
      } else {
        currentQuote.lines.push(quoteLine);
        continue;
      }
    } else {
      flushQuote();
    }

    // Unordered List (- item, * item, + item)
    const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      const indent = ulMatch[1].length;
      const itemText = ulMatch[2].trim();
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push({ text: itemText, indent });
      continue;
    }

    // Ordered List (1. item, 2. item)
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
    if (olMatch) {
      const indent = olMatch[1].length;
      const num = olMatch[2];
      const itemText = olMatch[3].trim();
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push({ text: itemText, num, indent });
      continue;
    }

    flushList();

    // Blank line
    if (trimmed === '') {
      continue;
    }

    // Standard Paragraph
    blocks.push({
      type: 'paragraph',
      text: trimmed,
    });
  }

  flushList();
  flushQuote();
  if (currentCodeBlock) {
    blocks.push(currentCodeBlock);
  }

  return blocks;
}

/**
 * Obsidian Callout Styling Helper
 */
function getCalloutMeta(type) {
  switch (type) {
    case 'TIP':
    case 'SUCCESS':
      return {
        color: '#10B981',
        bg: 'rgba(16, 185, 129, 0.12)',
        border: '#10B981',
        icon: CheckCircle2,
      };
    case 'WARNING':
    case 'CAUTION':
      return {
        color: '#F59E0B',
        bg: 'rgba(245, 158, 11, 0.12)',
        border: '#F59E0B',
        icon: AlertTriangle,
      };
    case 'IMPORTANT':
    case 'HIGHLIGHT':
      return {
        color: '#8B5CF6',
        bg: 'rgba(139, 92, 246, 0.12)',
        border: '#8B5CF6',
        icon: Sparkles,
      };
    case 'NOTE':
    case 'INFO':
    default:
      return {
        color: '#3B82F6',
        bg: 'rgba(59, 130, 246, 0.12)',
        border: '#3B82F6',
        icon: Info,
      };
  }
}

/**
 * MarkdownNoteRenderer
 * Presentation-grade React renderer for church announcements and sermon notes.
 * Implements Obsidian-inspired typography with relative hierarchy, rich highlights,
 * callouts, bullet lists, and scripture badges.
 */
export default function MarkdownNoteRenderer({
  content,
  baseFontSize,
  fontColor = 'inherit',
  textAlign = 'center',
  fontStyle,
  bold = false,
  italic = false,
  underline = false,
  allCaps = false,
  textStrokeStyles = {},
  textShadow = 'none',
  isStage = false,
  compact = false,
}) {
  const blocks = useMemo(() => parseMarkdownBlocks(content), [content]);

  if (!blocks || blocks.length === 0) {
    return null;
  }

  // Heading proportional multipliers relative to container base font size
  const headingScales = {
    1: compact ? 1.4 : 2.2, // H1: 2.2x base
    2: compact ? 1.25 : 1.7, // H2: 1.7x base
    3: compact ? 1.15 : 1.35, // H3: 1.35x base
    4: compact ? 1.05 : 1.15, // H4: 1.15x base
    5: 1.05,
    6: 1.0,
  };

  const isCenter = textAlign === 'center';

  return (
    <div
      className="obsidian-markdown-slide w-full"
      style={{
        fontFamily: fontStyle || 'inherit',
        fontSize: baseFontSize ? `${baseFontSize}px` : 'inherit',
        color: fontColor || 'inherit',
        textShadow: textShadow || 'none',
        ...textStrokeStyles,
        textAlign,
        lineHeight: 1.45,
        wordWrap: 'break-word',
        wordBreak: 'break-word',
        overflowWrap: 'anywhere',
      }}
    >
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'heading': {
            const scale = headingScales[block.level] || 1.2;
            const fontWeight = block.level <= 2 ? 800 : block.level === 3 ? 700 : 600;
            const headingMargin = compact ? '0.15em 0' : `${Math.max(0.2, 0.45 - block.level * 0.05)}em 0`;

            return (
              <div
                key={idx}
                className={`obsidian-h${block.level} tracking-tight`}
                style={{
                  fontSize: `${scale}em`,
                  fontWeight,
                  lineHeight: 1.2,
                  margin: headingMargin,
                  letterSpacing: block.level === 1 ? '-0.02em' : 'normal',
                  textDecoration: underline ? 'underline' : 'none',
                  fontStyle: italic ? 'italic' : 'normal',
                }}
              >
                {renderInlineMarkdown(block.text, { allCaps, compact })}
              </div>
            );
          }

          case 'callout': {
            const meta = getCalloutMeta(block.calloutType);
            const IconComponent = meta.icon;
            return (
              <div
                key={idx}
                className="obsidian-callout text-left"
                style={{
                  backgroundColor: meta.bg,
                  borderLeft: `4px solid ${meta.border}`,
                  borderRadius: '0 0.5em 0.5em 0',
                  padding: compact ? '0.2em 0.4em' : '0.5em 0.8em',
                  margin: compact ? '0.2em 0' : '0.5em 0',
                  textAlign: 'left',
                }}
              >
                <div
                  className="flex items-center gap-2 font-bold"
                  style={{
                    color: meta.color,
                    fontSize: '0.95em',
                    marginBottom: block.lines.length > 0 ? '0.25em' : '0',
                  }}
                >
                  <IconComponent style={{ width: '1em', height: '1em', flexShrink: 0 }} />
                  <span>{block.title}</span>
                </div>
                {block.lines.map((line, lIdx) => (
                  <div key={lIdx} style={{ fontSize: '0.92em', opacity: 0.95, lineHeight: 1.4 }}>
                    {renderInlineMarkdown(line, { allCaps, compact })}
                  </div>
                ))}
              </div>
            );
          }

          case 'quote': {
            return (
              <blockquote
                key={idx}
                className="obsidian-blockquote"
                style={{
                  borderLeft: '4px solid rgba(245, 158, 11, 0.8)',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: '0 0.4em 0.4em 0',
                  padding: compact ? '0.15em 0.4em' : '0.4em 0.75em',
                  margin: compact ? '0.2em 0' : '0.5em 0',
                  fontStyle: 'italic',
                  opacity: 0.95,
                  textAlign: 'inherit',
                  fontSize: '1.05em',
                }}
              >
                {block.lines.map((line, lIdx) => (
                  <div key={lIdx} style={{ lineHeight: 1.4 }}>
                    {renderInlineMarkdown(line, { allCaps, compact })}
                  </div>
                ))}
              </blockquote>
            );
          }

          case 'ul': {
            const listContent = (
              <ul
                className="obsidian-ul space-y-1"
                style={{
                  listStyleType: 'none',
                  paddingLeft: isCenter ? '0' : '1.4em',
                  margin: compact ? '0.15em 0' : '0.4em 0',
                  textAlign: isCenter ? 'left' : textAlign,
                }}
              >
                {block.items.map((item, iIdx) => (
                  <li
                    key={iIdx}
                    className="flex items-start gap-2"
                    style={{
                      lineHeight: 1.45,
                      marginLeft: item.indent > 0 ? `${item.indent * 0.8}em` : undefined,
                    }}
                  >
                    <span
                      style={{
                        color: 'rgba(245, 158, 11, 0.9)',
                        fontWeight: 'bold',
                        userSelect: 'none',
                      }}
                    >
                      •
                    </span>
                    <span className="flex-1">
                      {renderInlineMarkdown(item.text, { allCaps, compact })}
                    </span>
                  </li>
                ))}
              </ul>
            );

            return isCenter ? (
              <div key={idx} className="flex justify-center w-full">
                <div className="inline-block">{listContent}</div>
              </div>
            ) : (
              <div key={idx}>{listContent}</div>
            );
          }

          case 'ol': {
            const listContent = (
              <ol
                className="obsidian-ol space-y-1"
                style={{
                  listStyleType: 'none',
                  paddingLeft: isCenter ? '0' : '1.4em',
                  margin: compact ? '0.15em 0' : '0.4em 0',
                  textAlign: isCenter ? 'left' : textAlign,
                }}
              >
                {block.items.map((item, iIdx) => (
                  <li
                    key={iIdx}
                    className="flex items-start gap-2"
                    style={{
                      lineHeight: 1.45,
                      marginLeft: item.indent > 0 ? `${item.indent * 0.8}em` : undefined,
                    }}
                  >
                    <span
                      style={{
                        color: 'rgba(245, 158, 11, 0.9)',
                        fontWeight: 700,
                        fontSize: '0.9em',
                        minWidth: '1.2em',
                        userSelect: 'none',
                      }}
                    >
                      {item.num || iIdx + 1}.
                    </span>
                    <span className="flex-1">
                      {renderInlineMarkdown(item.text, { allCaps, compact })}
                    </span>
                  </li>
                ))}
              </ol>
            );

            return isCenter ? (
              <div key={idx} className="flex justify-center w-full">
                <div className="inline-block">{listContent}</div>
              </div>
            ) : (
              <div key={idx}>{listContent}</div>
            );
          }

          case 'divider': {
            return (
              <hr
                key={idx}
                style={{
                  border: 'none',
                  borderTop: '2px solid rgba(255, 255, 255, 0.25)',
                  margin: compact ? '0.25em auto' : '0.7em auto',
                  width: '75%',
                }}
              />
            );
          }

          case 'code_block': {
            return (
              <pre
                key={idx}
                className="obsidian-code-block text-left"
                style={{
                  fontFamily: 'monospace',
                  backgroundColor: 'rgba(0, 0, 0, 0.35)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '0.4em',
                  padding: compact ? '0.2em 0.4em' : '0.6em 0.9em',
                  margin: compact ? '0.2em 0' : '0.5em 0',
                  fontSize: '0.85em',
                  overflowX: 'auto',
                }}
              >
                <code>{block.lines.join('\n')}</code>
              </pre>
            );
          }

          case 'paragraph':
          default: {
            return (
              <div
                key={idx}
                className="obsidian-p"
                style={{
                  margin: compact ? '0.15em 0' : '0.35em 0',
                  lineHeight: 1.45,
                  fontWeight: bold ? 700 : 'normal',
                  fontStyle: italic ? 'italic' : 'normal',
                  textDecoration: underline ? 'underline' : 'none',
                }}
              >
                {renderInlineMarkdown(block.text, { allCaps, compact })}
              </div>
            );
          }
        }
      })}
    </div>
  );
}
