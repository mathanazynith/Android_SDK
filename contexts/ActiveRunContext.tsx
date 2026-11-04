import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  type BackgroundLocationSessionState,
  getBackgroundLocationSession,
  subscribeToBackgroundLocationSession,
} from '../src/services/backgroundLocationTask';
import { flushActiveRunJournal, readActiveRunJournal } from '../src/services/activeRunJournal';

const ActiveRunContext = createContext<BackgroundLocationSessionState | null>(null);

export function ActiveRunProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<BackgroundLocationSessionState | null>(null);

  useEffect(() => {
    let mounted = true;
    let updateVersion = 0;
    let currentRunId: string | null = null;
    let validatedRunId: string | null = null;
    let validatingRunId: string | null = null;
    let latestSession: BackgroundLocationSessionState | null = null;
    let hasReceivedSessionUpdate = false;

    const applySession = (nextSession: BackgroundLocationSessionState | null) => {
      if (!nextSession?.active || !nextSession.runId) {
        currentRunId = null;
        validatedRunId = null;
        validatingRunId = null;
        latestSession = null;
        updateVersion += 1;
        if (mounted) setSession(null);
        return;
      }

      latestSession = nextSession;
      if (currentRunId === nextSession.runId) {
        if (validatedRunId === nextSession.runId) {
          if (mounted) setSession(nextSession);
          return;
        }
        if (validatingRunId === nextSession.runId) return;
      } else {
        currentRunId = nextSession.runId;
        validatedRunId = null;
      }

      validatingRunId = nextSession.runId;
      const version = ++updateVersion;
      void flushActiveRunJournal()
        .then(readActiveRunJournal)
        .then((journal) => {
          if (!mounted || version !== updateVersion || currentRunId !== nextSession.runId) return;
          validatingRunId = null;
          if (journal?.active && journal.runId === nextSession.runId) {
            validatedRunId = nextSession.runId;
            setSession(latestSession);
          } else {
            setSession(null);
          }
        })
        .catch((error: unknown) => {
          console.warn('[ActiveRun] Unable to validate active route journal', error);
          if (version === updateVersion) validatingRunId = null;
          if (mounted && version === updateVersion) setSession(null);
        });
    };
    const unsubscribe = subscribeToBackgroundLocationSession((nextSession) => {
      hasReceivedSessionUpdate = true;
      applySession(nextSession);
    });
    void getBackgroundLocationSession().then((nextSession) => {
      if (mounted && !hasReceivedSessionUpdate) applySession(nextSession);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return <ActiveRunContext.Provider value={session}>{children}</ActiveRunContext.Provider>;
}

export function useActiveRun() {
  return useContext(ActiveRunContext);
}
