import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { subscriptionAPI } from '../services/subscriptionApi';

const ACCESS_STATUSES = new Set(['active', 'trialing']);

export function useSubscriptionAccess(enabled = true) {
  const [hasAccess, setHasAccess] = useState(false);
  const [checking, setChecking] = useState(enabled);

  useFocusEffect(
    useCallback(() => {
      let current = true;
      if (!enabled) {
        setHasAccess(false);
        setChecking(false);
        return () => { current = false; };
      }

      setChecking(true);
      void subscriptionAPI.getCurrent()
        .then(({ data }) => {
          if (current) setHasAccess(Boolean(data.subscription && ACCESS_STATUSES.has(data.subscription.status)));
        })
        .catch(() => {
          if (current) setHasAccess(false);
        })
        .finally(() => {
          if (current) setChecking(false);
        });

      return () => { current = false; };
    }, [enabled]),
  );

  return { hasAccess, checking };
}
