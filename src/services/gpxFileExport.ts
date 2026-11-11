import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { BackendActivity } from './activityApi';
import type { ActivitySubmissionPayload } from '../types/running';
import { serializeActivityAsGpx } from './gpxService';

export const shareActivityPayloadAsJson = async (
  payload: ActivitySubmissionPayload,
  activityId?: string | number | null,
): Promise<void> => {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device.');
  }

  const safeActivityId = String(activityId ?? Date.now()).replace(/[^a-zA-Z0-9_-]/g, '_');
  const file = new File(Paths.cache, `zyrun-workout-payload-${safeActivityId}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(payload, null, 2));

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Export workout payload JSON',
  });
};

export const shareActivityAsJson = async (activity: BackendActivity): Promise<void> => {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device.');
  }

  const safeActivityId = String(activity.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const file = new File(Paths.cache, `zyrun-activity-${safeActivityId}.json`);
  file.create({ overwrite: true });
  file.write(JSON.stringify(activity, null, 2));

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'Export workout JSON',
  });
};

export const shareActivityAsGpx = async (activity: BackendActivity): Promise<void> => {
  const contents = serializeActivityAsGpx(activity);
  const safeActivityId = String(activity.id).replace(/[^a-zA-Z0-9_-]/g, '_');
  const activityType = activity.activity_type.toLowerCase() === 'walk' ? 'walk' : 'run';
  const file = new File(Paths.cache, `zyrun-${activityType}-${safeActivityId}.gpx`);
  file.create({ overwrite: true });
  file.write(contents);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('File sharing is not available on this device.');
  }

  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/gpx+xml',
    UTI: 'public.xml',
    dialogTitle: 'Export workout GPX',
  });
};
