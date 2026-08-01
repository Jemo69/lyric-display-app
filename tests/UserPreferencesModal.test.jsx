import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserPreferencesModal from '@/components/UserPreferencesModal';
import useRccgTphbStore from '@/context/RccgTphbStore';

const getState = () => useRccgTphbStore.getState();

describe('UserPreferencesModal - RCCGTPHB settings', () => {
  beforeEach(() => {
    localStorage.clear();
    getState().clearCredentials();
  });

  it('renders the RCCGTPHB database configuration section', () => {
    render(<UserPreferencesModal darkMode={false} onClose={() => {}} />);
    expect(screen.getByText('RCCGTPHB Database')).toBeTruthy();
    expect(screen.getByPlaceholderText('https://your-rccgtphb-api.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('sk_live_...')).toBeTruthy();
  });

  it('saves the base url and api key to the store', async () => {
    render(<UserPreferencesModal darkMode={false} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText('https://your-rccgtphb-api.com'), {
      target: { value: 'https://rccg.example.com/' },
    });
    fireEvent.change(screen.getByPlaceholderText('sk_live_...'), {
      target: { value: 'sk_test_abc' },
    });
    fireEvent.click(screen.getByText('Save'));
    await waitFor(() => {
      expect(getState().baseUrl).toBe('https://rccg.example.com');
      expect(getState().apiKey).toBe('sk_test_abc');
    });
  });

  it('clears credentials from the store', async () => {
    getState().setBaseUrl('https://rccg.example.com');
    getState().setApiKey('sk_test_abc');
    render(<UserPreferencesModal darkMode={false} onClose={() => {}} />);
    fireEvent.click(screen.getByText('Clear'));
    await waitFor(() => {
      expect(getState().apiKey).toBe('');
      expect(getState().baseUrl).toBe('');
    });
  });
});
