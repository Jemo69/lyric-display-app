import React, { useMemo, useState } from 'react';
import { X, GraduationCap, Sparkles, Copy, Check, ArrowLeft, ArrowRight, RotateCcw } from 'lucide-react';
import {
  TOUR_STEPS,
  AI_USE_CASES,
  buildAgentPrompt,
  markOnboardingSeen,
} from './onboardingContent';

export default function OnboardingModal({ darkMode, onClose, initialMode = 'tour' }) {
  const [mode, setMode] = useState(initialMode === 'ai' ? 'ai' : 'tour');
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedCase, setSelectedCase] = useState(AI_USE_CASES[0].id);
  const [copied, setCopied] = useState(false);

  const step = TOUR_STEPS[Math.min(stepIndex, TOUR_STEPS.length - 1)];
  const useCase = useMemo(
    () => AI_USE_CASES.find((c) => c.id === selectedCase) || AI_USE_CASES[0],
    [selectedCase]
  );
  const agentPrompt = useMemo(() => buildAgentPrompt(useCase.prompt), [useCase]);

  const close = () => {
    markOnboardingSeen();
    onClose?.();
  };

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(agentPrompt);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = agentPrompt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const panel = darkMode ? 'bg-gray-900 text-gray-100 border-gray-700' : 'bg-white text-gray-900 border-gray-200';
  const muted = darkMode ? 'text-gray-400' : 'text-gray-600';
  const card = darkMode ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Onboarding">
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      <div className={`relative w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-xl border shadow-2xl ${panel}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-0">
          <h2 className="text-lg font-bold">Welcome to Selah 👋</h2>
          <button onClick={close} className="p-1.5 rounded hover:bg-black/10" aria-label="Close onboarding">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mode switch */}
        <div className="px-5 pt-3">
          <div className={`flex rounded-lg overflow-hidden border p-1 gap-1 ${darkMode ? 'border-gray-700 bg-gray-950/40' : 'border-gray-200 bg-gray-100'}`}>
            <button
              onClick={() => setMode('tour')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-md transition-colors ${mode === 'tour' ? 'bg-blue-600 text-white' : muted}`}
            >
              <GraduationCap className="h-4 w-4" /> Guided tour
            </button>
            <button
              onClick={() => setMode('ai')}
              className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-semibold rounded-md transition-colors ${mode === 'ai' ? 'bg-blue-600 text-white' : muted}`}
            >
              <Sparkles className="h-4 w-4" /> AI setup helper
            </button>
          </div>
        </div>

        {mode === 'tour' ? (
          <div className="p-5 space-y-4">
            {/* Progress */}
            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => setStepIndex(i)}
                  aria-label={`Go to step ${i + 1}: ${s.title}`}
                  className={`h-1.5 flex-1 rounded-full transition-colors ${i === stepIndex ? 'bg-blue-600' : i < stepIndex ? 'bg-blue-300' : darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}
                />
              ))}
            </div>

            <div className={`rounded-lg border p-5 space-y-3 ${card}`}>
              <div className="text-4xl">{step.icon}</div>
              <div className={`text-xs font-bold uppercase tracking-wide ${muted}`}>
                Step {stepIndex + 1} of {TOUR_STEPS.length}
              </div>
              <h3 className="text-base font-bold">{step.title}</h3>
              <p className={`text-sm leading-relaxed ${muted}`}>{step.body}</p>
              <p className="text-sm font-medium text-blue-500">💡 {step.tip}</p>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => setStepIndex((i) => Math.max(0, i - 1))}
                disabled={stepIndex === 0}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium rounded hover:bg-black/10 disabled:opacity-40"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>
              {stepIndex < TOUR_STEPS.length - 1 ? (
                <button
                  onClick={() => setStepIndex((i) => i + 1)}
                  className="flex items-center gap-1 px-4 py-2 text-sm font-semibold rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  Next <ArrowRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={close}
                  className="px-4 py-2 text-sm font-semibold rounded bg-green-600 text-white hover:bg-green-700"
                >
                  Start using Selah →
                </button>
              )}
            </div>

            <button
              onClick={() => { setMode('ai'); }}
              className={`w-full text-center text-xs underline hover:no-underline ${muted}`}
            >
              Prefer an AI to plan your setup? Try the AI setup helper →
            </button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <p className={`text-sm leading-relaxed ${muted}`}>
              Pick what you're setting up, copy the prompt, and paste it into any AI assistant
              (Pi, OpenCode, ChatGPT, Codex, Antigravity, Copilot…). It knows how Selah works and
              will build you a step-by-step plan with creative ideas.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {AI_USE_CASES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCase(c.id)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors ${selectedCase === c.id ? 'bg-blue-600 text-white border-blue-600' : `${card} hover:border-blue-400`}`}
                >
                  {c.label}
                </button>
              ))}
            </div>

            <div className={`rounded-lg border p-3 ${card}`}>
              <div className={`text-[11px] font-bold uppercase tracking-wide mb-1 ${muted}`}>
                Your prompt — {useCase.label}
              </div>
              <pre className={`text-xs leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto ${muted}`}>
                {agentPrompt}
              </pre>
            </div>

            <div className="flex gap-2">
              <button
                onClick={copyPrompt}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? 'Copied!' : 'Copy prompt'}
              </button>
              <button
                onClick={() => { setMode('tour'); setStepIndex(0); }}
                title="Replay guided tour"
                className={`flex items-center gap-1 px-3 py-2.5 text-sm rounded-lg border ${card}`}
              >
                <RotateCcw className="h-4 w-4" /> Tour
              </button>
            </div>
            <p className={`text-xs ${muted}`}>
              Paste into your AI chat, answer its questions, then bring the plan back here and run it step by step.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
