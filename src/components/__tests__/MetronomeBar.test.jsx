import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import useLyricsStore, { defaultMetronomeSettings } from '../../context/LyricsStore';
import { __resetMetronomeForTests, getMetronomeState } from '../../utils/metronome';
import MetronomeBar from '../MetronomeBar';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

let originalAudioContext;

beforeEach(() => {
  useLyricsStore.setState({ metronomeSettings: defaultMetronomeSettings() });
  originalAudioContext = window.AudioContext;
  // jsdom has no Web Audio; a bare stub is enough because every assertion here is
  // about the operator-facing control surface, not about the sound.
  window.AudioContext = function AudioContextStub() {
    return {
      currentTime: 0,
      state: 'running',
      destination: {},
      createBufferSource: () => ({ buffer: null, connect() {}, start() {} }),
      createGain: () => ({ gain: { value: 1 }, connect() {} }),
      createChannelMerger: () => ({ connect() {} }),
      decodeAudioData: () => Promise.resolve({}),
      setSinkId: () => Promise.resolve(),
      resume: () => Promise.resolve(),
    };
  };
  global.fetch = vi.fn(() =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) })
  );
  delete navigator.mediaDevices;
  __resetMetronomeForTests();
});

afterEach(() => {
  __resetMetronomeForTests();
  window.AudioContext = originalAudioContext;
  delete global.fetch;
});

const options = async (user) => {
  await user.click(screen.getByTestId('metronome-options-toggle'));
  return screen.getByTestId('metronome-options');
};

describe('MetronomeBar', () => {
  describe('layout', () => {
    it('renders the transport, tempo, beats and indicator in one row', () => {
      render(<MetronomeBar darkMode />);

      const bar = screen.getByTestId('metronome-bar');
      expect(within(bar).getByTestId('metronome-toggle')).toBeInTheDocument();
      expect(within(bar).getByTestId('metronome-tempo')).toBeInTheDocument();
      expect(within(bar).getByTestId('metronome-beats')).toBeInTheDocument();
      expect(within(bar).getByTestId('metronome-visualizer')).toBeInTheDocument();
    });

    it('never renders lyric or Bible text', () => {
      const { container } = render(<MetronomeBar darkMode />);
      const text = container.textContent || '';
      expect(text).not.toMatch(/verse|john\s*3|genesis|kjv|esv|nasb/i);
    });

    it('announces the transport state for screen readers', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);

      expect(screen.getByTestId('metronome-status')).toHaveTextContent('Metronome stopped');

      await user.click(screen.getByTestId('metronome-toggle'));
      await flush();

      expect(screen.getByTestId('metronome-status')).toHaveTextContent(/Metronome playing, 120 beats per minute, beat 1 of 4/);
    });
  });

  describe('song BPM (FreeShow metadataBPM)', () => {
    it('stays hidden when the song carries no BPM', () => {
      useLyricsStore.setState({ songMetadata: { title: 'No Tempo', artists: [] } });
      render(<MetronomeBar darkMode />);
      expect(screen.queryByTestId('metronome-song-bpm')).not.toBeInTheDocument();
    });

    it('stays hidden when the song BPM is unusable', () => {
      useLyricsStore.setState({ songMetadata: { title: 'Bad Tempo', bpm: 'fast' } });
      render(<MetronomeBar darkMode />);
      expect(screen.queryByTestId('metronome-song-bpm')).not.toBeInTheDocument();
    });

    it('appears with the song tempo when the metadata has one', () => {
      useLyricsStore.setState({ songMetadata: { title: 'Tuned', bpm: '92.8' } });
      render(<MetronomeBar darkMode />);

      const chip = screen.getByTestId('metronome-song-bpm');
      expect(chip).toHaveTextContent('92');
    });

    it('starts the click at the song tempo', async () => {
      const user = userEvent.setup();
      useLyricsStore.setState({ songMetadata: { title: 'Tuned', bpm: '76' } });
      render(<MetronomeBar darkMode />);

      await user.click(screen.getByTestId('metronome-song-bpm'));
      await flush();

      expect(useLyricsStore.getState().metronomeSettings.tempo).toBe(76);
      expect(screen.getByTestId('metronome-status')).toHaveTextContent('Metronome playing, 76 beats per minute');
    });
  });

  describe('tempo and beats', () => {
    it('starts from the FreeShow defaults', () => {
      render(<MetronomeBar darkMode />);
      expect(screen.getByTestId('metronome-tempo')).toHaveValue('120');
      expect(screen.getByTestId('metronome-beats')).toHaveValue('4');
    });

    it('persists a nudged tempo to the store', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);

      await user.click(screen.getByRole('button', { name: /increase bpm/i }));

      expect(screen.getByTestId('metronome-tempo')).toHaveValue('121');
      expect(useLyricsStore.getState().metronomeSettings.tempo).toBe(121);
    });

    it('persists a nudged beat count to the store', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);

      await user.click(screen.getByRole('button', { name: /decrease beats/i }));

      expect(screen.getByTestId('metronome-beats')).toHaveValue('3');
      expect(useLyricsStore.getState().metronomeSettings.beats).toBe(3);
    });

    it('clamps the tempo to FreeShow’s 1..320 range', async () => {
      const user = userEvent.setup();
      useLyricsStore.setState({
        metronomeSettings: { ...defaultMetronomeSettings(), tempo: 320 },
      });
      render(<MetronomeBar darkMode />);

      await user.click(screen.getByRole('button', { name: /increase bpm/i }));

      expect(useLyricsStore.getState().metronomeSettings.tempo).toBe(320);
    });

    it('clamps a typed tempo on blur', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);

      const input = screen.getByTestId('metronome-tempo');
      await user.clear(input);
      await user.type(input, '9999');
      await user.tab();

      expect(useLyricsStore.getState().metronomeSettings.tempo).toBe(320);
    });

    it('restores the current value when a typed tempo is not a number', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);

      const input = screen.getByTestId('metronome-tempo');
      await user.clear(input);
      await user.type(input, 'abc');
      await user.tab();

      expect(useLyricsStore.getState().metronomeSettings.tempo).toBe(120);
      expect(screen.getByTestId('metronome-tempo')).toHaveValue('120');
    });
  });

  describe('beat indicator', () => {
    it('draws one chip per configured beat', () => {
      useLyricsStore.setState({
        metronomeSettings: { ...defaultMetronomeSettings(), beats: 7 },
      });
      render(<MetronomeBar darkMode />);

      expect(screen.getByTestId('metronome-beat-7')).toBeInTheDocument();
      expect(screen.queryByTestId('metronome-beat-8')).not.toBeInTheDocument();
    });

    it('lights the first chip while the accent beat is sounding', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);

      await user.click(screen.getByTestId('metronome-toggle'));
      await flush();

      // Beat 1 is the accent, so beat 1's chip carries the highlight.
      expect(screen.getByTestId('metronome-beat-1')).toHaveClass('bg-sky-500');
    });
  });

  describe('transport', () => {
    it('starts and stops the click', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);

      const toggle = screen.getByTestId('metronome-toggle');
      expect(toggle).toHaveAttribute('aria-pressed', 'false');

      await user.click(toggle);
      await flush();
      expect(toggle).toHaveAttribute('aria-pressed', 'true');

      await user.click(toggle);
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('is inert while disabled', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode disabled />);

      const toggle = screen.getByTestId('metronome-toggle');
      expect(toggle).toBeDisabled();

      await user.click(toggle);
      await flush();
      expect(toggle).toHaveAttribute('aria-pressed', 'false');
    });

    it('keeps clicking when the bar unmounts, as FreeShow does', async () => {
      const user = userEvent.setup();
      const { unmount } = render(<MetronomeBar darkMode />);

      await user.click(screen.getByTestId('metronome-toggle'));
      await flush();
      expect(screen.getByTestId('metronome-status')).toHaveTextContent('Metronome playing');

      // The sidebar unmounts when the operator switches to Bible mode; the
      // click must survive that.
      unmount();
      expect(getMetronomeState().playing).toBe(true);
    });

    it('plays a tempo persisted from a previous session', async () => {
      // The engine defaults to 120 on a cold module; the store is what a reload
      // restores, so the engine has to adopt it rather than the other way round.
      useLyricsStore.setState({
        metronomeSettings: { ...defaultMetronomeSettings(), tempo: 96, beats: 3 },
      });
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);

      expect(screen.getByTestId('metronome-tempo')).toHaveValue('96');
      expect(getMetronomeState().values.tempo).toBe(96);

      await user.click(screen.getByTestId('metronome-toggle'));
      await flush();

      expect(screen.getByTestId('metronome-status')).toHaveTextContent(
        'Metronome playing, 96 beats per minute, beat 1 of 3'
      );
    });
  });

  describe('options', () => {
    it('keeps the options hidden until asked for', () => {
      render(<MetronomeBar darkMode />);
      expect(screen.queryByTestId('metronome-options')).not.toBeInTheDocument();
      expect(screen.getByTestId('metronome-options-toggle')).toHaveAttribute('aria-expanded', 'false');
    });

    it('reveals volume, click sound, channel and output', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);

      const panel = await options(user);
      expect(within(panel).getByTestId('metronome-volume')).toBeInTheDocument();
      expect(within(panel).getByTestId('metronome-click-sound')).toBeInTheDocument();
      expect(within(panel).getByTestId('metronome-channel')).toBeInTheDocument();
      expect(within(panel).getByTestId('metronome-output')).toBeInTheDocument();
    });

    it('offers metal, wood and custom click sounds', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);
      const panel = await options(user);

      const values = within(panel)
        .getByTestId('metronome-click-sound')
        .querySelectorAll('option');
      expect([...values].map((o) => o.value)).toEqual(['metal', 'wood', 'custom']);
    });

    it('offers stereo, mono left and mono right', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);
      const panel = await options(user);

      const labels = [...within(panel).getByTestId('metronome-channel').querySelectorAll('option')].map(
        (o) => o.textContent
      );
      expect(labels).toEqual(['Stereo', 'Mono left', 'Mono right']);
    });

    it('persists a channel change', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);
      const panel = await options(user);

      await user.selectOptions(within(panel).getByTestId('metronome-channel'), 'mono_left');

      expect(useLyricsStore.getState().metronomeSettings.audioChannel).toBe('mono_left');
    });

    it('persists a click sound change', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);
      const panel = await options(user);

      await user.selectOptions(within(panel).getByTestId('metronome-click-sound'), 'wood');

      expect(useLyricsStore.getState().metronomeSettings.clickSound).toBe('wood');
    });

    it('shows the accent/beat file pickers only for a custom click sound', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);
      const panel = await options(user);

      expect(within(panel).queryByTestId('metronome-custom-sound')).not.toBeInTheDocument();

      await user.selectOptions(within(panel).getByTestId('metronome-click-sound'), 'custom');

      expect(within(panel).getByTestId('metronome-custom-sound')).toBeInTheDocument();
    });

    it('lists the enumerated audio outputs', async () => {
      navigator.mediaDevices = {
        enumerateDevices: vi.fn(() =>
          Promise.resolve([
            { kind: 'audiooutput', deviceId: 'spk-1', label: 'Main Speakers' },
            { kind: 'audiooutput', deviceId: 'default', label: 'Default' },
          ])
        ),
      };
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);
      const panel = await options(user);

      const labels = [...within(panel).getByTestId('metronome-output').querySelectorAll('option')].map(
        (o) => o.textContent
      );
      expect(labels).toEqual(['System default', 'Main Speakers']);
    });

    it('locks the click sound while the metronome runs, as FreeShow does', async () => {
      const user = userEvent.setup();
      render(<MetronomeBar darkMode />);
      const panel = await options(user);

      await user.click(screen.getByTestId('metronome-toggle'));
      await flush();

      expect(within(panel).getByTestId('metronome-click-sound')).toBeDisabled();
    });
  });
});
