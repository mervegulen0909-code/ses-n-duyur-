/**
 * Canonical base URL for the deployed web app + Next.js API. Single source of
 * truth so the API client (lib/api.ts) and the store-required in-app legal links
 * (lib/links.ts) can never drift to different deployments. Override per env with
 * EXPO_PUBLIC_API_BASE_URL (local/staging).
 */
export const WEB_BASE =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://web-seven-coral-88.vercel.app';
