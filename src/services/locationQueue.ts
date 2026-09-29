import { RunningPathPoint } from '../types/running';

export interface UploadBatch {
  runId: string;
  points: RunningPathPoint[];
}

export class LocationQueue {
  private readonly queue: RunningPathPoint[] = [];
  private readonly batchSize = 25;
  private readonly flushIntervalMs = 5000;

  public enqueue(point: RunningPathPoint): void {
    this.queue.push(point);
  }

  public enqueueMany(points: RunningPathPoint[]): void {
    this.queue.push(...points);
  }

  public drainBatch(): RunningPathPoint[] {
    if (this.queue.length === 0) {
      return [];
    }

    const batch = this.queue.splice(0, this.batchSize);
    return batch;
  }

  public getPending(): RunningPathPoint[] {
    return [...this.queue];
  }

  public clear(): void {
    this.queue.length = 0;
  }

  public getPendingCount(): number {
    return this.queue.length;
  }

  public shouldFlushByBatch(): boolean {
    return this.queue.length >= this.batchSize;
  }

  public shouldFlushByTime(lastUploadAt: number | null): boolean {
    if (!lastUploadAt) {
      return false;
    }

    return Date.now() - lastUploadAt >= this.flushIntervalMs;
  }
}
