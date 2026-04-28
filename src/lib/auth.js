// Pure helper that decides whether a given email is allowed to access the app.
//
// The list comes from `VITE_ALLOWED_EMAILS` (comma-separated). The function
// fails closed: if the env var is missing, empty, or all-whitespace, no email
// is allowed. Tests can inject the raw value explicitly via the second arg.

export function parseAllowlist(raw) {
  if (typeof raw !== 'string') return []
  return raw
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

export function isAllowed(email, raw) {
  const source = raw === undefined ? import.meta.env.VITE_ALLOWED_EMAILS : raw
  if (typeof email !== 'string') return false
  const normalized = email.trim().toLowerCase()
  if (!normalized) return false
  const list = parseAllowlist(source)
  if (list.length === 0) return false
  return list.includes(normalized)
}
