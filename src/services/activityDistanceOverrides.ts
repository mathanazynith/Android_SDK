import { storage } from '../../service/storage';

const STORAGE_KEY = 'activity_sdk_distance_overrides_v1';

type DistanceOverrides = Record<string, number>;

const readOverrides = async (): Promise<DistanceOverrides> => {
  try {
    const value = await storage.getItem(STORAGE_KEY);
    if (!value) return {};
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed as DistanceOverrides : {};
  } catch {
    return {};
  }
};

/**
 * The upload endpoint currently recalculates distance from GPS geometry and
 * ignores the SDK's accepted-distance fields. Preserve the SDK total locally
 * by activity id, so this device's Activity card/detail never replace it with
 * a larger GPS-jitter total.
 */
export const activityDistanceOverrides = {
  async save(activityId: string | number, distanceMeters: number): Promise<void> {
    if (!Number.isFinite(distanceMeters) || distanceMeters < 0) return;
    const overrides = await readOverrides();
    overrides[String(activityId)] = distanceMeters;
    await storage.setItem(STORAGE_KEY, JSON.stringify(overrides));
  },

  async get(activityId: string | number): Promise<number | null> {
    const value = (await readOverrides())[String(activityId)];
    return Number.isFinite(value) && value >= 0 ? value : null;
  },
};
