'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

/** Fires `landing_view` once per home-page mount. Renders nothing. */
export function TrackLandingView() {
  useEffect(() => {
    track('landing_view');
  }, []);
  return null;
}
