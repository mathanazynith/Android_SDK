import { useWindowDimensions } from "react-native";

const DESIGN_WIDTH = 375;
const MIN_SCALE = 0.9;
const MAX_SCALE = 1.12;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

export const responsiveScale = (width: number) =>
  clamp(width / DESIGN_WIDTH, MIN_SCALE, MAX_SCALE);

export const responsiveValue = (width: number, value: number) =>
  Math.round(value * responsiveScale(width));

export const responsiveFont = (width: number, value: number, min = value * 0.9, max = value * 1.08) =>
  clamp(value * responsiveScale(width), min, max);

export function useResponsive() {
  const { width, height, fontScale, scale } = useWindowDimensions();
  const factor = responsiveScale(width);

  return {
    width,
    height,
    fontScale,
    scale,
    factor,
    spacing: (value: number) => responsiveValue(width, value),
    fontSize: (value: number, min?: number, max?: number) => responsiveFont(width, value, min, max),
  };
}
