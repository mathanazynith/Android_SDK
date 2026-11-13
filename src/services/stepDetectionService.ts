import { Pedometer } from 'expo-sensors';

type PedometerSubscription = ReturnType<typeof Pedometer.watchStepCount>;

/**
 * Confirms that the phone detected steps while a workout is active.
 *
 * A pedometer provides step counts, not an indoor position, so it never
 * manufactures GPS coordinates.
 */
export class StepDetectionService {
  private subscription: PedometerSubscription | null = null;
  private lastReportedStepCount = 0;

  public async start(onStepDelta: (steps: number) => void): Promise<void> {
    this.stop();
    this.lastReportedStepCount = 0;

    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      console.warn('[LocationManager] Pedometer unavailable; movement gate will rely on activity recognition');
      return;
    }

    const permission = await Pedometer.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      console.warn('[LocationManager] Pedometer permission not granted; movement gate will rely on activity recognition');
      return;
    }

    this.subscription = Pedometer.watchStepCount(({ steps }) => {
      const stepDelta = Math.max(0, steps - this.lastReportedStepCount);
      this.lastReportedStepCount = Math.max(this.lastReportedStepCount, steps);
      if (stepDelta > 0) onStepDelta(stepDelta);
    });
  }

  public stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }

  /** A subscription is the only reliable indication that step evidence can be required. */
  public isAvailable(): boolean {
    return this.subscription !== null;
  }
}
