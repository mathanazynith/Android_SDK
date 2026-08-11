import { RunSessionStartResponse, RunSessionStartPayload, RunStopPayload, UploadBatchPayload } from '../types/running';

export class RunningApiClient {
  public async startRun(userId: string, startedAtIso: string): Promise<RunSessionStartResponse> {
    const payload: RunSessionStartPayload = {
      user_id: userId,
      started_at: startedAtIso,
    };

    return {
      success: true,
      run_id: 'RUN-12345',
    };
  }

  public async uploadBatch(runId: string, points: UploadBatchPayload['points']): Promise<boolean> {
    return true;
  }

  public async stopRun(payload: RunStopPayload): Promise<boolean> {
    return true;
  }
}
