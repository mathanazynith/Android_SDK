declare module '@mapbox/polyline' {
  type Coordinate = [latitude: number, longitude: number];

  const polyline: {
    decode(encoded: string, precision?: number): Coordinate[];
    encode(coordinates: Coordinate[], precision?: number): string;
  };

  export default polyline;
}
