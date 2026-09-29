import { RunningCoordinate } from '../types/running';
import { calculateDistanceMeters } from './distance';

export const getCoordinateMidpoint = (
  a: RunningCoordinate,
  b: RunningCoordinate
): RunningCoordinate => ({
  latitude: a.latitude + (b.latitude - a.latitude) / 2,
  longitude: a.longitude + (b.longitude - a.longitude) / 2,
});

export const isValidCoordinate = (value: number): boolean =>
  Number.isFinite(value) && value >= -90 && value <= 90;

export const isCoordinateValid = (
  point: RunningCoordinate
): boolean => {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180
  );
};

export const compressRoute = (
  coordinates: RunningCoordinate[],
  retainWindow = 2
): RunningCoordinate[] => {
  if (coordinates.length <= retainWindow) {
    return coordinates;
  }

  const result = [coordinates[0]];
  for (let i = 1; i < coordinates.length - 1; i += retainWindow) {
    result.push(coordinates[i]);
  }
  result.push(coordinates[coordinates.length - 1]);

  return result;
};

export const getPolylineLengthMeters = (coords: RunningCoordinate[]): number => {
  let total = 0;
  for (let i = 1; i < coords.length; i += 1) {
    total += calculateDistanceMeters(coords[i - 1], coords[i]);
  }

  return total;
};
