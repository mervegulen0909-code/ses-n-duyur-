import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * In-app review ask, gated to fire once per install after the user has had
 * real success in the app (completed votes), never on open or at random.
 * The OS may still silently skip the dialog (Play/App Store quota) — that is
 * expected and out of our hands.
 */

export type ReviewPromptState = {
  successes: number;
  askedAt: string | null;
};

/** Second completed vote = the user got value twice; ask then, once ever. */
export const REVIEW_ASK_THRESHOLD = 2;

const STORAGE_KEY = 'voxscore.reviewPrompt';

export function parseReviewState(raw: string | null): ReviewPromptState {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ReviewPromptState>;
      if (typeof parsed.successes === 'number' && parsed.successes >= 0) {
        return {
          successes: parsed.successes,
          askedAt: typeof parsed.askedAt === 'string' ? parsed.askedAt : null,
        };
      }
    } catch {
      // fall through to a fresh state
    }
  }
  return { successes: 0, askedAt: null };
}

export function nextReviewState(
  state: ReviewPromptState,
  nowIso: string,
): { ask: boolean; state: ReviewPromptState } {
  const successes = state.successes + 1;
  const ask = state.askedAt === null && successes >= REVIEW_ASK_THRESHOLD;
  return {
    ask,
    state: { successes, askedAt: ask ? nowIso : state.askedAt },
  };
}

/**
 * Call after a success moment (vote recorded, battle winner picked). Never
 * throws: the review ask must not be able to break the flow it rides on.
 */
export async function recordSuccessMoment(): Promise<void> {
  try {
    const state = parseReviewState(await AsyncStorage.getItem(STORAGE_KEY));
    const next = nextReviewState(state, new Date().toISOString());
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next.state));
    if (!next.ask) return;
    const StoreReview = await import('expo-store-review');
    if (await StoreReview.isAvailableAsync()) {
      await StoreReview.requestReview();
    }
  } catch {
    // Swallow: a failed review ask is invisible; a crashed vote flow is not.
  }
}
