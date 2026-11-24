import type { View } from 'react-native';

export type DashboardLaunchOrigin = { x: number; y: number };

export const getDashboardLaunchParams = (origin?: DashboardLaunchOrigin) =>
  origin
    ? { launchOriginX: String(origin.x), launchOriginY: String(origin.y) }
    : undefined;

export const getTabLaunchParams = (origin?: DashboardLaunchOrigin) =>
  origin
    ? { tabLaunchOriginX: String(origin.x), tabLaunchOriginY: String(origin.y) }
    : undefined;

export const getActivityLaunchParams = (origin?: DashboardLaunchOrigin) =>
  origin
    ? { activityLaunchOriginX: String(origin.x), activityLaunchOriginY: String(origin.y) }
    : undefined;

export const getDashboardLaunchOrigin = (params?: object): DashboardLaunchOrigin | undefined => {
  const rawX = params && 'launchOriginX' in params ? params.launchOriginX : undefined;
  const rawY = params && 'launchOriginY' in params ? params.launchOriginY : undefined;
  if (typeof rawX !== 'string' || typeof rawY !== 'string') return undefined;

  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

export const getTabLaunchOrigin = (params?: object): DashboardLaunchOrigin | undefined => {
  const rawX = params && 'tabLaunchOriginX' in params ? params.tabLaunchOriginX : undefined;
  const rawY = params && 'tabLaunchOriginY' in params ? params.tabLaunchOriginY : undefined;
  if (typeof rawX !== 'string' || typeof rawY !== 'string') return undefined;

  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

export const getActivityLaunchOrigin = (params?: object): DashboardLaunchOrigin | undefined => {
  const rawX = params && 'activityLaunchOriginX' in params ? params.activityLaunchOriginX : undefined;
  const rawY = params && 'activityLaunchOriginY' in params ? params.activityLaunchOriginY : undefined;
  if (typeof rawX !== 'string' || typeof rawY !== 'string') return undefined;

  const x = Number(rawX);
  const y = Number(rawY);
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
};

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

    navigate({ x: x + width / 2, y: y + height / 2 });
  });
};
