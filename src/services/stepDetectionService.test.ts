import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StepDetectionService } from './stepDetectionService';

const pedometerMock = vi.hoisted(() => ({
  listener: null as ((result: { steps: number }) => void) | null,
  remove: vi.fn(),
}));

vi.mock('expo-sensors', () => ({
  Pedometer: {
    isAvailableAsync: vi.fn(async () => true),
    requestPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
    watchStepCount: vi.fn((listener: (result: { steps: number }) => void) => {
      pedometerMock.listener = listener;
      return { remove: pedometerMock.remove };
    }),
  },
}));

describe('StepDetectionService', () => {
  beforeEach(() => {
    pedometerMock.listener = null;
    vi.clearAllMocks();
  });

  it('emits deltas when the pedometer reports cumulative subscription counts', async () => {
    const service = new StepDetectionService();
    const onStepDelta = vi.fn();
    await service.start(onStepDelta);

    const listener = pedometerMock.listener;
    if (!listener) throw new Error('Pedometer listener was not registered');
    listener({ steps: 125 });
    listener({ steps: 127 });
    listener({ steps: 127 });

    expect(onStepDelta.mock.calls).toEqual([[125], [2]]);

    service.stop();
    expect(pedometerMock.remove).toHaveBeenCalledOnce();
  });
});
