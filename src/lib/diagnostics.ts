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
    .replace(/\b(Bearer)\s+[\w.~+\/=-]+/gi, '$1 [REDACTED]')
    .replace(/(\b(?:key|token|authorization|x-firebase-appcheck|x-goog-api-key|api[-_ ]?key|(?:access|auth|debug|id|refresh|recaptcha|app[-_ ]?check)[-_ ]?token)["']?\s*[:=]\s*["']?(?:(?:Bearer|Basic)\s+)?)[^\s"'&#,;<>]+/gi, '$1[REDACTED]')
    .replace(/\bAIza[\w-]{35}\b|\beyJ[\w-]+\.eyJ[\w-]+\.[\w-]+\b/g, '[REDACTED]');
}

export function errorText(error: unknown): string {
  return redactDiagnostic(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}

export function extractionErrorGuidance(detail: string, online: boolean): string {
  if (/\[500\]|high demand/i.test(detail)) {
    return 'The extraction service is busy right now. Try again in a moment or add movements manually below.';
  }
  if (/appcheck\/|\b(?:401|403)\b/i.test(detail)) {
    return 'The cloud service couldn’t verify this browser. Reload and try again, or add movements manually below.';
  }
  if (/LanguageModel|Chrome AI requested for unsupported browser|(?:on-device|local) model[^.]*\b(?:not available|unavailable|not ready)\b|(?:unavailable|missing) on-device model/i.test(detail)) {
    return 'This browser’s on-device model isn’t ready. Try preparing it in Workspace readiness or add movements manually below.';
  }
  if (!online || /\boffline\b|internet_disconnected/i.test(detail)) {
    return 'You’re offline. Reconnect and try again, or add movements manually below.';
  }
  if (/AI\/fetch-error|network|failed to fetch|fetch failed/i.test(detail)) {
    return 'The browser couldn’t reach the extraction service. Check your connection and try again, or add movements manually below.';
  }
  if (/timeout|timed out/i.test(detail)) {
    return 'Extracting this note took too long. Try again or add movements manually below.';
  }
  return 'The app couldn’t extract movements from this note. Try again or add movements manually below.';
}
