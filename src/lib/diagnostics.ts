const privateValues = [
  import.meta.env.VITE_FIREBASE_API_KEY,
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  import.meta.env.VITE_FIREBASE_PROJECT_ID,
  import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  import.meta.env.VITE_FIREBASE_APP_ID,
  import.meta.env.VITE_RECAPTCHA_SITE_KEY,
  import.meta.env.VITE_APPCHECK_DEBUG_TOKEN,
].filter(Boolean);

export function redactDiagnostic(text: string): string {
  return privateValues.reduce((output, value) => output.replaceAll(value, '[REDACTED]'), text)
    .replace(/Firebase App Check debug token: [^\s]+/g, 'Firebase App Check debug token: [REDACTED]');
}

export function errorText(error: unknown): string {
  return redactDiagnostic(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}
