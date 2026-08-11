import { RunSessionStartResponse, RunSessionStartPayload, RunStopPayload, UploadBatchPayload } from '../types/running';

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
}
