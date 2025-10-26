import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';

import { isOnboardingComplete } from '../storage';
import { checkNotificationPermission, PermissionRequestResult } from '../permissions';

export type OnboardingGateOptions = {
  redirectIfIncomplete?: string | null;
  redirectIfComplete?: string | null;
  requirePermissions?: boolean;
};

export type OnboardingGateResult = {
  checking: boolean;
  allowed: boolean;
  permissions: PermissionRequestResult | null;
  permissionsSatisfied: boolean;
};

export function useOnboardingGate(options: OnboardingGateOptions = {}): OnboardingGateResult {
  const {
    redirectIfIncomplete = '/onboarding',
    redirectIfComplete = null,
    requirePermissions = false,
  } = options;
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);
  const [permissions, setPermissions] = useState<PermissionRequestResult | null>(null);
  const [permissionsSatisfied, setPermissionsSatisfied] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;

      const check = async () => {
        setChecking(true);
        const completed = await isOnboardingComplete();
        const notificationStatus = await checkNotificationPermission();

        if (!isActive) {
          return;
        }

        const permissionsOk = notificationStatus.granted;

        setPermissions({ notifications: notificationStatus });
        setPermissionsSatisfied(permissionsOk);

        if (!isActive) {
          return;
        }

        if (!completed) {
          setAllowed(!redirectIfIncomplete);
          if (redirectIfIncomplete) {
            router.replace(redirectIfIncomplete);
          }
        } else {
          const canProceed = !requirePermissions || permissionsOk;
          setAllowed(canProceed);

          if (canProceed) {
            if (redirectIfComplete) {
              router.replace(redirectIfComplete);
            }
          } else if (requirePermissions && redirectIfIncomplete) {
            router.replace(redirectIfIncomplete);
          }
        }

        setChecking(false);
      };

      check();

      return () => {
        isActive = false;
      };
    }, [redirectIfComplete, redirectIfIncomplete, requirePermissions, router])
  );

  return { checking, allowed, permissions, permissionsSatisfied };
}
