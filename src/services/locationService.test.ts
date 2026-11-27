import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocationService } from './locationService';

const locationPermissionMocks = vi.hoisted(() => ({
  getForegroundPermissionsAsync: vi.fn(),
  requestForegroundPermissionsAsync: vi.fn(),
}));

vi.mock('expo-location', () => locationPermissionMocks);
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

describe('LocationService foreground permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses an existing while-in-use foreground grant without requesting again', async () => {
    locationPermissionMocks.getForegroundPermissionsAsync.mockResolvedValue({ granted: true });

    await expect(LocationService.requestForegroundPermissions()).resolves.toBe(true);

    expect(locationPermissionMocks.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('requests foreground permission when it has not already been granted', async () => {
    locationPermissionMocks.getForegroundPermissionsAsync.mockResolvedValue({ granted: false });
    locationPermissionMocks.requestForegroundPermissionsAsync.mockResolvedValue({ granted: true });

    await expect(LocationService.requestForegroundPermissions()).resolves.toBe(true);

    expect(locationPermissionMocks.requestForegroundPermissionsAsync).toHaveBeenCalledOnce();
  });
});
