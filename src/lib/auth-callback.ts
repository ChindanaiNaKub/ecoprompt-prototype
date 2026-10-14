export const PRODUCTION_AUTH_CALLBACK_URL = 'https://chindanainakub.github.io/ecoprompt-prototype/'

const LOCAL_DEV_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

function normalizeBasePath(basePath: string) {
  const withLeadingSlash = basePath.startsWith('/') ? basePath : `/${basePath}`
  return withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`
}

export function resolveAuthCallbackUrl(
  locationLike: Pick<Location, 'origin' | 'hostname'>,
  basePath = '/',
) {
  if (!LOCAL_DEV_HOSTNAMES.has(locationLike.hostname)) {
    return PRODUCTION_AUTH_CALLBACK_URL
  }
  return new URL(normalizeBasePath(basePath), `${locationLike.origin}/`).toString()
}

export function getAuthCallbackUrl() {
  return resolveAuthCallbackUrl(window.location, import.meta.env.BASE_URL || '/')
}
