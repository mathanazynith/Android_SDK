import { storage } from '../../service/storage';

export type PlanBenchmarkType = '1k' | '5k' | 'cooper' | 'custom' | 'plan';

export interface PlanBenchmarkAssignment {
  workoutKey: string;
  isBenchmark: boolean;
  benchmarkType: PlanBenchmarkType;
  benchmarkTitle: string;
  customWorkoutId?: number;
  targetDistanceKm?: number;
  targetDurationMinutes?: number;
  planWorkoutTitle?: string;
  planWorkoutDate?: string;
  planWorkoutDay?: string;
  planWorkoutType?: string;
  planWorkoutDistance?: string;
  planWorkoutDuration?: string;
  planWorkoutPace?: string;
  planWorkoutSegments?: any[];
  planWorkoutSteps?: string[];
  notes?: string;
  assignedAt?: number;
}

const STORAGE_KEY = '@zy_plan_benchmark_assignments';

let cachedAssignments: Record<string, PlanBenchmarkAssignment> | null = null;
const listeners = new Set<(assignments: Record<string, PlanBenchmarkAssignment>) => void>();

const notifyListeners = (assignments: Record<string, PlanBenchmarkAssignment>) => {
  listeners.forEach((fn) => {
    try {
      fn({ ...assignments });
    } catch (err) {
      console.warn('[PlanBenchmarkStore] Listener error:', err);
    }
  });
};

export const PlanBenchmarkStore = {
  /**
   * Retrieve all saved plan benchmark assignments.
   */
  async getAssignments(): Promise<Record<string, PlanBenchmarkAssignment>> {
    if (cachedAssignments !== null) {
      return { ...cachedAssignments };
    }
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          cachedAssignments = parsed;
          return { ...cachedAssignments };
        }
      }
    } catch (err) {
      console.warn('[PlanBenchmarkStore] Error loading assignments:', err);
    }
    cachedAssignments = {};
    return {};
  },

  /**
   * Return a list of all active plan benchmark assignments.
   */
  async getActiveBenchmarkList(): Promise<PlanBenchmarkAssignment[]> {
    const all = await this.getAssignments();
    return Object.values(all).filter((item) => item && item.isBenchmark);
  },

  /**
   * Retrieve assignment for a specific workout key.
   */
  async getAssignment(workoutKey: string): Promise<PlanBenchmarkAssignment | null> {
    if (!workoutKey) return null;
    const all = await this.getAssignments();
    return all[workoutKey] || null;
  },

  /**
   * Set or update a benchmark assignment for a planned workout day.
   */
  async setAssignment(workoutKey: string, assignment: PlanBenchmarkAssignment): Promise<void> {
    if (!workoutKey) return;
    const all = await this.getAssignments();
    all[workoutKey] = {
      ...assignment,
      workoutKey,
      assignedAt: assignment.assignedAt || Date.now(),
    };
    cachedAssignments = all;
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (err) {
      console.warn('[PlanBenchmarkStore] Error saving assignment:', err);
    }
    notifyListeners(all);
  },

  /**
   * Remove a benchmark assignment, reverting the workout day back to a standard planned run.
   */
  async removeAssignment(workoutKey: string): Promise<void> {
    if (!workoutKey) return;
    const all = await this.getAssignments();
    delete all[workoutKey];
    cachedAssignments = all;
    try {
      await storage.setItem(STORAGE_KEY, JSON.stringify(all));
    } catch (err) {
      console.warn('[PlanBenchmarkStore] Error removing assignment:', err);
    }
    notifyListeners(all);
  },

  /**
   * Subscribe to changes in benchmark assignments across screens.
   */
  subscribe(listener: (assignments: Record<string, PlanBenchmarkAssignment>) => void): () => void {
    listeners.add(listener);
    if (cachedAssignments !== null) {
      listener({ ...cachedAssignments });
    }
    return () => {
      listeners.delete(listener);
    };
  },
};

export default PlanBenchmarkStore;

