import { storage } from '../../service/storage';

const STORAGE_KEY = 'activity_frontend_timing_overrides_v1';

export interface ActivityTimingOverride {
  moving_time: number;
  elapsed_time: number;
  moving_time_s: number;
  elapsed_time_s: number;
  paused_time_s: number;
  pause_count: number;
}

type TimingOverrides = Record<string, ActivityTimingOverride>;

const readOverrides = async (): Promise<TimingOverrides> => {
  try {
    const value = await storage.getItem(STORAGE_KEY);
    if (!value) return {};
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as TimingOverrides : {};
  } catch {
    return {};
  }
};

export const activityTimingOverrides = {
  async save(activityId: string | number, timing: ActivityTimingOverride): Promise<void> {
    const values = Object.values(timing);
    if (!values.every((value) => Number.isFinite(value) && value >= 0)) return;
    const overrides = await readOverrides();
    overrides[String(activityId)] = timing;
    await storage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  },

  async get(activityId: string | number): Promise<ActivityTimingOverride | null> {
    const value = (await readOverrides())[String(activityId)];
    if (!value) return null;
    const values = Object.values(value);
    return values.every((entry) => Number.isFinite(entry) && entry >= 0) ? value : null;
  },
};
