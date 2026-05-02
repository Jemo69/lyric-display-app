import React from 'react';
import { Monitor, Network, Projector, Power, ScreenShare } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import useToast from '@/hooks/useToast';
import useLyricsStore from '@/context/LyricsStore';
import { formatOutputLabel } from '@/utils/outputLabels';

const DESKTOP_TARGET = 'desktop';

const toDisplayId = (value) => {
  if (value === null || typeof value === 'undefined') return null;
  const num = Number(value);
  return Number.isNaN(num) ? value : num;
};

const displayLabel = (display, fallbackIndex = 0) => {
  if (!display) return `Display ${fallbackIndex + 1}`;
  const baseName = display.name || display.label || `Display ${fallbackIndex + 1}`;
  const width = display?.bounds?.width;
  const height = display?.bounds?.height;
  if (width && height) return `${baseName} (${width}x${height})`;
  return baseName;
};

const projectionTargetValue = (projection) => {
  if (!projection) return null;
  if (projection.targetType === 'desktop') return DESKTOP_TARGET;
  if (projection.displayId === null || typeof projection.displayId === 'undefined') return null;
  return String(projection.displayId);
};

const projectionTargetLabel = (projection) => {
  if (!projection) return 'Unknown target';
  if (projection.targetType === 'desktop') return 'This Monitor';
  return projection.displayName || 'External Display';
};

const ProjectOutputModal = ({
  darkMode,
  onClose,
  preferredDisplayId = null,
  triggerSource = 'manual',
  detectedDisplays = [],
  onOpenIntegrationGuide,
}) => {
  const { showToast } = useToast();
  const customOutputIds = useLyricsStore((state) => state.customOutputIds || []);

  const outputOptions = React.useMemo(() => {
    const options = ['output1', 'output2', ...customOutputIds, 'stage', 'time'];
    return options.map((value) => ({ value, label: formatOutputLabel(value) }));
  }, [customOutputIds]);

  const [selectedOutput, setSelectedOutput] = React.useState(outputOptions[0]?.value || 'output1');
  const [selectedTarget, setSelectedTarget] = React.useState(DESKTOP_TARGET);
  const [externalDisplays, setExternalDisplays] = React.useState([]);
  const [projections, setProjections] = React.useState([]);
  const [loadingState, setLoadingState] = React.useState(false);
  const [isProjecting, setIsProjecting] = React.useState(false);
  const [stoppingOutputKey, setStoppingOutputKey] = React.useState(null);

  React.useEffect(() => {
    if (!outputOptions.some((option) => option.value === selectedOutput)) {
      setSelectedOutput(outputOptions[0]?.value || 'output1');
    }
  }, [outputOptions, selectedOutput]);

  const loadProjectionState = React.useCallback(async () => {
    if (!window?.electronAPI?.display) return;

    setLoadingState(true);
    try {
      const result = await window.electronAPI.display.getProjectionState();
      if (!result?.success) return;

      const externals = Array.isArray(result.externalDisplays)
        ? result.externalDisplays
        : (Array.isArray(result.displays) ? result.displays.filter((d) => !d.primary) : []);

      const nextProjections = Array.isArray(result.projections) ? result.projections : [];
      setExternalDisplays(externals);
      setProjections(nextProjections);
      return { projections: nextProjections, externalDisplays: externals };
    } catch (error) {
      console.warn('Failed to load projection state:', error);
      return null;
    } finally {
      setLoadingState(false);
    }
  }, []);

  React.useEffect(() => {
    loadProjectionState();
  }, [loadProjectionState]);

  React.useEffect(() => {
    if (!preferredDisplayId) return;
    if (!externalDisplays.some((display) => String(display.id) === String(preferredDisplayId))) return;
    setSelectedTarget(String(preferredDisplayId));
  }, [preferredDisplayId, externalDisplays]);

  const activeProjection = React.useMemo(
    () => projections.find((entry) => entry.outputKey === selectedOutput) || null,
    [projections, selectedOutput]
  );

  React.useEffect(() => {
    if (!activeProjection) return;
    const nextTarget = activeProjection.targetType === 'display' && activeProjection.displayId !== null
      ? String(activeProjection.displayId)
      : DESKTOP_TARGET;
    setSelectedTarget((prev) => (prev === nextTarget ? prev : nextTarget));
  }, [activeProjection]);

  const targetOptions = React.useMemo(() => {
    const base = [
      {
        value: DESKTOP_TARGET,
        label: 'This Monitor (Behind Windows)',
        sub: 'Fullscreen frameless projection on your current monitor',
      },
    ];

    externalDisplays.forEach((display, index) => {
      base.push({
        value: String(display.id),
        label: displayLabel(display, index),
        sub: 'Project to external display',
      });
    });
    return base;
  }, [externalDisplays]);

  const selectedTargetInfo = React.useMemo(
    () => targetOptions.find((option) => option.value === selectedTarget) || targetOptions[0],
    [targetOptions, selectedTarget]
  );

  const activeProjections = React.useMemo(
    () => projections.filter((entry) => entry && entry.outputKey),
    [projections]
  );

  const targetOccupant = React.useMemo(() => (
    activeProjections.find((entry) => (
      entry.outputKey !== selectedOutput && projectionTargetValue(entry) === selectedTarget
    )) || null
  ), [activeProjections, selectedOutput, selectedTarget]);

  const isActiveOnSelectedTarget = React.useMemo(() => (
    Boolean(activeProjection) && projectionTargetValue(activeProjection) === selectedTarget
  ), [activeProjection, selectedTarget]);

  const showProjectAction = !activeProjection || !isActiveOnSelectedTarget;
  const isStopping = Boolean(stoppingOutputKey);

  const projectActionLabel = React.useMemo(() => {
    if (isProjecting) return 'Projecting...';
    if (targetOccupant && activeProjection) return 'Replace and Move';
    if (targetOccupant) return 'Replace and Project';
    if (activeProjection) return 'Move Projection';
    return 'Project Output';
  }, [isProjecting, targetOccupant, activeProjection]);

  const handleProject = async () => {
    if (!window?.electronAPI?.display?.projectOutput) {
      showToast({
        title: 'Projection unavailable',
        message: 'Display projection API is not available.',
        variant: 'error',
      });
      return;
    }

    setIsProjecting(true);
    try {
      const payload = {
        outputKey: selectedOutput,
        targetType: selectedTarget === DESKTOP_TARGET ? 'desktop' : 'display',
        displayId: selectedTarget === DESKTOP_TARGET ? null : toDisplayId(selectedTarget),
      };

      const result = await window.electronAPI.display.projectOutput(payload);
      if (!result?.success) {
        throw new Error(result?.error || 'Could not start projection.');
      }

      const displacedOutputKey = result?.displacedOutputKey || null;
      const displacementMessage = displacedOutputKey
        ? ` ${formatOutputLabel(displacedOutputKey)} was turned off on this target.`
        : '';

      showToast({
        title: 'Projection started',
        message: `${formatOutputLabel(selectedOutput)} is now projecting to ${selectedTargetInfo?.label || 'selected target'}.${displacementMessage}`,
        variant: 'success',
      });

      const nextState = await loadProjectionState();
      if (!activeProjection && nextState?.projections) {
        const projectedKeys = new Set(nextState.projections.map((entry) => entry.outputKey));
        const nextOutput = outputOptions.find((option) => !projectedKeys.has(option.value));
        if (nextOutput?.value) {
          setSelectedOutput(nextOutput.value);
        }
      }
    } catch (error) {
      showToast({
        title: 'Projection failed',
        message: error?.message || 'Could not start projection.',
        variant: 'error',
      });
      await loadProjectionState();
    } finally {
      setIsProjecting(false);
    }
  };

  const handleStopProjection = async (outputKey = selectedOutput) => {
    if (!window?.electronAPI?.display?.stopProjection) {
      showToast({
        title: 'Projection unavailable',
        message: 'Display projection API is not available.',
        variant: 'error',
      });
      return;
    }

    setStoppingOutputKey(outputKey);
    try {
      const result = await window.electronAPI.display.stopProjection({ outputKey });
      if (!result?.success) {
        throw new Error(result?.error || 'Could not stop projection.');
      }

      showToast({
        title: 'Projection stopped',
        message: `${formatOutputLabel(outputKey)} projection has been turned off.`,
        variant: 'success',
      });
      await loadProjectionState();
    } catch (error) {
      showToast({
        title: 'Stop failed',
        message: error?.message || 'Could not stop projection.',
        variant: 'error',
      });
    } finally {
      setStoppingOutputKey(null);
    }
  };

  const detectionBanner = triggerSource !== 'manual' && Array.isArray(detectedDisplays) && detectedDisplays.length > 0;

  return (
    <div className="space-y-5">
      {detectionBanner && (
        <div className={`rounded-lg border px-4 py-3 ${darkMode ? 'border-blue-700/50 bg-blue-500/10 text-blue-200' : 'border-blue-200 bg-blue-50 text-blue-800'}`}>
          <p className="text-xs leading-relaxed">
            {detectedDisplays.length > 1
              ? `${detectedDisplays.length} external displays were detected. Select an output and projection target.`
              : 'An external display was detected. Select an output and projection target.'}
          </p>
        </div>
      )}

      <div className={`rounded-lg border p-4 ${darkMode ? 'border-cyan-700/50 bg-cyan-500/10' : 'border-cyan-200 bg-cyan-50'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 gap-3">
            <Network className={`mt-0.5 h-4 w-4 shrink-0 ${darkMode ? 'text-cyan-300' : 'text-cyan-700'}`} />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${darkMode ? 'text-cyan-100' : 'text-cyan-900'}`}>
                Using OBS, vMix, or Wirecast?
              </p>
              <p className={`mt-1 text-xs leading-relaxed ${darkMode ? 'text-cyan-200/90' : 'text-cyan-800'}`}>
                Add LyricDisplay as a browser or web source for the main production workflow.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenIntegrationGuide?.()}
            className={`shrink-0 ${darkMode ? 'bg-transparent border-cyan-500/60 text-cyan-100 hover:bg-cyan-500/20 hover:text-white hover:border-cyan-400' : 'border-cyan-300 text-cyan-800 hover:bg-cyan-100 hover:text-cyan-900'}`}
          >
            Open Integration Guide
          </Button>
        </div>
      </div>

      <div className={`rounded-lg border p-4 space-y-3 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-center gap-2">
          <Projector className={`w-4 h-4 ${darkMode ? 'text-blue-300' : 'text-blue-700'}`} />
          <p className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Projection Setup</p>
        </div>

        <div className="space-y-2">
          <label className={`text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Output</label>
          <Select value={selectedOutput} onValueChange={setSelectedOutput}>
            <SelectTrigger className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}>
              <SelectValue placeholder="Select output" />
            </SelectTrigger>
            <SelectContent className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}>
              {outputOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label className={`text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>Projection Target</label>
          <Select value={selectedTarget} onValueChange={setSelectedTarget}>
            <SelectTrigger className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}>
              <SelectValue placeholder="Select target" />
            </SelectTrigger>
            <SelectContent className={darkMode ? 'bg-gray-700 border-gray-600 text-gray-100' : 'bg-white border-gray-300'}>
              {targetOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
            {selectedTargetInfo?.sub}
          </p>
          {targetOccupant && (
            <div className={`rounded-md px-3 py-2 text-xs ${darkMode ? 'bg-amber-500/10 text-amber-200' : 'bg-amber-50 text-amber-700'}`}>
              {projectionTargetLabel(targetOccupant)} is currently showing {formatOutputLabel(targetOccupant.outputKey)}.
              Projecting will replace it.
            </div>
          )}
        </div>
      </div>

      <div className={`rounded-lg border p-4 ${darkMode ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Monitor className={`w-4 h-4 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`} />
            <p className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>Current Status</p>
          </div>
          {loadingState && (
            <span className={`text-[11px] ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>Refreshing...</span>
          )}
        </div>

        <div className="mt-3 space-y-2">
          {activeProjections.length > 0 ? (
            activeProjections.map((entry) => {
              const isSelected = entry.outputKey === selectedOutput;
              const isStoppingThis = stoppingOutputKey === entry.outputKey;
              return (
                <div
                  key={`${entry.outputKey}-${entry.windowId || entry.displayId || entry.targetType}`}
                  className={`rounded-md px-3 py-2 flex items-center justify-between ${darkMode
                    ? (isSelected ? 'bg-green-500/15 text-green-100' : 'bg-green-500/10 text-green-200')
                    : (isSelected ? 'bg-green-100 text-green-900' : 'bg-green-50 text-green-800')
                    }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ScreenShare className="w-4 h-4 shrink-0" />
                    <span className="text-xs truncate">
                      {formatOutputLabel(entry.outputKey)} to {projectionTargetLabel(entry)}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleStopProjection(entry.outputKey)}
                    disabled={isProjecting || isStopping}
                    className={`h-7 px-2 text-xs ${darkMode ? 'text-red-200 hover:text-red-100 hover:bg-red-500/20' : 'text-red-700 hover:text-red-800 hover:bg-red-100'}`}
                  >
                    {isStoppingThis ? 'Turning Off...' : 'Turn Off'}
                  </Button>
                </div>
              );
            })
          ) : (
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              No outputs are currently projected.
            </p>
          )}
          {!activeProjection && (
            <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
              {formatOutputLabel(selectedOutput)} is not currently projected.
            </p>
          )}
          {activeProjection && (
            <div className={`rounded-md px-3 py-2 text-xs ${darkMode ? 'bg-gray-900/40 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
              Selected output target: {projectionTargetLabel(activeProjection)}
              {isActiveOnSelectedTarget ? '' : ` (changing to ${selectedTargetInfo?.label || 'selected target'})`}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-1">
        <Button
          variant="outline"
          onClick={() => onClose?.({ dismissed: true })}
          className={darkMode ? 'bg-transparent border-gray-600 text-gray-200 hover:bg-gray-800 hover:text-white hover:border-gray-500' : ''}
        >
          Close
        </Button>
        {activeProjection && (
          <Button
            variant="destructive"
            onClick={() => handleStopProjection(selectedOutput)}
            disabled={isStopping || isProjecting}
            className={darkMode ? 'bg-red-600 hover:bg-red-700 text-white border-0' : 'bg-red-600 hover:bg-red-700 text-white'}
          >
            <Power className="w-4 h-4 mr-2" />
            {stoppingOutputKey === selectedOutput ? 'Turning Off...' : 'Turn Off'}
          </Button>
        )}
        {showProjectAction && (
          <Button
            onClick={handleProject}
            disabled={isProjecting || isStopping}
            className={darkMode ? 'bg-blue-600 hover:bg-blue-700 text-white border-0' : 'bg-blue-600 hover:bg-blue-700 text-white'}
          >
            <Projector className="w-4 h-4 mr-2" />
            {projectActionLabel}
          </Button>
        )}
      </div>
    </div>
  );
};

export default ProjectOutputModal;
