/**
 * Runtime configuration bootstrap.
 *
 * This file must be imported before any modules that read from `src/config.ts`.
 * Keep any environment-specific overrides here so they run early and predictably.
 */

// Default Supabase config for dev.
// NOTE: In a real app, you should avoid committing keys and use a secure config mechanism.
const globals = global as unknown as {
  __BikeChatSupabaseUrl?: string;
  __BikeChatSupabaseAnonKey?: string;
  __BikeChatGoogleWebClientId?: string;
  __BikeChatApiBaseUrl?: string;
};

if (!globals.__BikeChatSupabaseUrl) {
  globals.__BikeChatSupabaseUrl = 'https://ecwgckbfpbykioegcgdh.supabase.co';
}

if (!globals.__BikeChatSupabaseAnonKey) {
  globals.__BikeChatSupabaseAnonKey = 'sb_publishable_EMd0bls_f1ou105wtEaIGQ_ET14gEto';
}

// Required for native Google Sign-In. Use the Google OAuth Web client ID, not
// the Android client ID.
globals.__BikeChatGoogleWebClientId = '439087840394-heno6rq8e6rpvvsed9oqsiun96lmee55.apps.googleusercontent.com';

// Do not force an API base URL here; `src/config.ts` already provides sensible defaults
// (Android emulator: http://10.0.2.2:3001 in dev).
//
// If running the backend on your LAN for a physical device, set this at runtime:
// globals.__BikeChatApiBaseUrl = 'http://192.168.1.5:3001';

if (typeof __DEV__ !== 'undefined' && __DEV__) {
  // Avoid logging secrets.
  // eslint-disable-next-line no-console
  console.log('[bootstrap] supabaseUrl=', globals.__BikeChatSupabaseUrl);
  // eslint-disable-next-line no-console
  console.log('[bootstrap] apiBaseUrl override=', globals.__BikeChatApiBaseUrl ?? '(default)');

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { config } = require('../config');
  // eslint-disable-next-line no-console
  console.log('[bootstrap] apiBaseUrl=', config.apiBaseUrl);
}
