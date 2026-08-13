import { RawGpsPayload } from '../types/running';
import { MockGpsSource } from './mockGpsSource';

export interface MockRunTrackerData {
	routeCoordinates: RawGpsPayload[];
	initialHeartRate: number;
	initialPaceSecondsPerKm: number;
	initialCalories: number;
	caloriesPerSecond: number;
	targetDistanceKm: number;
}

export const getMockRunTrackerData = (): MockRunTrackerData => ({
	routeCoordinates: MockGpsSource.gentleCurve(),
	initialHeartRate: 132,
	initialPaceSecondsPerKm: 445,
	initialCalories: 14,
	caloriesPerSecond: 0.16,
	targetDistanceKm: 12,
});

