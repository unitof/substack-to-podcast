import { createHash } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import getLoginResponse, {
  getCookieHeaderFromSetCookies,
  normalizeSubstackCookieHeader,
  type SubstackLoginCredentials
} from './ss-login'

type HeaderBag = Headers | Record<string, string | string[] | undefined>
type RequestLike = Request | Pick<VercelRequest, 'headers'>
type RequestWithUrl = Request | (Pick<VercelRequest, 'headers'> & { url?: string })
type CachedCookie = {
  cookieHeader: string
  expiresAt: number
}

type LoginErrorShape = {
  response?: {
    status?: number
  }
}

export type SubstackCookieSource = 'env-cookie' | 'http-basic'

export class SubstackAuthError extends Error {
  statusCode: number

  constructor(message: string) {
    super(message)
    this.name = 'SubstackAuthError'
    this.statusCode = 401
  }
}

const BASIC_AUTH_REALM = 'Substackwoofer'
const COOKIE_CACHE_TTL_MS = 12 * 60 * 60 * 1000
const cookieCache = new Map<string, CachedCookie>()

function isWebRequest(request: RequestLike | RequestWithUrl): request is Request {
  return typeof Request !== 'undefined' && request instanceof Request
}

function getHeaders(request: RequestLike | RequestWithUrl): HeaderBag {
  return isWebRequest(request) ? request.headers : request.headers
}

function getHeaderValue(headers: HeaderBag, name: string): string {
  if (headers instanceof Headers) {
    return headers.get(name) || ''
  }

  const headerValue = headers[name.toLowerCase()] ?? headers[name]
  return Array.isArray(headerValue) ? (headerValue[0] || '') : (headerValue || '')
}

function getAuthorizationHeader(request: RequestLike): string {
  return getHeaderValue(getHeaders(request), 'authorization')
}

function getCacheKey(authorizationHeader: string): string {
  return createHash('sha256').update(authorizationHeader).digest('hex')
}

function parseBasicAuthorizationHeader(authorizationHeader: string): SubstackLoginCredentials {
  const [scheme, encodedCredentials = ''] = authorizationHeader.trim().split(/\s+/, 2)
  if (scheme?.toLowerCase() !== 'basic' || !encodedCredentials) {
    throw new SubstackAuthError('HTTP Basic auth required')
  }

  const decodedCredentials = Buffer.from(encodedCredentials, 'base64').toString('utf8')
  const separatorIndex = decodedCredentials.indexOf(':')
  if (separatorIndex <= 0) {
    throw new SubstackAuthError('HTTP Basic auth required')
  }

  const email = decodedCredentials.slice(0, separatorIndex)
  const password = decodedCredentials.slice(separatorIndex + 1)
  if (!email || !password) {
    throw new SubstackAuthError('HTTP Basic auth required')
  }

  return { email, password }
}

function getCachedCookieHeader(cacheKey: string): string {
  const cachedCookie = cookieCache.get(cacheKey)
  if (!cachedCookie) {
    return ''
  }

  if (cachedCookie.expiresAt <= Date.now()) {
    cookieCache.delete(cacheKey)
    return ''
  }

  return cachedCookie.cookieHeader
}

export function hasSubstackBasicAuth(request: RequestLike): boolean {
  return Boolean(getAuthorizationHeader(request))
}

export function getSubstackCredentialsFromRequest(request: RequestLike): SubstackLoginCredentials {
  const authorizationHeader = getAuthorizationHeader(request)
  if (!authorizationHeader) {
    throw new SubstackAuthError('HTTP Basic auth required')
  }

  return parseBasicAuthorizationHeader(authorizationHeader)
}

export async function getSubstackCookieForRequest(
  request: RequestLike,
  options: {
    allowEnvCookie?: boolean
    forceFreshLogin?: boolean
  } = {}
): Promise<{ cookieHeader: string; source: SubstackCookieSource }> {
  const { allowEnvCookie = true, forceFreshLogin = false } = options
  const envCookie = allowEnvCookie ? normalizeSubstackCookieHeader(process.env.SUBSTACK_COOKIE || '') : ''

  if (!forceFreshLogin && envCookie) {
    return {
      cookieHeader: envCookie,
      source: 'env-cookie'
    }
  }

  const authorizationHeader = getAuthorizationHeader(request)
  if (!authorizationHeader) {
    throw new SubstackAuthError('HTTP Basic auth required')
  }

  const cacheKey = getCacheKey(authorizationHeader)
  if (!forceFreshLogin) {
    const cachedCookieHeader = getCachedCookieHeader(cacheKey)
    if (cachedCookieHeader) {
      return {
        cookieHeader: cachedCookieHeader,
        source: 'http-basic'
      }
    }
  }

  const credentials = parseBasicAuthorizationHeader(authorizationHeader)

  try {
    const loginResponse = await getLoginResponse(credentials)
    const cookieHeader = getCookieHeaderFromSetCookies(
      loginResponse.headers['set-cookie'] as string[] | undefined
    )

    if (!cookieHeader) {
      throw new Error('Substack login returned no cookies')
    }

    cookieCache.set(cacheKey, {
      cookieHeader,
      expiresAt: Date.now() + COOKIE_CACHE_TTL_MS
    })

    return {
      cookieHeader,
      source: 'http-basic'
    }
  } catch (error: unknown) {
    cookieCache.delete(cacheKey)

    if ((error as LoginErrorShape | undefined)?.response?.status === 401) {
      throw new SubstackAuthError('Invalid Substack credentials')
    }

    throw error
  }
}

export function invalidateCachedSubstackAuth(request: RequestLike): void {
  const authorizationHeader = getAuthorizationHeader(request)
  if (!authorizationHeader) {
    return
  }

  cookieCache.delete(getCacheKey(authorizationHeader))
}

export function getBasicAuthChallengeHeader(): string {
  return `Basic realm="${BASIC_AUTH_REALM}", charset="UTF-8"`
}

export function setBasicAuthChallengeHeader(res: VercelResponse): void {
  res.setHeader('WWW-Authenticate', getBasicAuthChallengeHeader())
}

export function isSubstackAuthError(error: unknown): error is SubstackAuthError {
  return error instanceof SubstackAuthError
}

export function getRequestOrigin(request: RequestWithUrl): string {
  const headers = getHeaders(request)
  const requestUrl = 'url' in request && typeof request.url === 'string'
    ? new URL(request.url, 'https://example.com')
    : null
  const fallbackHost = requestUrl && requestUrl.host !== 'example.com' ? requestUrl.host : ''
  const host = getHeaderValue(headers, 'x-forwarded-host')
    || getHeaderValue(headers, 'host')
    || process.env.VERCEL_URL
    || fallbackHost

  if (!host) {
    throw new Error('Could not determine request host for Substack requests')
  }

  const forwardedProto = getHeaderValue(headers, 'x-forwarded-proto')
  const protocol = forwardedProto || (host.includes('localhost') ? 'http' : 'https')

  return `${protocol}://${host}`
}
