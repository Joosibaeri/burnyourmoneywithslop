export const AUTH_RETURN_TO = 'slop-auth-return-to'

export function internalReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/'
  return value
}
