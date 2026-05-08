import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import useLyricsStore from '../context/LyricsStore';
import { getBuiltInOutputs } from '../utils/outputs';
import { resolveBackendUrl } from '../utils/network';
import RegularOutput from './RegularOutput';
import StageOutput from './StageOutput';

function OutputNotFound() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-200 flex items-center justify-center px-6">
      <div className="text-center space-y-2">
        <p className="text-sm uppercase tracking-[0.18em] text-neutral-500">LyricDisplay</p>
        <h1 className="text-2xl font-semibold">Output not found</h1>
        <p className="text-sm text-neutral-400">Create this output from the control panel, then reload this page.</p>
      </div>
    </div>
  );
}

export default function DynamicOutputRoute() {
  const { outputName } = useParams();
  const localOutput = useLyricsStore((state) => {
    const slug = String(outputName || '').replace(/^\/+/, '').toLowerCase();
    const builtIn = getBuiltInOutputs().find((output) => output.slug === slug);
    if (builtIn) return builtIn;
    return (state.customOutputs || []).find((output) => output.slug === slug) || null;
  });
  const [resolvedOutput, setResolvedOutput] = useState(null);
  const [checkedServer, setCheckedServer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setResolvedOutput(null);
    setCheckedServer(false);

    if (localOutput) {
      setCheckedServer(true);
      return () => { cancelled = true; };
    }

    fetch(resolveBackendUrl(`/api/outputs/resolve/${encodeURIComponent(outputName || '')}`))
      .then((response) => response.ok ? response.json() : null)
      .then((output) => {
        if (!cancelled && output?.id) {
          const normalized = { ...output, key: output.key || output.id };
          setResolvedOutput(normalized);
          if (!output.builtIn) {
            useLyricsStore.setState((state) => ({
              customOutputs: [
                ...(state.customOutputs || []).filter((item) => item.id !== normalized.id),
                {
                  id: normalized.id,
                  name: normalized.name,
                  slug: normalized.slug,
                  type: normalized.type,
                  sourceOutputKey: normalized.type === 'stage' ? 'stage' : 'output1',
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                },
              ],
            }));
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCheckedServer(true);
      });

    return () => { cancelled = true; };
  }, [localOutput?.id, outputName]);

  const output = localOutput || resolvedOutput;

  if (!checkedServer && !output) return null;
  if (!output || output.builtIn) return <OutputNotFound />;

  const outputKey = output.key || output.id;

  if (output.type === 'stage') {
    return <StageOutput outputKey={outputKey} displayName={output.name} />;
  }

  return <RegularOutput outputKey={outputKey} displayName={output.name} />;
}
