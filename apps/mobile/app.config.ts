import type { ConfigContext, ExpoConfig } from 'expo/config';
import appJson from './app.json';

/** Dynamic only where Apple requires different App Attest entitlements. */
export default ({ config }: ConfigContext): ExpoConfig => {
  const base = appJson.expo as ExpoConfig;
  const appAttestEnvironment =
    process.env.APP_ATTEST_ENVIRONMENT === 'development' ? 'development' : 'production';
  return {
    ...config,
    ...base,
    ios: {
      ...base.ios,
      entitlements: {
        ...base.ios?.entitlements,
        'com.apple.developer.devicecheck.appattest-environment': appAttestEnvironment,
      },
    },
    plugins: [...(base.plugins ?? []), 'expo-font', 'expo-image'],
  };
};
