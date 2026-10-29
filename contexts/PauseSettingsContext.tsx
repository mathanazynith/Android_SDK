import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { storage } from '../service/storage';

const PAUSE_SETTINGS_KEY = 'zyrun:pause-settings';

export interface PauseSettings {
  manualPauseEnabled: boolean;
  autoPauseEnabled: boolean;
  voiceAlertsEnabled: boolean;
}

interface PauseSettingsContextValue extends PauseSettings {
  isLoaded: boolean;
  setManualPauseEnabled: (enabled: boolean) => void;
  setAutoPauseEnabled: (enabled: boolean) => void;
  setVoiceAlertsEnabled: (enabled: boolean) => void;
}

const DEFAULT_SETTINGS: PauseSettings = {
  manualPauseEnabled: true,
  autoPauseEnabled: false,
  voiceAlertsEnabled: false,
};

const PauseSettingsContext = createContext<PauseSettingsContextValue>({
  ...DEFAULT_SETTINGS,
  isLoaded: false,
  setManualPauseEnabled: () => undefined,
  setAutoPauseEnabled: () => undefined,
  setVoiceAlertsEnabled: () => undefined,
});

export function PauseSettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [isLoaded, setIsLoaded] = useState(false);
  const settingsRef = useRef(DEFAULT_SETTINGS);
  const writeQueueRef = useRef(Promise.resolve());

  useEffect(() => {
    let active = true;
    void storage.getItem(PAUSE_SETTINGS_KEY)
      .then((stored) => {
        if (!active || !stored) return;
        try {
          const parsed = JSON.parse(stored) as Partial<PauseSettings>;
          const nextSettings = {
            manualPauseEnabled: true,
            autoPauseEnabled: parsed.autoPauseEnabled === true,
            voiceAlertsEnabled: parsed.voiceAlertsEnabled === true,
          };
          settingsRef.current = nextSettings;
          setSettings(nextSettings);
        } catch {
          settingsRef.current = DEFAULT_SETTINGS;
        }
      })
      .catch((error) => console.warn('[PauseSettings] Unable to load preferences', error))
      .finally(() => {
        if (active) setIsLoaded(true);
      });

    return () => { active = false; };
  }, []);

  const updateSetting = useCallback((key: keyof PauseSettings, enabled: boolean) => {
    if (!isLoaded) return;
    if (key === 'manualPauseEnabled') return;
    const nextSettings = { ...settingsRef.current, [key]: enabled };

    settingsRef.current = nextSettings;
    setSettings(nextSettings);
    writeQueueRef.current = writeQueueRef.current
      .then(() => storage.setItem(PAUSE_SETTINGS_KEY, JSON.stringify(nextSettings)))
      .catch((error) => console.warn('[PauseSettings] Unable to save preferences', error));
  }, [isLoaded]);

  const setManualPauseEnabled = useCallback(
    (enabled: boolean) => updateSetting('manualPauseEnabled', enabled),
    [updateSetting],
  );
  const setAutoPauseEnabled = useCallback(
    (enabled: boolean) => updateSetting('autoPauseEnabled', enabled),
    [updateSetting],
  );
  const setVoiceAlertsEnabled = useCallback(
    (enabled: boolean) => updateSetting('voiceAlertsEnabled', enabled),
    [updateSetting],
  );

  return (
    <PauseSettingsContext.Provider
      value={{ ...settings, isLoaded, setManualPauseEnabled, setAutoPauseEnabled, setVoiceAlertsEnabled }}
    >
      {children}
    </PauseSettingsContext.Provider>
  );
}

export function usePauseSettings() {
  return useContext(PauseSettingsContext);
}