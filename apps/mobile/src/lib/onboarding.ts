import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * First-launch onboarding gate. Bump the version suffix to re-show onboarding
 * after a major redesign. Stored in AsyncStorage (non-sensitive flag).
 */
const KEY = 'voxscore.onboarding.v1';

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) != null;
  } catch {
    return false;
  }
}

export async function completeOnboarding(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, '1');
  } catch {
    // Non-fatal: worst case the intro shows again next launch.
  }
}
