import { describe, it, expect, beforeEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UserPreferencesModal from '@/components/UserPreferencesModal';
import useLyricsStore from '@/context/LyricsStore';

const getState = () => useLyricsStore.getState();

const action = (overrides = {}) => ({
  id: 'btn-1',
  label: 'Cue Song',
  url: 'http://192.168.1.50:8080/cue/{{song}}',
  method: 'POST',
  headers: '{"Content-Type":"application/json"}',
  body: '{"song":"{{song}}"}',
  variables: [{ name: 'song', label: 'Song title', type: 'text', required: true }],
  ...overrides,
});

const renderSection = () =>
  render(<UserPreferencesModal darkMode={false} onClose={() => {}} initialSection="httpActions" />);

describe('UserPreferencesModal - HTTP Actions with dynamic input', () => {
  beforeEach(() => {
    localStorage.clear();
    getState().setHttpActionButtons([]);
  });

  it('lists an action and says it will ask for input before sending', () => {
    getState().setHttpActionButtons([action()]);
    renderSection();

    expect(screen.getByRole('heading', { name: 'HTTP Actions' })).toBeTruthy();
    expect(screen.getByDisplayValue('Cue Song')).toBeTruthy();
    expect(screen.getByText('Asks for 1 value before sending')).toBeTruthy();
  });

  it('says an action with no variables is ready to fire', () => {
    getState().setHttpActionButtons([action({ variables: [] })]);
    renderSection();

    expect(screen.getByText('Valid JSON — ready to fire')).toBeTruthy();
  });

  it('persists a new variable to the store', async () => {
    getState().setHttpActionButtons([action({ variables: [] })]);
    renderSection();

    fireEvent.click(screen.getByText('Add variable'));
    await waitFor(() => expect(getState().httpActionButtons[0].variables).toHaveLength(1));

    fireEvent.change(screen.getByPlaceholderText('songTitle'), { target: { value: 'song' } });
    await waitFor(() => expect(getState().httpActionButtons[0].variables[0].name).toBe('song'));
  });

  it('persists a dropdown type and its options', async () => {
    getState().setHttpActionButtons([action({ variables: [] })]);
    renderSection();

    fireEvent.click(screen.getByText('Add variable'));
    await waitFor(() => expect(getState().httpActionButtons[0].variables).toHaveLength(1));

    fireEvent.change(screen.getByPlaceholderText('songTitle'), { target: { value: 'scene' } });
    fireEvent.change(screen.getByDisplayValue('Text'), { target: { value: 'select' } });
    await waitFor(() => expect(getState().httpActionButtons[0].variables[0].type).toBe('select'));

    fireEvent.change(screen.getByPlaceholderText('black, white, blue'), {
      target: { value: 'black, white' },
    });
    await waitFor(() => expect(getState().httpActionButtons[0].variables[0].options).toBe('black, white'));
  });

  it('keeps a template whose body only becomes valid after substitution', () => {
    getState().setHttpActionButtons([
      action({
        body: '{"count": {{count}}}',
        variables: [{ name: 'count', type: 'number', required: true }],
      }),
    ]);
    renderSection();

    // A literal "{{count}}" is not valid JSON. With the variable declared the
    // template is checked after substitution, so the action stays ready to fire.
    expect(screen.getByText('Asks for 1 value before sending')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Test' }).disabled).toBe(false);
  });

  it('still blocks a template that is broken with or without variables', () => {
    getState().setHttpActionButtons([
      action({ body: '{"a": }', variables: [{ name: 'song' }] }),
    ]);
    renderSection();

    expect(screen.getByText('Fix errors before firing')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Test' }).disabled).toBe(true);
  });

  it('flags a request that references an undefined variable', () => {
    getState().setHttpActionButtons([action({ variables: [] })]);
    renderSection();

    expect(screen.getByText(/no variable is defined for it/)).toBeTruthy();
  });

  it('adds a brand new action with no variables so it fires immediately', () => {
    renderSection();
    fireEvent.click(screen.getByText('Add HTTP Button'));

    const [created] = getState().httpActionButtons;
    expect(created.variables).toEqual([]);
    expect(created.method).toBe('POST');
  });
});
