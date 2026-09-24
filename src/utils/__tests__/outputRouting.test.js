import { describe, expect, it } from 'vitest';
import { isPayloadForOutput, normalizeTargetOutputs, withTargetOutputs } from '../outputRouting';

describe('output routing', () => {
  it('treats events without routing metadata as all-output events', () => {
    expect(normalizeTargetOutputs({ title: 'Legacy note' })).toBeNull();
    expect(isPayloadForOutput({ title: 'Legacy note' }, 'output2')).toBe(true);
  });

  it('normalizes singular and array targets', () => {
    expect(normalizeTargetOutputs({ targetOutput: 'output1' })).toEqual(['output1']);
    expect(normalizeTargetOutputs({ targetOutputs: ['output2', 'output2', 'stage'] })).toEqual(['output2', 'stage']);
  });

  it('allows only the selected output to apply a targeted event', () => {
    const payload = withTargetOutputs({ title: 'Announcement' }, 'output1');
    expect(payload).toMatchObject({ targetOutput: 'output1', targetOutputs: ['output1'] });
    expect(isPayloadForOutput(payload, 'output1')).toBe(true);
    expect(isPayloadForOutput(payload, 'output2')).toBe(false);
  });
});
