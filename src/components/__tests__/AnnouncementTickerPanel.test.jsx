import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnnouncementTickerPanel from '../AnnouncementTickerPanel';

const outputs = [
  { key: 'output1', name: 'Output 1' },
  { key: 'output2', name: 'Output 2' },
  { key: 'stage', name: 'Stage' },
  { key: 'custom_side-tv', name: 'Side TV' },
];

describe('AnnouncementTickerPanel', () => {
  it('shows the output selector and sends the selected target with a new item', () => {
    const onAdd = vi.fn();
    const onTargetOutputChange = vi.fn();
    render(
      <AnnouncementTickerPanel
        outputs={outputs}
        targetOutput="output2"
        onTargetOutputChange={onTargetOutputChange}
        onAdd={onAdd}
      />
    );

    const selector = screen.getByTestId('announcement-target-output');
    expect(selector.value).toBe('output2');
    expect(screen.getByRole('option', { name: 'All outputs' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Side TV' })).toBeTruthy();

    fireEvent.change(selector, { target: { value: 'custom_side-tv' } });
    expect(onTargetOutputChange).toHaveBeenCalledWith('custom_side-tv');

    fireEvent.change(screen.getByRole('textbox', { name: 'Announcement text' }), {
      target: { value: 'Welcome' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Queue announcement' }));
    expect(onAdd).toHaveBeenCalledWith('Welcome', 'output2');
  });
});
