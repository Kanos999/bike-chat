import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { config } from '../../config';

let configuredClientId: string | null = null;

const DEBUG_PACKAGE_NAME = 'com.convoii.app';
const DEBUG_SHA1 = '5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25';

function googleDeveloperErrorMessage(): string {
  return (
    'Google sign-in is not configured for this build. ' +
    'Set __BikeChatGoogleWebClientId to a Google OAuth Web client ID, not the Android client ID, ' +
    `and create an Android OAuth client for package ${DEBUG_PACKAGE_NAME} with SHA-1 ${DEBUG_SHA1}.`
  );
}

function configureGoogleSignIn(): void {
  const webClientId = config.googleWebClientId;
  if (!webClientId) {
    throw new Error('Missing Google Web Client ID. Set __BikeChatGoogleWebClientId.');
  }
  if (configuredClientId === webClientId) return;

  GoogleSignin.configure({
    webClientId,
    scopes: ['openid', 'email', 'profile'],
  });
  configuredClientId = webClientId;
}

export async function getNativeGoogleIdToken(): Promise<string | null> {
  configureGoogleSignIn();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  try {
    const response = await GoogleSignin.signIn();
    if (response.type === 'cancelled') return null;

    const idToken = response.data.idToken;
    if (!idToken) throw new Error('Google sign-in did not return an ID token.');
    return idToken;
  } catch (error) {
    const code =
      error && typeof error === 'object' && 'code' in error ? String((error as { code?: string }).code) : '';
    const message =
      error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: string }).message)
        : '';

    if (code === statusCodes.SIGN_IN_CANCELLED) {
      return null;
    }

    if (
      code === '10' ||
      /developer/i.test(message) ||
      /must use a web client/i.test(message) ||
      /invalid audience/i.test(message)
    ) {
      throw new Error(googleDeveloperErrorMessage());
    }

    throw error;
  }
}
