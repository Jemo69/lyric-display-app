import React from 'react';
import '@testing-library/jest-dom/vitest';
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
    expect(onAdd).toHaveBeenCalledWith('Welcome', 'output2', {
      fontSize: 'md',
      bold: true,
      italic: false,
      align: 'center',
      color: 'white',
    });
  });

  it('sends the chosen text controls with a new item and previews them live', () => {
    const onAdd = vi.fn();
    render(<AnnouncementTickerPanel outputs={outputs} targetOutput="all" onAdd={onAdd} />);

    fireEvent.click(screen.getByRole('button', { name: /Text size large/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Italic' }));
    fireEvent.click(screen.getByRole('button', { name: 'Align right' }));
    fireEvent.click(screen.getByRole('button', { name: /Text color amber/i }));

    // The preview shows the draft in the chosen style before anything queues.
    const preview = screen.getByTestId('announcement-style-preview');
    expect(preview.className).toMatch(/text-right/);
    expect(preview.className).toMatch(/italic/);
    expect(preview.className).toMatch(/text-amber-300/);

    fireEvent.change(screen.getByRole('textbox', { name: 'Announcement text' }), {
      target: { value: 'He is risen' },
    });
    expect(preview).toHaveTextContent('He is risen');
    fireEvent.click(screen.getByRole('button', { name: 'Queue announcement' }));
    expect(onAdd).toHaveBeenCalledWith('He is risen', 'all', {
      fontSize: 'lg',
      bold: true,
      italic: true,
      align: 'right',
      color: 'amber',
    });
  });
});
