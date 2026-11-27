import { storage } from '../../service/storage';
import type { ActivityLapEventPayload } from '../types/running';

const STORAGE_KEY = 'activity_manual_lap_overrides_v1';
type ManualLapOverrides = Record<string, ActivityLapEventPayload[]>;

const readOverrides = async (): Promise<ManualLapOverrides> => {
  try {
    const value = await storage.getItem(STORAGE_KEY);
    if (!value) return {};
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as ManualLapOverrides : {};
  } catch {
    return {};
  }
};

export const activityManualLapOverrides = {
  async save(activityId: string | number, events: ActivityLapEventPayload[]): Promise<void> {
    if (events.length === 0) return;
    const overrides = await readOverrides();
    overrides[String(activityId)] = events;
    await storage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  },

  async get(activityId: string | number): Promise<ActivityLapEventPayload[] | null> {
    const events = (await readOverrides())[String(activityId)];
    return Array.isArray(events) && events.length > 0 ? events : null;
  },
};
