export function resolveClientId(configured: string, legacy: string): string | null {
  const valid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  if (configured && !valid(configured)) throw new Error('Orbit publisher application client ID is invalid.')
  return configured || (valid(legacy) ? legacy : null)
}
