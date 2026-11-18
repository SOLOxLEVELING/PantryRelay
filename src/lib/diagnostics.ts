const privateValues = Object.entries(import.meta.env)
  .filter(([name, value]) => name.startsWith('VITE_') && typeof value === 'string' && value.length > 0)
  .map(([, value]) => String(value));

export function redactDiagnostic(text: string): string {
  return privateValues.reduce((output, value) => output.replaceAll(value, '[REDACTED]'), text)
    .replace(/Firebase App Check debug token: [^\s]+/g, 'Firebase App Check debug token: [REDACTED]');
}

export function errorText(error: unknown): string {
  return redactDiagnostic(error instanceof Error ? `${error.name}: ${error.message}` : String(error));
}
