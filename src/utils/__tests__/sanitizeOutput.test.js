import { describe, it, expect } from 'vitest';
import {
  sanitizeOutputHtml,
  sanitizeOutputText,
  sanitizeOutputSlug,
  sanitizeStyleValue,
  isSafeHref,
  SANITIZE_OUTPUT_ALLOWLIST,
} from '../sanitizeOutput';
import { convertMarkdownToHTML } from '../markdownParser';

const INERT = (html) => {
  const lower = String(html).toLowerCase();
  expect(lower).not.toContain('<script');
  expect(lower).not.toMatch(/\son\w+\s*=/);
  expect(lower).not.toContain('javascript:');
  expect(lower).not.toContain('data:text/html');
  expect(lower).not.toContain('vbscript:');
  expect(lower).not.toContain('<iframe');
  expect(lower).not.toContain('<object');
  expect(lower).not.toContain('<embed');
  expect(lower).not.toContain('<svg');
  expect(lower).not.toContain('<style');
};

describe('sanitizeOutputHtml — XSS fixtures are inert', () => {
  it('drops script tags including their content', () => {
    const out = sanitizeOutputHtml('<script>alert(1)</script>Amazing Grace');
    expect(out).toBe('Amazing Grace');
    INERT(out);
  });

  it('drops uppercase SCRIPT with attributes', () => {
    const out = sanitizeOutputHtml('<SCRIPT type="text/javascript">alert(1)</SCRIPT>Safe');
    expect(out).toBe('Safe');
    INERT(out);
  });

  it('strips event handlers (quoted, single-quoted, unquoted, uppercase)', () => {
    expect(sanitizeOutputHtml('<img src="x" onerror="alert(1)">')).toBe('');
    expect(sanitizeOutputHtml("<img src='x' onerror='alert(1)'>")).toBe('');
    expect(sanitizeOutputHtml('<img src=x onerror=alert(1)>')).toBe('');
    expect(sanitizeOutputHtml('<div ONCLICK="alert(1)">hi</div>')).toBe('hi');
    expect(sanitizeOutputHtml('<p onmouseover = "alert(1)">hi</p>')).toBe('<p>hi</p>');
  });

  it('neutralizes javascript:/data:/vbscript: link targets', () => {
    expect(sanitizeOutputHtml('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeOutputHtml('<a href=javascript:alert(1)>x</a>')).toBe(
      '<a target="_blank" rel="noopener noreferrer">x</a>',
    );
    expect(sanitizeOutputHtml('<a href="JaVaScRiPt:alert(1)">x</a>')).not.toContain('href');
    expect(sanitizeOutputHtml('<a href="data:text/html,<script>alert(1)</script>">x</a>')).not.toContain(
      'href',
    );
    expect(sanitizeOutputHtml('<a href="vbscript:msgbox(1)">x</a>')).not.toContain('href');
  });

  it('catches entity-encoded and whitespace-padded scheme smuggling', () => {
    expect(sanitizeOutputHtml('<a href="javascript&#58;alert(1)">x</a>')).not.toContain('href');
    expect(sanitizeOutputHtml('<a href="javascript&#x3a;alert(1)">x</a>')).not.toContain('href');
    expect(sanitizeOutputHtml('<a href="java\tscript:alert(1)">x</a>')).not.toContain('href');
    expect(sanitizeOutputHtml('<a href="  javascript:alert(1)">x</a>')).not.toContain('href');
  });

  it('drops svg/math containers with their content and unwraps unknown tags', () => {
    expect(sanitizeOutputHtml('<svg onload="alert(1)"><circle/></svg>done')).toBe('done');
    expect(sanitizeOutputHtml('<div class="x"><span>kept text</span></div>')).toBe('kept text');
    expect(sanitizeOutputHtml('<iframe src="https://evil.example"></iframe>hi')).toBe('hi');
  });

  it('strips comments, doctypes, and processing instructions', () => {
    expect(sanitizeOutputHtml('a<!--[if IE]>evil<![endif]-->b')).toBe('ab');
    expect(sanitizeOutputHtml('a<!DOCTYPE html>b')).toBe('ab');
    expect(sanitizeOutputHtml('a<?php echo 1 ?>b')).toBe('ab');
  });

  it('drops dangerous style values but keeps safe declarations', () => {
    expect(sanitizeOutputHtml('<p style="color: red; width: expression(alert(1))">hi</p>')).toBe(
      '<p style="color: red">hi</p>',
    );
    expect(
      sanitizeOutputHtml('<p style="background: url(javascript:alert(1))">hi</p>'),
    ).toBe('<p>hi</p>');
    INERT(sanitizeOutputHtml('<p style="x: expression(alert(1))">hi</p>'));
  });

  it('escapes unterminated and non-tag angle brackets as text', () => {
    expect(sanitizeOutputHtml('3 < 4 and 5 > 2')).toBe('3 &lt; 4 and 5 &gt; 2');
    expect(sanitizeOutputHtml('hello <world')).toBe('hello &lt;world');
  });
});

describe('sanitizeOutputHtml — legitimate formatting survives', () => {
  it('keeps the allowlisted tag set', () => {
    for (const tag of SANITIZE_OUTPUT_ALLOWLIST.tags) {
      const out =
        tag === 'br' || tag === 'hr'
          ? sanitizeOutputHtml(`a<${tag}>b`)
          : sanitizeOutputHtml(`<${tag}>x</${tag}>`);
      expect(out, tag).toContain(`<${tag}`);
    }
  });

  it('keeps https links and forces safe rel/target', () => {
    expect(sanitizeOutputHtml('<a href="https://example.com/song">lyrics</a>')).toBe(
      '<a href="https://example.com/song" target="_blank" rel="noopener noreferrer">lyrics</a>',
    );
  });

  it('keeps markdown-generated output intact', () => {
    const html = convertMarkdownToHTML('**Bold** and *italic* with `code`');
    expect(html).toContain('<strong');
    expect(html).toContain('<em');
    expect(html).toContain('<code');
    INERT(html);
  });

  it('strips injected markup from markdown while keeping the words', () => {
    const html = convertMarkdownToHTML('<script>alert(1)</script>\n\nHello [Chorus]');
    expect(html).toContain('Hello [Chorus]');
    INERT(html);
  });

  it('preserves translation and translator brackets as text', () => {
    expect(sanitizeOutputHtml('[Chorus]')).toBe('[Chorus]');
    expect(sanitizeOutputHtml('[and he said]').replace(/&[^;]+;/g, '')).toContain('and he said');
  });
});

describe('sanitizeOutputText — plain-text boundary', () => {
  it('is identity for legitimate lyric, Bible, and translation content', () => {
    const legit = [
      'Amazing grace how sweet the sound',
      '[Chorus]\nShout to the Lord',
      'For God so loved the world [and he said] amen',
      'Line one\nLine two\n\nJohn 3:16',
      'Ẹ káàbọ̀ sí ilé ìjọsìn — Señor, ten piedad',
      '3 < 4 but grace > all & forever',
      '\tindented verse',
    ];
    for (const text of legit) {
      expect(sanitizeOutputText(text), JSON.stringify(text)).toBe(text);
    }
  });

  it('strips C0 controls and DEL but keeps newlines/tabs', () => {
    const NUL = String.fromCharCode(0);
    const SOH = String.fromCharCode(1);
    const DEL = String.fromCharCode(127);
    expect(sanitizeOutputText('a' + NUL + 'b' + SOH + 'c' + DEL + 'd\ne\tf')).toBe('abcd\ne\tf');
    expect(sanitizeOutputText('a\rb')).toBe('a\rb');
    expect(sanitizeOutputText(null)).toBe('');
    expect(sanitizeOutputText(undefined)).toBe('');
  });
});

describe('sanitizeOutputSlug — route boundary', () => {
  it('passes through built-in and custom slugs', () => {
    expect(sanitizeOutputSlug('output1')).toBe('output1');
    expect(sanitizeOutputSlug('Stage')).toBe('stage');
    expect(sanitizeOutputSlug('/youth-room')).toBe('youth-room');
    expect(sanitizeOutputSlug('overflow_hall')).toBe('overflow_hall');
  });

  it('rejects traversal and markup', () => {
    expect(sanitizeOutputSlug('..')).toBe('');
    expect(sanitizeOutputSlug('../etc')).toBe('');
    expect(sanitizeOutputSlug('<script>')).toBe('');
    expect(sanitizeOutputSlug('a/b')).toBe('');
    expect(sanitizeOutputSlug('')).toBe('');
  });
});

describe('isSafeHref / sanitizeStyleValue units', () => {
  it('allows http/https/mailto/relative, blocks the rest', () => {
    expect(isSafeHref('https://example.com')).toBe(true);
    expect(isSafeHref('http://192.168.1.5:4000/')).toBe(true);
    expect(isSafeHref('mailto:team@church.example')).toBe(true);
    expect(isSafeHref('#verse-3')).toBe(true);
    expect(isSafeHref('/releases/tag/v1')).toBe(true);
    expect(isSafeHref('javascript:alert(1)')).toBe(false);
    expect(isSafeHref('//evil.example/x')).toBe(false);
    expect(isSafeHref('')).toBe(false);
  });

  it('sanitizes inline style declarations', () => {
    expect(sanitizeStyleValue('font-size: 1.5rem; font-weight: 700')).toContain('font-size');
    expect(sanitizeStyleValue('x: expression(alert(1))')).toBe('');
  });
});
