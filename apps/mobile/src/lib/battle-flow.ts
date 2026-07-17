export type BattlePlaybackPhase = 'a' | 'b' | 'complete';

/**
 * Keep exactly one native YouTube WebView mounted at a time. Two WebViews in
 * the same Android ScrollView can retain stale touch surfaces after scrolling,
 * causing an invisible player to intercept the vote/skip controls.
 */
export function battlePlaybackPhase(
  listenAVerified: boolean,
  listenBVerified: boolean,
): BattlePlaybackPhase {
  if (!listenAVerified) return 'a';
  if (!listenBVerified) return 'b';
  return 'complete';
}
