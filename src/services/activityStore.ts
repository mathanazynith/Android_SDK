import { RawGpsPayload } from '../types/running';

export interface ActivityRecord {
  id: string;
  date: string; // ISO
  displayDate: string; // e.g., 'Mon, Aug 23'
  workoutName: string;
  distanceMeters: number;
  paceSecondsPerKm: number;
  durationSeconds: number;
  calories: number;
  averageHeartRate?: number;
  routeCoordinates?: RawGpsPayload[];
}

const activities: ActivityRecord[] = [];

export const ActivityStore = {
  add(record: ActivityRecord) {
    activities.unshift(record);
  },
  list(): ActivityRecord[] {
    return activities;
  },
  clear() {
    activities.length = 0;
  },
};

export default ActivityStore;
