import { forwardRef } from 'react';
import { useTranslation } from 'react-i18next';
import YoutubePlayer, {
  type YoutubeIframeProps,
  type YoutubeIframeRef,
} from 'react-native-youtube-iframe';

type NativeYouTubePlayerProps = Omit<
  YoutubeIframeProps,
  'forceAndroidAutoplay' | 'initialPlayerParams' | 'webViewProps'
>;

// Anti-cheat for the Verified Listen: hide the player controls so there is no
// seek bar to scrub — a viewer can't jump to the end and claim a full watch.
// Play/pause still works by tapping the video.
const BASE_PLAYER_PARAMS: NonNullable<YoutubeIframeProps['initialPlayerParams']> = {
  controls: false,
  rel: false,
  iv_load_policy: 3,
  preventFullScreen: true,
};

const WEB_VIEW_PROPS: NonNullable<YoutubeIframeProps['webViewProps']> = {
  mediaPlaybackRequiresUserAction: false,
  setSupportMultipleWindows: false,
  // Let the embedded YouTube player see the user's WebView/Google cookies when
  // the platform allows it. Premium/ad behavior is still controlled by YouTube.
  sharedCookiesEnabled: true,
  thirdPartyCookiesEnabled: true,
};

export const NativeYouTubePlayer = forwardRef<YoutubeIframeRef, NativeYouTubePlayerProps>(
  function NativeYouTubePlayer(props, ref) {
    // Match the YouTube chrome (e.g. the "Watch on YouTube" overlay) to the
    // app's own language instead of the device's — otherwise a user running
    // the app in English still sees a Turkish overlay if their phone is set
    // to Turkish, which reads as a bug on store-listing screenshots.
    const { i18n } = useTranslation();
    return (
      <YoutubePlayer
        ref={ref}
        forceAndroidAutoplay
        initialPlayerParams={{ ...BASE_PLAYER_PARAMS, playerLang: i18n.language }}
        webViewProps={WEB_VIEW_PROPS}
        {...props}
      />
    );
  },
);
