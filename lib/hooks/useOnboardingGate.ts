import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { isOnboardingComplete } from '../storage';

export type OnboardingGateOptions = {
  redirectIfIncomplete?: string | null;
  redirectIfComplete?: string | null;
};

export type OnboardingGateResult = {
  checking: boolean;
  allowed: boolean;
};

export function useOnboardingGate(options: OnboardingGateOptions = {}): OnboardingGateResult {
  const { redirectIfIncomplete = '/onboarding', redirectIfComplete = null } = options;
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const check = async () => {
        setChecking(true);
        const completed = await isOnboardingComplete();

        if (!isActive) {
          return;
        }

        if (!completed) {
          setAllowed(!redirectIfIncomplete);
          if (redirectIfIncomplete) {
            router.replace(redirectIfIncomplete);
          }
        } else {
          setAllowed(true);
          if (redirectIfComplete) {
            router.replace(redirectIfComplete);
          }
        }

        setChecking(false);
      };

      check();

      return () => {
        isActive = false;
      };
    }, [redirectIfComplete, redirectIfIncomplete, router])
  );

  return { checking, allowed };
}
