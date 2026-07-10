import { describe, it, expect, beforeEach } from 'vitest';
import useRccgTphbStore from '@/context/RccgTphbStore';

const getState = () => useRccgTphbStore.getState();

describe('RccgTphbStore', () => {
  beforeEach(() => {
    localStorage.clear();
    getState().clearCredentials();
  });

  it('starts with empty credentials', () => {
    const s = getState();
    expect(s.apiKey).toBe('');
    expect(s.baseUrl).toBe('');
    expect(s.isConnected).toBe(false);
  });

  it('sets the api key', () => {
    getState().setApiKey('sk_live_123');
    expect(getState().apiKey).toBe('sk_live_123');
  });

  it('normalizes trailing slashes on the base url', () => {
    getState().setBaseUrl('https://api.example.com///');
    expect(getState().baseUrl).toBe('https://api.example.com');
  });

  it('keeps a clean base url without trailing slashes', () => {
    getState().setBaseUrl('https://api.example.com');
    expect(getState().baseUrl).toBe('https://api.example.com');
  });

  it('clears credentials', () => {
    getState().setApiKey('sk_live_123');
    getState().setBaseUrl('https://api.example.com');
    getState().setConnected(true);
    getState().clearCredentials();
    const s = getState();
    expect(s.apiKey).toBe('');
    expect(s.baseUrl).toBe('');
    expect(s.isConnected).toBe(false);
  });

  it('updates connection state', () => {
    getState().setConnected(true);
    expect(getState().isConnected).toBe(true);
  });
});
