import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import HttpActionVariablesEditor from '@/components/HttpActionVariablesEditor';

afterEach(cleanup);

const EditorHarness = ({ initial, onState }) => {
  const [button, setButton] = React.useState(initial);
  return (
    <HttpActionVariablesEditor
      button={button}
      darkMode={false}
      onChange={(patch) => {
        const next = { ...button, ...patch };
        setButton(next);
        onState?.(next);
      }}
    />
  );
};

const setUp = (initial) => {
  const onState = vi.fn();
  render(<EditorHarness initial={initial} onState={onState} />);
  return onState;
};

describe('HttpActionVariablesEditor', () => {
  it('explains that an action with no variables fires immediately', () => {
    setUp({ url: 'http://host/x', headers: '', body: '' });
    expect(screen.getByText(/No variables/)).toBeTruthy();
    expect(screen.getByText(/sends immediately/)).toBeTruthy();
  });

  it('adds a variable row on demand', () => {
    const onState = setUp({ url: 'http://host/x', headers: '', body: '' });
    expect(screen.queryByPlaceholderText('songTitle')).toBeNull();

    fireEvent.click(screen.getByText('Add variable'));

    expect(screen.getByPlaceholderText('songTitle')).toBeTruthy();
    expect(onState).toHaveBeenCalled();
    expect(onState.mock.calls.at(-1)[0].variables).toHaveLength(1);
  });

  it('removes a variable row', () => {
    const onState = setUp({
      url: 'http://host/x',
      headers: '',
      body: '',
      variables: [{ name: 'song' }, { name: 'port' }],
    });
    expect(screen.getAllByRole('button', { name: 'Remove variable' })).toHaveLength(2);

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove variable' })[0]);

    const next = onState.mock.calls.at(-1)[0].variables;
    expect(next).toHaveLength(1);
    expect(next[0].name).toBe('port');
  });

  it('warns when the request references a variable that is not defined', () => {
    setUp({ url: 'http://host/{{song}}', headers: '', body: '', variables: [] });
    expect(screen.getByText(/no variable is defined for it/)).toBeTruthy();
  });

  it('clears that warning once the variable is named', () => {
    setUp({ url: 'http://host/{{song}}', headers: '', body: '', variables: [{ name: '' }] });
    expect(screen.getByText(/no variable is defined/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('songTitle'), { target: { value: 'song' } });

    expect(screen.queryByText(/no variable is defined/)).toBeNull();
    expect(screen.getByText(/waits for your input before it is sent/)).toBeTruthy();
  });

  it('flags a name that cannot be used inside a placeholder', () => {
    setUp({ url: 'http://host/x', headers: '', body: '', variables: [{ name: '' }] });

    fireEvent.change(screen.getByPlaceholderText('songTitle'), { target: { value: 'two words' } });

    expect(screen.getByText(/Use letters, numbers, dot, dash or underscore only/)).toBeTruthy();
  });

  it('flags two variables sharing one name', () => {
    setUp({ url: 'http://host/x', headers: '', body: '', variables: [{ name: 'song' }, { name: 'song' }] });
    expect(screen.getAllByText(/Another variable already uses this name/)).toHaveLength(2);
  });

  it('offers a comma separated options field only for a dropdown', () => {
    setUp({ url: 'http://host/x', headers: '', body: '', variables: [{ name: 'scene', type: 'text' }] });
    expect(screen.getByPlaceholderText('optional')).toBeTruthy();
    expect(screen.queryByPlaceholderText('black, white, blue')).toBeNull();

    fireEvent.change(screen.getByDisplayValue('Text'), { target: { value: 'select' } });

    expect(screen.queryByPlaceholderText('optional')).toBeNull();
    expect(screen.getByPlaceholderText('black, white, blue')).toBeTruthy();
  });

  it('warns when a dropdown has no options to choose from', () => {
    setUp({ url: 'http://host/x', headers: '', body: '', variables: [{ name: 'scene', type: 'select', options: '' }] });
    expect(screen.getByText(/Add at least one option/)).toBeTruthy();
  });

  it('lets a variable be made optional', () => {
    const onState = setUp({ url: 'http://host/x', headers: '', body: '', variables: [{ name: 'note', required: true }] });

    fireEvent.click(screen.getByLabelText('Required'));

    expect(onState.mock.calls.at(-1)[0].variables[0].required).toBe(false);
  });

  it('keeps a separate prompt label from the placeholder name', () => {
    const onState = setUp({ url: 'http://host/x', headers: '', body: '', variables: [{ name: 'song' }] });

    fireEvent.change(screen.getByPlaceholderText('song'), { target: { value: 'Song title' } });

    const variable = onState.mock.calls.at(-1)[0].variables[0];
    expect(variable.name).toBe('song');
    expect(variable.label).toBe('Song title');
  });
});
