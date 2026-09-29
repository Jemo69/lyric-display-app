import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { HttpActionButtons } from '@/components/HttpActionButton';
import useLyricsStore from '@/context/LyricsStore';

const getState = () => useLyricsStore.getState();

/** Open the header pill's Configure popover, the second edit surface. */
const openPillConfig = () => {
  render(<HttpActionButtons darkMode={false} />);
  fireEvent.pointerDown(screen.getByLabelText('Configure HTTP action'));
  fireEvent.click(screen.getByLabelText('Configure HTTP action'));
  return {
    save: () => screen.getByRole('button', { name: 'Save' }),
    nameInputs: () => screen.getAllByPlaceholderText('songTitle'),
  };
};

const storeButton = (variables) => {
  getState().setHttpActionButtons([
    {
      id: 'b1',
      label: 'Cue',
      url: 'http://host/cue/{{song}}',
      method: 'POST',
      headers: '',
      body: '',
      variables,
    },
  ]);
};

describe('HttpActionButton - saving variables from the header pill', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(cleanup);

  it('refuses to save a variable row that has no name, instead of dropping it', () => {
    // Settings persists rows exactly as typed so a half-finished name survives
    // each keystroke, which means a blank row can be sitting in the store.
    storeButton([{ name: 'song', type: 'text' }, { name: '', type: 'text' }]);
    const pill = openPillConfig();

    expect(pill.save().disabled).toBe(true);
    expect(screen.getByText(/Give every variable a name/)).toBeTruthy();
  });

  it('refuses to save two variables sharing one name', () => {
    storeButton([{ name: 'song', type: 'text' }, { name: 'song', type: 'text' }]);
    const pill = openPillConfig();

    expect(pill.save().disabled).toBe(true);
    expect(screen.getByText(/Two variables are both named/)).toBeTruthy();
  });

  it('keeps every row when a blank name is filled in and the pill saves', async () => {
    // Regression: the pill used to normalize on save, which silently deleted
    // rows that Settings had created. Nothing was dropped once Save is gated.
    storeButton([{ name: 'song', type: 'text' }, { name: '', type: 'text' }]);
    const pill = openPillConfig();

    fireEvent.change(pill.nameInputs()[1], { target: { value: 'port' } });

    await waitFor(() => expect(pill.save().disabled).toBe(false));
    fireEvent.click(pill.save());

    const [saved] = getState().httpActionButtons;
    expect(saved.variables.map((v) => v.name)).toEqual(['song', 'port']);
    // The rest of the config survives the save too.
    expect(saved.url).toBe('http://host/cue/{{song}}');
  });

  it('still saves an action whose variables are all valid', async () => {
    storeButton([{ name: 'song', type: 'text' }]);
    const pill = openPillConfig();

    expect(pill.save().disabled).toBe(false);
    fireEvent.click(pill.save());

    await waitFor(() => expect(getState().httpActionButtons[0].variables[0].name).toBe('song'));
  });
});
