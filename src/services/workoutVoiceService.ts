import * as Speech from 'expo-speech';
import { ActiveWorkoutSegment, BackendWorkout, WorkoutLap } from '../types/workout';

/** Voice is intentionally independent of GPS and workout transitions. */
export class WorkoutVoiceService {
  private speaking = false;
  private readonly queue: string[] = [];

  public workoutStarted(workout: BackendWorkout): void {
    this.enqueue([
      `Welcome. Today's workout is ${workout.title}.`,
      this.text(workout.notes),
      'GPS recording has started. Follow each segment as it is announced.',
    ].filter(Boolean).join(' '));
  }

  public segmentStarted(segment: ActiveWorkoutSegment): void {
    const label = segment.segmentType === 'Run'
      ? `Run interval ${segment.repeatNumber} of ${segment.totalRepeats}.`
      : `${segment.segmentType} starts now.`;
    this.enqueue([label, this.target(segment), this.text(segment.notes)].filter(Boolean).join(' '));
  }

  public segmentCompleted(lap: WorkoutLap): void {
    const label = lap.segmentType === 'Run'
      ? `Interval ${lap.repeatNumber} of ${lap.totalRepeats} complete.`
      : `${lap.segmentType} complete.`;
    this.enqueue(label);
  }

  public workoutCompleted(): void {
    this.enqueue('Workout complete. Great job.');
  }

  public stop(): void {
    this.queue.length = 0;
    this.speaking = false;
    Speech.stop();
  }

  private enqueue(message: string): void {
    if (!message.trim()) return;
    this.queue.push(message.trim());
    void this.playNext();
  }

  private async playNext(): Promise<void> {
    if (this.speaking) return;
    const message = this.queue.shift();
    if (!message) return;
    this.speaking = true;
    await new Promise<void>((resolve) => {
      Speech.speak(message, {
        language: 'en-US', rate: 0.95, pitch: 1,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
    this.speaking = false;
    void this.playNext();
  }

  private target(segment: ActiveWorkoutSegment): string {
    const pace = segment.targetPace
      ? ` Target pace ${segment.targetPace}${segment.paceUnit ? ` ${segment.paceUnit}` : ''}.`
      : '';
    if (segment.targetDistanceMeters !== null) {
      const distance = segment.targetDistanceMeters >= 1000
        ? `${(segment.targetDistanceMeters / 1000).toFixed(1)} kilometres`
        : `${Math.round(segment.targetDistanceMeters)} metres`;
      return `Target ${distance}.${pace}`;
    }
    if (segment.targetDurationSeconds !== null) {
      return `Target ${Math.round(segment.targetDurationSeconds)} seconds.${pace}`;
    }
    return '';
  }

  private text(value: string | null | undefined): string {
    return value?.trim() ?? '';
  }
}
