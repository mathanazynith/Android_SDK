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
  private stepCount = 0;

  public async start(onStepCount: (steps: number) => void): Promise<void> {
    this.stop();

    const available = await Pedometer.isAvailableAsync();
    if (!available) {
      console.warn('[LocationManager] Pedometer unavailable; GPS-only tracking continues');
      return;
    }

    const permission = await Pedometer.requestPermissionsAsync();
    if (permission.status !== 'granted') {
      console.warn('[LocationManager] Pedometer permission not granted; GPS-only tracking continues');
      return;
    }

    this.subscription = Pedometer.watchStepCount(({ steps }) => {
      this.stepCount += steps;
      console.log('[LocationManager] Motion steps detected: +' + steps + ', total:' + this.stepCount);
      onStepCount(this.stepCount);
    });
    console.log('[LocationManager] Pedometer motion tracking started');
  }

  public stop(): void {
    this.subscription?.remove();
    this.subscription = null;
  }
}
