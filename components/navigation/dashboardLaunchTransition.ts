import type { View } from 'react-native';

export type DashboardLaunchOrigin = {
  x: number;
  y: number;
  width?: number;
  height?: number;
};

const getOriginParams = (origin?: DashboardLaunchOrigin, prefix = 'launchOrigin') =>
  origin
    ? {
        [`${prefix}X`]: String(origin.x),
        [`${prefix}Y`]: String(origin.y),
        ...(origin.width && origin.height
          ? {
              [`${prefix}Width`]: String(origin.width),
              [`${prefix}Height`]: String(origin.height),
            }
          : {}),
      }
    : undefined;

const parseOrigin = (params: object | undefined, prefix: string): DashboardLaunchOrigin | undefined => {
  const values = params as Record<string, unknown> | undefined;
  const rawX = values?.[`${prefix}X`];
  const rawY = values?.[`${prefix}Y`];
  if (typeof rawX !== 'string' || typeof rawY !== 'string') return undefined;

  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return undefined;

  const rawWidth = values?.[`${prefix}Width`];
  const rawHeight = values?.[`${prefix}Height`];
  const width = typeof rawWidth === 'string' ? Number(rawWidth) : undefined;
  const height = typeof rawHeight === 'string' ? Number(rawHeight) : undefined;
  return width && height && Number.isFinite(width) && Number.isFinite(height)
    ? { x, y, width, height }
    : { x, y };
};

export const getDashboardLaunchParams = (origin?: DashboardLaunchOrigin) =>
  getOriginParams(origin);

export const getTabLaunchParams = (origin?: DashboardLaunchOrigin) =>
  getOriginParams(origin, 'tabLaunchOrigin');

export const getActivityLaunchParams = (origin?: DashboardLaunchOrigin) =>
  getOriginParams(origin, 'activityLaunchOrigin');

export const getDashboardLaunchOrigin = (params?: object): DashboardLaunchOrigin | undefined =>
  parseOrigin(params, 'launchOrigin');

export const getTabLaunchOrigin = (params?: object): DashboardLaunchOrigin | undefined =>
  parseOrigin(params, 'tabLaunchOrigin');

export const getActivityLaunchOrigin = (params?: object): DashboardLaunchOrigin | undefined =>
  parseOrigin(params, 'activityLaunchOrigin');

export const launchFromView = (
  source: View | null,
  navigate: (origin?: DashboardLaunchOrigin) => void,
) => {
  if (!source) {
    navigate();
    return;
  }

  source.measureInWindow((x, y, width, height) => {
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
      navigate();
      return;
    }

    navigate({ x: x + width / 2, y: y + height / 2, width, height });
  });
};
