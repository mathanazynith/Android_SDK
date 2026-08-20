import * as Speech from 'expo-speech';

import {
  ActiveWorkoutSegment,
  BackendWorkout,
  WorkoutLap,
} from '../types/workout';

export class WorkoutVoiceService {

  private speaking = false;

  private readonly queuedMessages: {
    message: string;
    resolve: () => void;
  }[] = [];

  /**
   * Queue speech instead of interrupting the previous announcement. Workout
   * state and GPS remain independent: callers deliberately do not await this.
   */
  public speak(
    message: string,
  ): Promise<void> {

    const trimmed = message.trim();

    if (!trimmed) {
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.queuedMessages.push({
        message: trimmed,
        resolve,
      });
      void this.playNext();
    });
  }

  private async playNext(): Promise<void> {

    if (this.speaking) {
      return;
    }

    const next = this.queuedMessages.shift();

    if (!next) {
      return;
    }

    this.speaking = true;

    try {
      await new Promise<void>((resolve) => {
        Speech.speak(
          next.message,
          {
            language: 'en-US',

            rate: 0.95,

            pitch: 1.0,

            onDone: () => {
              this.speaking = false;
              resolve();
            },

            onStopped: () => {
              this.speaking = false;
              resolve();
            },

            onError: () => {
              this.speaking = false;
              resolve();
            },
          },
        );
      });

    } catch {
      // A TTS error must not block the next announcement or workout tracking.
    } finally {
      this.speaking = false;
      next.resolve();
      void this.playNext();
    }
  }

  public workoutStarted(
    workout: BackendWorkout,
  ): void {

    const title = this.cleanText(workout.title);
    const notes = this.cleanText(workout.notes);

    void this.speak(
      [
        title ? `Welcome. Today's workout is ${title}.` : 'Welcome. Your workout is starting.',
        notes,
        'GPS recording has started. Follow each segment as it is announced.',
      ].filter(Boolean).join(' '),
    );
  }

  public segmentStarted(
    segment: ActiveWorkoutSegment,
  ): void {

    const instructions = this.cleanText(segment.notes);
    let message = '';

    switch (
      segment.segmentType
    ) {

      case 'Warmup':

        message =
          `Warm up starts now. ` +
          `${this.formatTarget(segment)} ` +
          instructions;

        break;

      case 'Run':

        message =
          `Run interval ` +
          `${segment.repeatNumber} ` +
          `of ${segment.totalRepeats}. ` +
          `${this.formatTarget(segment)} ` +
          instructions;

        break;

      case 'Cooldown':

        message =
          `Cooldown starts now. ` +
          `${this.formatTarget(segment)} ` +
          instructions;

        break;

      default:

        return;
    }

    void this.speak(message);
  }

  public segmentCompleted(
    lap: WorkoutLap,
  ): void {

    let message = '';

    switch (
      lap.segmentType
    ) {

      case 'Warmup':

        message =
          'Warm up complete.';

        break;

      case 'Run':

        message =
          `Interval ${lap.repeatNumber} complete.`;

        break;

      case 'Cooldown':

        message =
          'Cooldown complete. Workout finished.';

        break;

      default:

        return;
    }

    void this.speak(message);
  }

  public restStarted(
    seconds: number,
  ): void {

    const rounded =
      Math.max(
        0,
        Math.round(seconds),
      );

    void this.speak(
      `Rest for ${rounded} seconds.`,
    );
  }

  public workoutCompleted(): void {

    void this.speak(
      'Workout complete. Great job.',
    );
  }

  public stop(): void {

    this.queuedMessages.splice(0);
    Speech.stop();

    this.speaking = false;
  }

  private formatTarget(
    segment: ActiveWorkoutSegment,
  ): string {

    if (
      segment.targetDistanceMeters !== null
    ) {

      const distance =
        segment.targetDistanceMeters;

      if (
        distance >= 1000
      ) {

        return (
          `Target ${(
            distance / 1000
          ).toFixed(1)} kilometers.${this.formatPace(segment)}`
        );
      }

      return (
        `Target ${Math.round(distance)} meters.${this.formatPace(segment)}`
      );
    }

    if (
      segment.targetDurationSeconds !== null
    ) {

      const minutes =
        Math.floor(
          segment.targetDurationSeconds /
          60,
        );

      return (
        `Target ${minutes} minutes.${this.formatPace(segment)}`
      );
    }

    return '';
  }

  private formatPace(
    segment: ActiveWorkoutSegment,
  ): string {

    if (!segment.targetPace) {
      return '';
    }

    return ` Target pace ${segment.targetPace}${
      segment.paceUnit ? ` ${segment.paceUnit}` : ''
    }.`;
  }

  private cleanText(
    value: string | null | undefined,
  ): string {

    return value?.trim() ?? '';
  }
}
