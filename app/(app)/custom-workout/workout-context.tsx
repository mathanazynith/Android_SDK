import { createContext, useContext, useState, type ReactNode } from 'react';

type TimeParts = { hours: string; minutes: string; seconds: string };
export type WorkoutStep = { title: string; duration: string; distance: string; unit: string; pace: string; repeat: number; rest: string; skipLastRest: boolean; groupId?: string; groupRepeat?: number };
export type WorkoutState = { warmUp: WorkoutStep | null; runs: WorkoutStep[]; cooldown: WorkoutStep | null };
const emptyWorkout: WorkoutState = { warmUp: null, runs: [], cooldown: null };
const timeText = (value: TimeParts) => `${value.hours || '00'}:${value.minutes || '00'}:${value.seconds || '00'}`;
const WorkoutContext = createContext<{ workout: WorkoutState; setWarmUp: (step: WorkoutStep) => void; addRun: (step: WorkoutStep) => void; addRunAfter: (index: number) => void; duplicateRunGroup: (index: number) => void; updateRunRepeat: (index: number, repeat: number) => void; updateGroupRepeat: (groupId: string, repeat: number) => void; setCooldown: (step: WorkoutStep) => void; removeWarmUp: () => void; removeRun: (index: number) => void; removeCooldown: () => void; reset: () => void } | null>(null);

export function CustomWorkoutProvider({ children }: { children: ReactNode }) {
  const [workout, setWorkout] = useState(emptyWorkout);
  return <WorkoutContext.Provider value={{ workout, setWarmUp: (step) => setWorkout((current) => ({ ...current, warmUp: step })), addRun: (step) => setWorkout((current) => ({ ...current, runs: [...current.runs, step] })), addRunAfter: (index) => setWorkout((current) => { const source = current.runs[index]; if (!source) return current; const runs = [...current.runs]; runs.splice(index + 1, 0, { ...source }); return { ...current, runs }; }), duplicateRunGroup: (index) => setWorkout((current) => { const source = current.runs[index]; if (!source) return current; const groupId = source.groupId || `run-group-${Date.now()}`; const groupedSource = { ...source, groupId, groupRepeat: source.groupRepeat || 1 }; const duplicate = { ...groupedSource }; const runs = current.runs.map((step, runIndex) => runIndex === index ? groupedSource : step); runs.splice(index + 1, 0, duplicate); return { ...current, runs }; }), updateRunRepeat: (index, repeat) => setWorkout((current) => ({ ...current, runs: current.runs.map((step, runIndex) => runIndex === index ? { ...step, repeat } : step) })), updateGroupRepeat: (groupId, repeat) => setWorkout((current) => ({ ...current, runs: current.runs.map((step) => step.groupId === groupId ? { ...step, groupRepeat: repeat } : step) })), setCooldown: (step) => setWorkout((current) => ({ ...current, cooldown: step })), removeWarmUp: () => setWorkout((current) => ({ ...current, warmUp: null })), removeRun: (index) => setWorkout((current) => ({ ...current, runs: current.runs.filter((_, runIndex) => runIndex !== index) })), removeCooldown: () => setWorkout((current) => ({ ...current, cooldown: null })), reset: () => setWorkout(emptyWorkout) }}>{children}</WorkoutContext.Provider>;
}

export function useCustomWorkout() {
  const context = useContext(WorkoutContext);
  if (!context) throw new Error('useCustomWorkout must be used inside CustomWorkoutProvider');
  return context;
}

export { timeText };
