import { ActivitySubmissionPayload, RunSessionStartResponse, RunSessionStartPayload, RunStopPayload, UploadBatchPayload } from '../types/running';
import api from '../../service/api';

// `service/api.ts` supplies the /api/v1 base URL and authenticated Bearer
// token, so this resolves to POST /api/v1/rundata/upload/ by default.
const ACTIVITY_UPLOAD_PATH = (
  process.env.EXPO_PUBLIC_ACTIVITY_UPLOAD_PATH || '/rundata/upload/'
).trim();

export class RunningApiClient {
  public async startRun(userId: string, startedAtIso: string): Promise<RunSessionStartResponse> {
    const payload: RunSessionStartPayload = {
      user_id: userId,
      started_at: startedAtIso,
      run_id: 'RUN-12345',
    };

    console.log('[RunningApiClient] POST /runs/start', JSON.stringify(payload, null, 2));

    return {
      success: true,
      run_id: 'RUN-12345',
    };
  }

  public async uploadBatch(runId: string, points: UploadBatchPayload['points']): Promise<boolean> {
    const payload: UploadBatchPayload = {
      run_id: runId,
      points,
    };

    console.log('[RunningApiClient] POST /runs/upload', JSON.stringify(payload, null, 2));
    console.log('[RunningApiClient] Upload request body', JSON.stringify(payload, null, 2));
    return true;
  }

  public async stopRun(payload: RunStopPayload): Promise<boolean> {
    console.log('[RunningApiClient] POST /runs/stop', JSON.stringify(payload, null, 2));
    return true;
  }

  /** Send the optimized final activity as JSON to Django's UploadActivityAPIView. */
  public async submitActivity(payload: ActivitySubmissionPayload): Promise<boolean> {
    console.log(`[RunningApiClient] POST ${ACTIVITY_UPLOAD_PATH}`, JSON.stringify(payload, null, 2));

    const response = await api.post(ACTIVITY_UPLOAD_PATH, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    console.log('[RunningApiClient] Activity upload response', JSON.stringify(response.data, null, 2));
    return response.status >= 200 && response.status < 300;
  }
}
