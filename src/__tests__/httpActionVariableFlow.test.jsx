import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { executeHttpAction } from '@/utils/httpAction';

const mockShowToast = vi.fn();
let modalNodeSetter = null;

vi.mock('@/hooks/useToast', () => ({
  default: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/hooks/useModal', () => ({
  default: () => ({
    // Renders the real modal body inline so the prompt form is exercised for real.
    // `close` unmounts the body, matching how the real provider removes the modal.
    showModal: (config) => new Promise((resolve) => {
      if (!modalNodeSetter) return;
      const close = (value) => {
        modalNodeSetter(null);
        resolve(value);
      };
      modalNodeSetter(
        <>
          <h2>{config.title}</h2>
          {typeof config.body === 'function' ? config.body({ close, isDark: false }) : config.body}
          {config.dismissible !== false && (
            <button onClick={() => close({ dismissed: true })}>dismiss</button>
          )}
        </>
      );
    }),
    closeModal: () => { },
  }),
}));

// Imported after the mocks so the hook picks them up.
const { default: useHttpActionRunner } = await import('@/hooks/useHttpActionRunner');

let fetchMock;

beforeEach(() => {
  fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    text: async () => '{"ok":true}',
  }));
  global.fetch = fetchMock;
  mockShowToast.mockClear();
  window.electronAPI = undefined;
});

afterEach(() => {
  cleanup();
  delete window.electronAPI;
});

const lastCall = () => {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
  return { url: call[0], opts: call[1] };
};

describe('executeHttpAction - dynamic input', () => {
  const base = {
    label: 'Cue',
    url: 'http://192.168.1.50:8080/cue/{{song}}',
    method: 'POST',
    headers: '{"Content-Type":"application/json"}',
    body: '{"song":"{{song}}","port":{{port}}}',
  };

  it('substitutes answers into url, headers and body before sending', async () => {
    const variables = [
      { name: 'song', type: 'text' },
      { name: 'port', type: 'number' },
    ];
    const result = await executeHttpAction({ ...base, variables, values: { song: 'Amazing Grace', port: '3' } });

    expect(result.success).toBe(true);
    const { url, opts } = lastCall();
    expect(url).toBe('http://192.168.1.50:8080/cue/Amazing%20Grace');
    expect(opts.method).toBe('POST');
    expect(JSON.parse(opts.body)).toEqual({ song: 'Amazing Grace', port: 3 });
  });

  it('substitutes into a header value', async () => {
    await executeHttpAction({
      url: 'http://host/x',
      method: 'GET',
      headers: 'X-Token: {{token}}',
      body: '',
      variables: [{ name: 'token' }],
      values: { token: 'secret-1' },
    });
    expect(lastCall().opts.headers['X-Token']).toBe('secret-1');
  });

  it('sends immediately and unchanged when the action has no variables', async () => {
    await executeHttpAction({
      url: 'http://host/x',
      method: 'POST',
      headers: '{"Content-Type":"application/json"}',
      body: '{"a":"{{notAVariable}}"}',
    });
    const { url, opts } = lastCall();
    expect(url).toBe('http://host/x');
    // No variables declared, so the literal text is sent as typed.
    expect(JSON.parse(opts.body)).toEqual({ a: '{{notAVariable}}' });
  });

  it('sends immediately when variables is an empty array', async () => {
    await executeHttpAction({ url: 'http://host/x', method: 'GET', headers: '', body: '', variables: [] });
    expect(lastCall().url).toBe('http://host/x');
  });

  it('blocks the request when a required answer is missing', async () => {
    const result = await executeHttpAction({
      ...base,
      variables: [{ name: 'song', required: true }],
      values: { song: '   ' },
    });
    expect(result.success).toBe(false);
    expect(result.validationError).toBe(true);
    expect(result.field).toBe('variables');
    expect(result.error).toMatch(/song/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('falls back to the declared default instead of blocking', async () => {
    await executeHttpAction({
      ...base,
      body: '{"song":"{{song}}"}',
      variables: [{ name: 'song', required: true, defaultValue: 'Fallback' }],
      values: {},
    });
    expect(JSON.parse(lastCall().opts.body)).toEqual({ song: 'Fallback' });
  });

  it('blocks the request when a number answer is not a number', async () => {
    const result = await executeHttpAction({
      ...base,
      body: '{"song":"x"}',
      variables: [{ name: 'port', type: 'number' }],
      values: { port: 'abc' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/number/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('blocks the request when a placeholder has no matching variable', async () => {
    const result = await executeHttpAction({
      ...base,
      body: '{"song":"{{undeclared}}"}',
      variables: [{ name: 'song' }],
      values: { song: 'x' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/undeclared/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('validates the resolved request, not the raw template', async () => {
    // "{{count}}" alone is not valid JSON, but "7" makes it valid.
    const result = await executeHttpAction({
      url: 'http://host/x',
      method: 'POST',
      headers: '{"Content-Type":"application/json"}',
      body: '{"count": {{count}}}',
      variables: [{ name: 'count', type: 'number' }],
      values: { count: '7' },
    });
    expect(result.success).toBe(true);
    expect(JSON.parse(lastCall().opts.body)).toEqual({ count: 7 });
  });
});

const RunnerHarness = ({ button }) => {
  const [node, setNode] = React.useState(null);
  modalNodeSetter = setNode;
  const run = useHttpActionRunner();
  return (
    <>
      <button onClick={() => run(button)}>fire</button>
      {node}
    </>
  );
};

describe('useHttpActionRunner - prompt before firing', () => {
  const withVariables = {
    id: 'a1',
    label: 'Cue Song',
    url: 'http://host/cue/{{song}}',
    method: 'POST',
    headers: '{"Content-Type":"application/json"}',
    body: '{"song":"{{song}}"}',
    variables: [{ name: 'song', label: 'Song title', type: 'text', required: true }],
  };

  it('asks for input first and sends nothing until the operator answers', async () => {
    render(<RunnerHarness button={withVariables} />);
    fireEvent.click(screen.getByText('fire'));

    await waitFor(() => expect(screen.getByText('Cue Song')).toBeTruthy());
    expect(screen.getByText('Song title')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Song title/), { target: { value: 'Amazing Grace' } });
    fireEvent.click(screen.getByText('Send request'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(lastCall().url).toBe('http://host/cue/Amazing%20Grace');
    expect(JSON.parse(lastCall().opts.body)).toEqual({ song: 'Amazing Grace' });
    expect(mockShowToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'success' }));
  });

  it('sends nothing when the operator cancels the prompt', async () => {
    render(<RunnerHarness button={withVariables} />);
    fireEvent.click(screen.getByText('fire'));
    await waitFor(() => expect(screen.getByText('Cue Song')).toBeTruthy());

    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Send request')).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends nothing when the prompt is dismissed', async () => {
    render(<RunnerHarness button={withVariables} />);
    fireEvent.click(screen.getByText('fire'));
    await waitFor(() => expect(screen.getByText('Cue Song')).toBeTruthy());

    fireEvent.click(screen.getByText('dismiss'));
    await waitFor(() => expect(screen.queryByText('Send request')).toBeNull());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to submit while a required answer is blank', async () => {
    render(<RunnerHarness button={withVariables} />);
    fireEvent.click(screen.getByText('fire'));
    await waitFor(() => expect(screen.getByText('Send request')).toBeTruthy());

    fireEvent.click(screen.getByText('Send request'));
    await waitFor(() => expect(screen.getByText('Required')).toBeTruthy());
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('prefills the default value and sends without retyping it', async () => {
    render(
      <RunnerHarness
        button={{
          ...withVariables,
          url: 'http://host/cue',
          body: '{"song":"{{song}}"}',
          variables: [{ name: 'song', type: 'text', required: true, defaultValue: 'Fallback' }],
        }}
      />
    );
    fireEvent.click(screen.getByText('fire'));
    await waitFor(() => expect(screen.getByText('Send request')).toBeTruthy());

    expect(screen.getByLabelText(/^song/).value).toBe('Fallback');
    fireEvent.click(screen.getByText('Send request'));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(lastCall().opts.body)).toEqual({ song: 'Fallback' });
  });

  it('renders a dropdown for a select variable', async () => {
    render(
      <RunnerHarness
        button={{
          ...withVariables,
          url: 'http://host/cue',
          body: '{"scene":"{{scene}}"}',
          variables: [{ name: 'scene', label: 'Scene', type: 'select', options: ['black', 'white'] }],
        }}
      />
    );
    fireEvent.click(screen.getByText('fire'));
    await waitFor(() => expect(screen.getByLabelText(/^Scene/)).toBeTruthy());

    const select = screen.getByLabelText(/^Scene/);
    expect(select.tagName).toBe('SELECT');
    fireEvent.change(select, { target: { value: 'white' } });
    fireEvent.click(screen.getByText('Send request'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(lastCall().opts.body)).toEqual({ scene: 'white' });
  });

  it('never prompts for an action with no variables', async () => {
    render(<RunnerHarness button={{ id: 'a2', label: 'Next', url: 'http://host/next', method: 'POST', headers: '', body: '' }} />);
    fireEvent.click(screen.getByText('fire'));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Send request')).toBeNull();
    expect(lastCall().url).toBe('http://host/next');
  });
});
