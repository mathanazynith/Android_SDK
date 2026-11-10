import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../service/auth';
import { flushActiveRunJournal, readActiveRunJournal } from '../src/services/activeRunJournal';
import {
    getBackgroundLocationSession,
    subscribeToBackgroundLocationSession,
    type BackgroundLocationSessionState,
} from '../src/services/backgroundLocationTask';

const ActiveRunContext = createContext<BackgroundLocationSessionState | null>(null);

export function ActiveRunProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<BackgroundLocationSessionState | null>(null);
  const { user, isLoading } = useAuth();

  useEffect(() => {
    let mounted = true;
    let updateVersion = 0;
    let currentRunId: string | null = null;
    let validatedRunId: string | null = null;
    let validatingRunId: string | null = null;
    let latestSession: BackgroundLocationSessionState | null = null;
    let hasReceivedSessionUpdate = false;

    const applySession = (nextSession: BackgroundLocationSessionState | null) => {
      const currentUserId = user?.id == null ? null : String(user.id);
      const sessionUserId = nextSession?.userId == null ? null : String(nextSession.userId);
      const hasUserMismatch = currentUserId !== null && sessionUserId !== null && currentUserId !== sessionUserId;
      const isTerminal = nextSession?.status === 'finalizing'
        || nextSession?.status === 'completed'
        || nextSession?.status === 'cancelled'
        || nextSession?.status === 'pending_sync';
      // Auth can briefly be unresolved while the app restores credentials. Hide
      // the banner until then, but never destroy a persisted run from this UI layer.
      if (
        isLoading
        || !nextSession?.active
        || isTerminal
        || nextSession.recoveryReviewRequired
        || !nextSession.runId
        || hasUserMismatch
        || currentUserId === null
      ) {
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
  }, [isLoading, user?.id]);

  return <ActiveRunContext.Provider value={session}>{children}</ActiveRunContext.Provider>;
}

export function useActiveRun() {
  return useContext(ActiveRunContext);
}
