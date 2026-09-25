import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useLyricsStore from '../../context/LyricsStore';
import ShowControlDock from '../ShowControlDock';

const outputs = [
  { key: 'output1', name: 'Output 1' },
  { key: 'output2', name: 'Output 2' },
  { key: 'stage', name: 'Stage' },
];

/**
 * The ticker panel has its own "Live"/"Clear" wording in places, so state
 * buttons are addressed through the show-control group rather than by name.
 */
const stateButton = (label) =>
  within(screen.getByRole('group', { name: /show control: live, clear, blackout, or logo/i }))
    .getByRole('button', { name: new RegExp(`^${label}`, 'i') });

const setProps = (overrides = {}) => ({
  showState: 'LIVE',
  onSelect: vi.fn(),
  outputs,
  queue: [],
  activeId: null,
  targetOutput: 'all',
  onTargetOutputChange: vi.fn(),
  onAdd: vi.fn(),
  onRemove: vi.fn(),
  onClear: vi.fn(),
  onShow: vi.fn(),
  darkMode: true,
  disabled: false,
  ...overrides,
});

describe('ShowControlDock', () => {
  beforeEach(() => {
    useLyricsStore.setState({ showControlDockExpanded: true });
  });

  describe('open and close', () => {
    it('shows the show-control bar and the announcement queue when open', () => {
      render(<ShowControlDock {...setProps()} />);

      expect(screen.getByTestId('show-control-dock-body')).toBeInTheDocument();
      expect(stateButton('Live')).toBeInTheDocument();
      expect(screen.getByTestId('announcement-target-output')).toBeInTheDocument();
    });

    it('folds the whole block away and brings it back on a second tap', async () => {
      const user = userEvent.setup();
      render(<ShowControlDock {...setProps()} />);
      const toggle = screen.getByTestId('show-control-dock-toggle');

      expect(toggle).toHaveAttribute('aria-expanded', 'true');

      await user.click(toggle);
      expect(screen.queryByTestId('show-control-dock-body')).not.toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-expanded', 'false');

      await user.click(toggle);
      expect(screen.getByTestId('show-control-dock-body')).toBeInTheDocument();
      expect(toggle).toHaveAttribute('aria-expanded', 'true');
    });

    it('persists the collapsed state', async () => {
      const user = userEvent.setup();
      render(<ShowControlDock {...setProps()} />);

      await user.click(screen.getByTestId('show-control-dock-toggle'));
      expect(useLyricsStore.getState().showControlDockExpanded).toBe(false);

      await user.click(screen.getByTestId('show-control-dock-toggle'));
      expect(useLyricsStore.getState().showControlDockExpanded).toBe(true);
    });

    it('starts collapsed when the store says so', () => {
      useLyricsStore.setState({ showControlDockExpanded: false });
      render(<ShowControlDock {...setProps()} />);
      expect(screen.queryByTestId('show-control-dock-body')).not.toBeInTheDocument();
    });
  });

  describe('collapsed summary', () => {
    it('keeps the active show state visible without reopening', async () => {
      const user = userEvent.setup();
      render(<ShowControlDock {...setProps({ showState: 'BLACKOUT' })} />);

      await user.click(screen.getByTestId('show-control-dock-toggle'));

      expect(screen.getByTestId('show-control-dock-state')).toHaveTextContent('Blackout');
    });

    it('shows the queue depth only when something is queued', async () => {
      const user = userEvent.setup();
      const { rerender } = render(<ShowControlDock {...setProps()} />);

      await user.click(screen.getByTestId('show-control-dock-toggle'));
      expect(screen.queryByTestId('show-control-dock-queued')).not.toBeInTheDocument();

      rerender(
        <ShowControlDock
          {...setProps({
            showState: 'LOGO',
            queue: [
              { id: 'a', text: 'Welcome home', targetOutput: 'output2' },
              { id: 'b', text: 'Nursery is open', targetOutput: 'stage' },
            ],
          })}
        />
      );

      expect(screen.getByTestId('show-control-dock-queued')).toHaveTextContent('2 queued');
      expect(screen.getByTestId('show-control-dock-state')).toHaveTextContent('Logo');
    });

    it('hides the queue rows themselves while collapsed', () => {
      useLyricsStore.setState({ showControlDockExpanded: false });
      render(
        <ShowControlDock
          {...setProps({
            queue: [{ id: 'a', text: 'Welcome home', targetOutput: 'output2' }],
          })}
        />
      );

      expect(screen.getByTestId('show-control-dock-queued')).toBeInTheDocument();
      expect(screen.queryByText('Welcome home')).not.toBeInTheDocument();
    });
  });

  describe('delegated behaviour', () => {
    it('forwards a show-state selection', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();
      render(<ShowControlDock {...setProps({ onSelect })} />);

      await user.click(stateButton('Blackout'));
      expect(onSelect).toHaveBeenCalledWith('BLACKOUT');
    });

    it('marks the current state as pressed', () => {
      render(<ShowControlDock {...setProps({ showState: 'CLEAR' })} />);
      expect(stateButton('Clear')).toHaveAttribute('aria-pressed', 'true');
      expect(stateButton('Live')).toHaveAttribute('aria-pressed', 'false');
    });

    it('disables the controls when the socket is not ready', () => {
      render(<ShowControlDock {...setProps({ disabled: true })} />);
      expect(stateButton('Live')).toBeDisabled();
    });

    it('passes the queue target through to the ticker panel', () => {
      const onAdd = vi.fn();
      render(<ShowControlDock {...setProps({ targetOutput: 'output2', onAdd })} />);

      fireEvent.change(screen.getByRole('textbox', { name: 'Announcement text' }), {
        target: { value: 'Welcome' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Queue announcement' }));
      expect(onAdd).toHaveBeenCalledWith('Welcome', 'output2');
    });
  });
});
