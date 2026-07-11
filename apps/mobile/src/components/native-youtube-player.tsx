import { forwardRef } from 'react';
import YoutubePlayer, {
  type YoutubeIframeProps,
  type YoutubeIframeRef,
} from 'react-native-youtube-iframe';

type NativeYouTubePlayerProps = Omit<
  YoutubeIframeProps,
  'forceAndroidAutoplay' | 'initialPlayerParams' | 'webViewProps'
>;

const INITIAL_PLAYER_PARAMS: NonNullable<YoutubeIframeProps['initialPlayerParams']> = {
  controls: true,
  rel: false,
  iv_load_policy: 3,
  preventFullScreen: true,
};

const WEB_VIEW_PROPS: NonNullable<YoutubeIframeProps['webViewProps']> = {
  mediaPlaybackRequiresUserAction: false,
  setSupportMultipleWindows: false,
};

export const NativeYouTubePlayer = forwardRef<YoutubeIframeRef, NativeYouTubePlayerProps>(
  function NativeYouTubePlayer(props, ref) {
    return (
      <YoutubePlayer
        ref={ref}
        forceAndroidAutoplay
        initialPlayerParams={INITIAL_PLAYER_PARAMS}
        webViewProps={WEB_VIEW_PROPS}
        {...props}
      />
    );
  },
);
