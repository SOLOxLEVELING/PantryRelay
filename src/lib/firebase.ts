import { initializeApp } from 'firebase/app';
import { getAI, GoogleAIBackend } from 'firebase/ai';
import { getToken, initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { errorText, redactDiagnostic } from './diagnostics';

declare global {
  interface Window {
    FIREBASE_APPCHECK_DEBUG_TOKEN?: string | boolean;
  }
}

const requiredConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (Object.values(requiredConfig).some(value => !value) || !import.meta.env.VITE_RECAPTCHA_SITE_KEY) {
  throw new Error('Missing Firebase configuration or reCAPTCHA Enterprise site key in .env.local');
}

const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

if (debugToken && !isLocalhost) {
  throw new Error('App Check debug builds are restricted to localhost. Rebuild without the debug token.');
}

if (isLocalhost && (import.meta.env.DEV || debugToken)) {
  const originalLog = console.log.bind(console);
  console.log = (...values: unknown[]) => originalLog(...values.map(value =>
    typeof value === 'string' ? redactDiagnostic(value) : value));
  self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken || true;
}

export const app = initializeApp(requiredConfig);
export const appCheck = initializeAppCheck(app, {
  provider: new ReCaptchaEnterpriseProvider(import.meta.env.VITE_RECAPTCHA_SITE_KEY),
  isTokenAutoRefreshEnabled: true,
});
export const ai = getAI(app, { backend: new GoogleAIBackend() });
export const auth = getAuth(app);
export const db = getFirestore(app);

let pendingSignIn: Promise<string> | undefined;

export async function ensureSignedInUid(): Promise<string> {
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser.uid;

  pendingSignIn ??= signInAnonymously(auth)
    .then(({ user }) => user.uid)
    .finally(() => { pendingSignIn = undefined; });
  return pendingSignIn;
}

export async function checkAppCheck(): Promise<string> {
  try {
    const result = await getToken(appCheck);
    return result.token ? 'Token acquired (value withheld)' : 'No token returned';
  } catch (error) {
    return errorText(error);
  }
}
