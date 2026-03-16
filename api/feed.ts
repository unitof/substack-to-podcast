import axios from 'axios'
import { Podcast } from 'podcast'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type FeedPost = {
  audio_url?: string
  cover_photo_url?: string
  publication?: { name?: string }
  publisher?: { name?: string }
  publisher_name?: string
  title?: string
  detail_view_subtitle?: string
  web_url?: string
  uuid?: string
  publishedBylines?: Array<{ name?: string }>
  published_bylines?: Array<{ name?: string }>
  created_at?: string
}

type InboxResponse = {
  items?: FeedPost[]
}

type ApiErrorShape = {
  response?: {
    status?: number
    data?: unknown
  }
  message?: string
}

function getFirstByline(post?: FeedPost): { name?: string } | null {
  if (!post) return null
  if (Array.isArray(post.publishedBylines) && post.publishedBylines.length) {
    return post.publishedBylines[0]
  }
  if (Array.isArray(post.published_bylines) && post.published_bylines.length) {
    return post.published_bylines[0]
  }
  return null
}

function getPublisher(post?: FeedPost): { name?: string } {
  if (!post) return {}
  return post.publication || post.publisher || {}
}

function normalizeSubstackCookieHeader(rawCookie = ''): string {
  return rawCookie.trim().replace(/^['"]|['"]$/g, '')
}

function getCookieHeaderFromSetCookies(cookies: string[] = []): string {
  return cookies
    .map(cookie => cookie.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ')
}

function getRequestOrigin(req: VercelRequest): string {
  const forwardedHostHeader = req.headers['x-forwarded-host']
  const forwardedProtoHeader = req.headers['x-forwarded-proto']
  const host = Array.isArray(forwardedHostHeader)
    ? forwardedHostHeader[0]
    : (forwardedHostHeader || req.headers.host || process.env.VERCEL_URL || '')

  if (!host) {
    throw new Error('Could not determine request host for Substack login')
  }

  const forwardedProto = Array.isArray(forwardedProtoHeader) ? forwardedProtoHeader[0] : forwardedProtoHeader
  const protocol = forwardedProto || (host.includes('localhost') ? 'http' : 'https')

  return `${protocol}://${host}`
}

async function fetchLoginCookie(req: VercelRequest): Promise<string> {
  const loginCookies = await axios.get<string[]>(`${getRequestOrigin(req)}/api/login`)
  return getCookieHeaderFromSetCookies(loginCookies.data)
}

function isUnauthorizedError(error: unknown): boolean {
  return (error as ApiErrorShape | undefined)?.response?.status === 401
}

async function buildFeedXml(substackSidCookie: string): Promise<string> {
  const substackPosts = await axios.get<InboxResponse>(
    // page 0 = latest 12 posts
    'https://api.substack.com/api/v1/inbox_v2',
    {
      headers: {
        Cookie: substackSidCookie
      }
    }
  )

  // Substack can omit fields, so default to an empty list to keep feed generation safe.
  const items = Array.isArray(substackPosts.data?.items) ? substackPosts.data.items : []

  const feed = new Podcast({
    title: 'My Substack Audio Feed',
    description: 'Totally unofficial feed generated for personal use in podcast players',
    author: 'Jacob ¶. Ford',
    siteUrl: 'https://substackwoofer.vercel.app',
    imageUrl: items[0]?.cover_photo_url || ''
  })

  items.forEach(post => {
    const audioUrl = post.audio_url
    if (!audioUrl) {
      return
    }

    console.log('post', post)
    const byline = getFirstByline(post)
    const publisher = getPublisher(post)
    const publisherName = post.publisher_name || publisher.name || ''

    feed.addItem({
      title: publisherName ? `${publisherName}: ${post.title || ''}` : (post.title || ''),
      description: `${post.detail_view_subtitle || ''}\n\n${post.web_url || ''}`,
      url: post.web_url || '',
      guid: post.uuid || post.web_url || undefined,
      author: byline?.name || publisherName,
      date: post.created_at,
      enclosure: {
        url: audioUrl,
        type: 'audio/mpeg'
      },
      image: post.cover_photo_url
      // `podcast` typings do not include this field, but RSS consumers use it.
    } as any)
  })

  return feed.buildXml({ indent: '\t' })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    let substackCookie = ''
    let usingEnvCookie = false

    console.log(req.headers['user-agent'])

    if (process.env.SUBSTACK_COOKIE) {
      // Useful during development to avoid login throttling while iterating.
      console.warn('Using process.env.SUBSTACK_COOKIE to avoid SS ratelimits')
      substackCookie = normalizeSubstackCookieHeader(process.env.SUBSTACK_COOKIE)
      usingEnvCookie = Boolean(substackCookie)
    } else {
      // This route returns cached login cookies so we avoid logging in on every request.
      substackCookie = await fetchLoginCookie(req)
    }

    if (!substackCookie) {
      console.error('Missing Substack cookie header for feed generation')
      res.status(500).json({ error: 'Could not authenticate with Substack' })
      return
    }

    try {
      const xml = await buildFeedXml(substackCookie)
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
      res.end(xml)
      return
    } catch (error: unknown) {
      if (usingEnvCookie && isUnauthorizedError(error)) {
        console.warn('SUBSTACK_COOKIE was rejected, retrying feed with /api/login cookie')
        const xml = await buildFeedXml(await fetchLoginCookie(req))
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
        res.end(xml)
        return
      }

      throw error
    }
  } catch (error: unknown) {
    const normalizedError = error as ApiErrorShape
    console.error('Feed generation failed', {
      message: normalizedError?.message,
      status: normalizedError?.response?.status,
      responseData: normalizedError?.response?.data
    })
    res.status(normalizedError?.response?.status || 502).json({ error: 'Failed to build feed' })
  }
}
