/**
 * shared/speech/__tests__/quotePolicy.test.js — the quote lane's consent
 * (Phase 7)
 *
 * The lane is off until someone says yes, and it stops being allowed the moment
 * that yes stops applying. These tests pin both directions, because a gate that
 * only fails closed in the happy path is a gate nobody has tested.
 */

import { describe, it, expect } from 'vitest';
import {
  NO_PROVIDER,
  QUOTE_PROVIDERS,
  QUOTE_CONSENT_TEMPLATE,
  assertMaySend,
  consentTextFor,
  egressFor,
  quoteLaneState,
  selectableQuoteProviders,
} from '../quotePolicy.js';

describe('the lane is off by default', () => {
  it('refuses with no provider configured', () => {
    const gate = assertMaySend();
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/no provider/i);
  });

  it('refuses a provider with no consent recorded', () => {
    // The case that matters: someone configured a provider but never ticked the
    // box. This is the leak the lane exists to prevent.
    const gate = assertMaySend({ providerId: 'openai', consented: false, providerReady: true });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/not turned the quote lane on/i);
  });

  it('refuses consent without a ready provider', () => {
    const gate = assertMaySend({ providerId: 'openai', consented: true, providerReady: false });
    expect(gate.ok).toBe(false);
    expect(gate.reason).toMatch(/not ready/i);
  });

  it('allows only when every condition holds', () => {
    const gate = assertMaySend({ providerId: 'ollama', consented: true, providerReady: true });
    expect(gate.ok).toBe(true);
    expect(gate.reason).toBe('');
  });
});

describe('the shown wording and the enforced wording are one string', () => {
  it('the consent text names the provider', () => {
    const text = consentTextFor('openai');
    expect(text).toMatch(/OpenAI/);
    expect(text).toContain('Sermon text from this service will be sent to');
  });

  it('the consent text says what is included that the recording is not', () => {
    // The single most important sentence in this feature. A congregation member
    // telling the congregation something private during the service is the exact
    // case this lane would leak.
    expect(consentTextFor('openai')).toMatch(/not in the published recording/i);
  });

  it('the consent text is built from the one template', () => {
    // If the panel ever renders its own copy, this stops being true — and the
    // whole consent model quietly stops meaning anything.
    expect(consentTextFor('anthropic')).toBe(
      QUOTE_CONSENT_TEMPLATE.replace('{provider}', 'Anthropic')
    );
  });

  it('falls back to a generic provider name for an unknown id', () => {
    expect(consentTextFor('something-else')).toMatch(/the configured provider/);
  });
});

describe('where the traffic goes', () => {
  it('classifies each provider', () => {
    expect(egressFor('ollama')).toBe('local');
    expect(egressFor('openai')).toBe('remote');
    expect(egressFor('anthropic')).toBe('remote');
    expect(egressFor('google')).toBe('remote');
  });

  it('treats nothing configured as off', () => {
    expect(egressFor(NO_PROVIDER)).toBe('off');
    expect(egressFor(undefined)).toBe('off');
    expect(egressFor('nonsense')).toBe('off');
  });
});

describe('the lane state the rail renders', () => {
  it('is off with a stated reason when nothing is configured', () => {
    // "Nothing is ever silently off" — every disabled lane carries a reason.
    const lane = quoteLaneState();
    expect(lane.enabled).toBe(false);
    expect(lane.reason.length).toBeGreaterThan(0);
  });

  it('is on with no reason when a local provider is consented', () => {
    const lane = quoteLaneState({ providerId: 'ollama', consented: true, providerReady: true });
    expect(lane.enabled).toBe(true);
    // Local, so there is nothing to warn about.
    expect(lane.reason).toBe('');
    expect(lane.degraded).toBe(false);
  });

  it('stays loud when a REMOTE provider is on', () => {
    // Even once enabled, the operator should never be able to forget that text
    // is leaving the machine.
    const lane = quoteLaneState({ providerId: 'openai', consented: true, providerReady: true });
    expect(lane.enabled).toBe(true);
    expect(lane.degraded).toBe(true);
    expect(lane.reason).toMatch(/sent off this machine/i);
  });
});

describe('the provider list', () => {
  it('offers a local option first', () => {
    // Local-first so the path of least resistance does not egress anything.
    const providers = selectableQuoteProviders();
    expect(providers[0].id).toBe('ollama');
    expect(providers[0].local).toBe(true);
  });

  it('omits the "off" entry from the selectable list', () => {
    // The panel renders its own "Not configured" option; two ways to say off is
    // one way too many.
    expect(selectableQuoteProviders().some((p) => p.id === NO_PROVIDER)).toBe(false);
  });

  it('marks which providers need a key', () => {
    expect(QUOTE_PROVIDERS.find((p) => p.id === 'ollama').requiresKey).toBe(false);
    expect(QUOTE_PROVIDERS.find((p) => p.id === 'openai').requiresKey).toBe(true);
  });

  it('every provider describes itself', () => {
    for (const provider of QUOTE_PROVIDERS) {
      expect(typeof provider.description, provider.id).toBe('string');
      expect(provider.description.length, provider.id).toBeGreaterThan(10);
    }
  });
});