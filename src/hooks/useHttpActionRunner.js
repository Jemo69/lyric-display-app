import React, { useCallback } from 'react';
import useToast from './useToast';
import useModal from './useModal';
import HttpActionVariableForm from '../components/HttpActionVariableForm';
import { executeHttpAction, inspectHttpActionConfig } from '../utils/httpAction';
import { normalizeHttpVariables } from '../utils/httpActionVariables';

const ERROR_TITLES = {
  url: 'Invalid URL',
  headers: 'Invalid Headers JSON',
  body: 'Invalid Body JSON',
  method: 'Invalid method',
  variables: 'Check the variables',
};

const titleForField = (field) => ERROR_TITLES[field] || 'Invalid HTTP config';

/**
 * Single entry point for firing an HTTP action, used by both the header pill and
 * Settings → HTTP Actions so the two surfaces behave identically.
 *
 * An action with no variables fires immediately, exactly as before. An action
 * that declares variables opens an input prompt first; the answers are then
 * substituted into the URL, headers and body before the request is sent.
 */
export default function useHttpActionRunner() {
  const { showToast } = useToast();
  const { showModal } = useModal();

  return useCallback(
    async (button, { darkMode = false, onInvalid } = {}) => {
      const label = button?.label || 'HTTP';

      const preflight = inspectHttpActionConfig(button || {});
      if (!preflight.valid) {
        const { field, error } = preflight;
        showToast({ title: titleForField(field), message: error, variant: 'error' });
        onInvalid?.(field);
        return { success: false, validationError: true, field, error };
      }

      const declared = normalizeHttpVariables(button?.variables);
      let values = null;

      if (declared.length) {
        const result = await showModal({
          title: label,
          headerDescription: `${declared.length} value${declared.length === 1 ? '' : 's'} needed before sending`,
          body: ({ close }) =>
            React.createElement(HttpActionVariableForm, {
              variables: declared,
              request: button,
              darkMode,
              onSubmit: (submitted) => close({ confirmed: true, values: submitted }),
              onCancel: () => close({ dismissed: true }),
            }),
          // The form renders its own Cancel / Send buttons, so no modal footer.
          actions: [],
          dismissible: true,
          allowBackdropClose: true,
          size: 'sm',
        });
        if (!result || result.dismissed || !result.confirmed) {
          return { skipped: true };
        }
        values = result.values;
      }

      const res = await executeHttpAction({ ...button, values });

      if (res.validationError) {
        const field = res.field;
        showToast({
          title: field === 'variables' ? 'Input needed' : `${titleForField(field)} — blocked`,
          message: res.error,
          variant: 'error',
        });
        onInvalid?.(field);
        return res;
      }
      if (res.success) {
        showToast({ title: 'HTTP sent', message: `${label} → ${res.status || 'OK'}`, variant: 'success' });
      } else {
        showToast({
          title: 'HTTP failed',
          message: res.error || `HTTP ${res.status || 'error'} ${res.statusText || ''}`.trim(),
          variant: 'error',
        });
      }
      return res;
    },
    [showModal, showToast]
  );
}
