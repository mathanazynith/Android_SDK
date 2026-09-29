import { storage } from '../../service/storage';

const BENCHMARK_STORAGE_KEY = '@zy_benchmark_workout_ids';

let cachedIds: number[] | null = null;
const listeners = new Set<(ids: number[]) => void>();

const notifyListeners = (ids: number[]) => {
  listeners.forEach((fn) => {
    try {
      fn(ids);
    } catch (err) {
      console.warn('[BenchmarkStore] Listener error:', err);
    }
  });
};

export const BenchmarkStore = {
  /**
   * Retrieve all saved benchmark workout IDs.
   */
  async getBenchmarkIds(): Promise<number[]> {
    if (cachedIds !== null) {
      return [...cachedIds];
    }
    try {
      const raw = await storage.getItem(BENCHMARK_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          cachedIds = parsed.map(Number).filter((n) => !isNaN(n) && n > 0);
          return [...cachedIds];
        }
      }
    } catch (err) {
      console.warn('[BenchmarkStore] Error reading benchmark IDs:', err);
    }
    cachedIds = [];
    return [];
  },

  /**
   * Check if a specific workout ID is designated as a benchmark.
   */
  async isBenchmark(id: number): Promise<boolean> {
    if (!id || id <= 0) return false;
    const ids = await this.getBenchmarkIds();
    return ids.includes(id);
  },

  /**
   * Set or unset a workout as a benchmark.
   */
  async setBenchmark(id: number, isBench: boolean): Promise<void> {
    if (!id || id <= 0) return;
    const current = await this.getBenchmarkIds();
    let updated: number[];
    if (isBench) {
      if (current.includes(id)) return;
      updated = [...current, id];
    } else {
      updated = current.filter((item) => item !== id);
    }
    cachedIds = updated;
    try {
      await storage.setItem(BENCHMARK_STORAGE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.warn('[BenchmarkStore] Error saving benchmark IDs:', err);
    }
    notifyListeners(updated);
  },

  /**
   * Toggle the benchmark status of a workout. Returns true if now a benchmark, false otherwise.
   */
  async toggleBenchmark(id: number): Promise<boolean> {
    if (!id || id <= 0) return false;
    const currentlyBench = await this.isBenchmark(id);
    const nextState = !currentlyBench;
    await this.setBenchmark(id, nextState);
    return nextState;
  },

  /**
   * Subscribe to changes in benchmark workout IDs.
   */
  subscribe(listener: (ids: number[]) => void): () => void {
    listeners.add(listener);
    // Trigger initial notification with current cache if available
    if (cachedIds !== null) {
      listener([...cachedIds]);
    }
    return () => {
      listeners.delete(listener);
    };
  },
};

export default BenchmarkStore;

