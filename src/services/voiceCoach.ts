import * as Speech from "expo-speech";

export interface SpeechStepInfo {
  title: string;
  stepType?: "Warmup" | "Run" | "Rest" | "Cooldown" | string;
  setNumber?: number;
  totalSets?: number;
  targetText?: string;
  targetPace?: string;
}

export class VoiceCoachService {
  private isMuted: boolean = false;

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (muted) {
      this.stop();
    }
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public speak(text: string, options?: Speech.SpeechOptions): void {
    if (this.isMuted || !text || !text.trim()) return;

    try {
      if (Speech && typeof Speech.stop === "function") {
        Speech.stop();
      }
      if (Speech && typeof Speech.speak === "function") {
        Speech.speak(text.trim(), {
          language: "en-US",
          pitch: 1.0,
          rate: 0.95,
          ...options,
        });
      }
    } catch (err) {
      console.warn("[VoiceCoach] Speech playback error:", err);
    }
  }

  public stop(): void {
    try {
      if (Speech && typeof Speech.stop === "function") {
        Speech.stop();
      }
    } catch (err) {
      console.warn("[VoiceCoach] Failed to stop speech:", err);
    }
  }

  public announceStepStart(step: SpeechStepInfo): void {
    if (!step) return;
    const cue = this.buildSpeechCue(step);
    this.speak(cue);
  }

  public announceStepTransition(
    completedStep: SpeechStepInfo,
    nextStep: SpeechStepInfo
  ): void {
    const nextCue = this.buildSpeechCue(nextStep);
    const text = `${completedStep?.title || "Step"} complete. ${nextCue}`;
    this.speak(text);
  }

  public announceHalfway(step: SpeechStepInfo): void {
    this.speak(`Halfway through ${step?.title || "your step"}. Keep it up!`);
  }

  public announceWorkoutCompleted(): void {
    this.speak("Workout complete! Outstanding job!");
  }

  private buildSpeechCue(step: SpeechStepInfo): string {
    const target = step.targetText || "";
    const targetPart = target ? ` Target: ${target}.` : "";
    const pacePart = step.targetPace ? ` Pace: ${step.targetPace}.` : "";

    if (step.stepType === "Warmup") {
      return `Starting Warm Up.${targetPart}`;
    }
    if (step.stepType === "Run") {
      if (step.totalSets && step.totalSets > 1) {
        return `Starting Run, set ${step.setNumber || 1} of ${step.totalSets}.${targetPart}${pacePart}`;
      }
      return `Starting Run.${targetPart}${pacePart}`;
    }
    if (step.stepType === "Rest") {
      return `Recovery Rest for ${target || "1 minute"}. Catch your breath.`;
    }
    if (step.stepType === "Cooldown") {
      return `Starting Cool Down.${targetPart}`;
    }
    return `Starting ${step.title}.${targetPart}`;
  }
}

export const voiceCoach = new VoiceCoachService();
export default voiceCoach;
