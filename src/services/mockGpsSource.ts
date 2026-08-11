import { RawGpsPayload } from '../types/running';

export class MockGpsSource {
  private readonly route: Array<RawGpsPayload>;
  private index = 0;

  constructor(route: Array<RawGpsPayload>) {
    this.route = route;
  }

  public next(): RawGpsPayload | null {
    if (this.index >= this.route.length) {
      return null;
    }

    const next = this.route[this.index];
    this.index += 1;
    return next;
  }

  public reset(): void {
    this.index = 0;
  }

  public static straight(): Array<RawGpsPayload> {
    return [
      { latitude: 13.006700, longitude: 80.220600, accuracy: 4, altitude: 12, speed: 2.8, heading: 90, timestamp: Date.now() },
      { latitude: 13.006800, longitude: 80.220600, accuracy: 4, altitude: 12, speed: 2.8, heading: 90, timestamp: Date.now() + 1000 },
      { latitude: 13.006900, longitude: 80.220600, accuracy: 5, altitude: 12, speed: 2.8, heading: 90, timestamp: Date.now() + 2000 },
      { latitude: 13.007000, longitude: 80.220600, accuracy: 5, altitude: 12, speed: 2.8, heading: 90, timestamp: Date.now() + 3000 },
    ];
  }

  public static gentleCurve(): Array<RawGpsPayload> {
    return [
      { latitude: 13.006700, longitude: 80.220600, accuracy: 4, altitude: 12, speed: 2.9, heading: 90, timestamp: Date.now() },
      { latitude: 13.006740, longitude: 80.220660, accuracy: 4, altitude: 12, speed: 2.9, heading: 92, timestamp: Date.now() + 1000 },
      { latitude: 13.006790, longitude: 80.220720, accuracy: 4, altitude: 12, speed: 2.9, heading: 96, timestamp: Date.now() + 2000 },
      { latitude: 13.006840, longitude: 80.220770, accuracy: 5, altitude: 12, speed: 2.8, heading: 100, timestamp: Date.now() + 3000 },
    ];
  }

  public static ninetyTurn(): Array<RawGpsPayload> {
    return [
      { latitude: 13.006700, longitude: 80.220600, accuracy: 4, altitude: 12, speed: 2.7, heading: 90, timestamp: Date.now() },
      { latitude: 13.006760, longitude: 80.220680, accuracy: 4, altitude: 12, speed: 2.8, heading: 88, timestamp: Date.now() + 1000 },
      { latitude: 13.006820, longitude: 80.220750, accuracy: 4, altitude: 12, speed: 2.8, heading: 120, timestamp: Date.now() + 2000 },
      { latitude: 13.006850, longitude: 80.220850, accuracy: 5, altitude: 12, speed: 2.8, heading: 130, timestamp: Date.now() + 3000 },
    ];
  }
}
