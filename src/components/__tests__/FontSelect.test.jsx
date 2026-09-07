import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FontSelect from '../FontSelect';
import { FEATURED_FONTS } from '../../constants/fonts';

vi.mock('../../utils/fontLoader', () => ({
  ensureFontLoaded: vi.fn().mockRejectedValue(new Error('fetch failed (offline)'))
}));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('FontSelect font-load failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('applies the selected font and closes the menu even when loading the WOFF2 fails', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<FontSelect value="Arial" onChange={onChange} darkMode={false} />);

    await user.click(screen.getByText('Arial'));
    const featuredFont = FEATURED_FONTS[1];
    const fontButton = await screen.findByRole('button', { name: featuredFont });
    await user.click(fontButton);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(featuredFont);
    });

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: featuredFont })).toBeNull();
    }, { timeout: 1500 });
  }, 15000);
});
