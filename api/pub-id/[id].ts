import axios from 'axios'
import { Podcast } from 'podcast'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  getSubstackCookieForRequest,
  invalidateCachedSubstackAuth,
  isSubstackAuthError,
  setBasicAuthChallengeHeader
} from '../../lib/substack-auth'

type PublicationUser = {
  role?: string
  publication?: {
    name?: string
    hero_text?: string
    logo_url?: string
  }
}

type PostByline = {
  name?: string
  publication?: {
    name?: string
    title?: string
    description?: string
    hero_text?: string
    logo_url?: string
    logoUrl?: string
    author_name?: string
  }
  publicationUsers?: PublicationUser[]
}

type PublicationPost = {
  id?: string
  title?: string
  subtitle?: string
  description?: string
  canonical_url?: string
  post_date?: string
  cover_image?: string
  publication?: {
    name?: string
    title?: string
    description?: string
    hero_text?: string
    logo_url?: string
    logoUrl?: string
    author_name?: string
  }
  publisher?: {
    name?: string
    title?: string
    description?: string
    hero_text?: string
    logo_url?: string
    logoUrl?: string
    author_name?: string
  }
  publishedBylines?: PostByline[]
  published_bylines?: Array<{ name?: string }>
  publisher_name?: string
  audio_items?: Array<{ audio_url?: string }>
}

type PublicationPostsResponse = {
  posts?: PublicationPost[]
  more?: boolean
}

type ApiErrorShape = {
  response?: {
    status?: number
    data?: unknown
  }
  message?: string
}

type PublicationInfo = NonNullable<PublicationPost['publication']>

type FeedMetadata = {
  publication: PublicationInfo
  firstPost?: PublicationPost
  firstByline: PostByline | { name?: string } | null
}

function getFirstByline(post?: PublicationPost): PostByline | { name?: string } | null {
  if (!post) return null
  if (Array.isArray(post.publishedBylines) && post.publishedBylines.length) {
    return post.publishedBylines[0]
  }
  if (Array.isArray(post.published_bylines) && post.published_bylines.length) {
    return post.published_bylines[0]
  }
  return null
}

function getPublicationFromPosts(posts: PublicationPost[]): PublicationPost['publication'] | null {
  for (const post of posts) {
    if (!post) continue

    if (post.publication) return post.publication
    if (post.publisher) return post.publisher

    const byline = getFirstByline(post) as PostByline | null
    if (byline?.publication) return byline.publication

    const adminPublication = byline?.publicationUsers?.find(user => user?.role === 'admin')?.publication
    if (adminPublication) return adminPublication
  }
  return null
}

function logApiError(context: string, error: ApiErrorShape, extra: Record<string, unknown> = {}): void {
  console.error(context, {
    ...extra,
    message: error?.message,
    status: error?.response?.status,
    responseData: error?.response?.data
  })
}

const MAX_PUBLICATION_POST_PAGES = 500

function isUnauthorizedError(error: unknown): boolean {
  return (error as ApiErrorShape | undefined)?.response?.status === 401
}

async function fetchAllPublicationPosts(
  publicationId: string,
  substackSidCookie: string
): Promise<PublicationPost[]> {
  const posts: PublicationPost[] = []
  const seenPosts = new Set<string>()

  for (let page = 0; page < MAX_PUBLICATION_POST_PAGES; page += 1) {
    const substackPosts = await axios.get<PublicationPostsResponse>(
      `https://api.substack.com/api/v1/publications/${publicationId}/posts?page=${page}&includeCrossPosts=true`,
      {
        headers: {
          Cookie: substackSidCookie
        }
      }
    )

    const pagePosts = Array.isArray(substackPosts.data?.posts) ? substackPosts.data.posts : []

    pagePosts.forEach((post, index) => {
      const postKey = post.id || post.canonical_url || `page-${page}-index-${index}`
      if (seenPosts.has(postKey)) {
        return
      }

      seenPosts.add(postKey)
      posts.push(post)
    })

    if (!substackPosts.data?.more || pagePosts.length === 0) {
      return posts
    }
  }

  console.warn('Reached publication pagination safety cap', {
    publicationId,
    maxPages: MAX_PUBLICATION_POST_PAGES
  })

  return posts
}

async function fetchFeedMetadata(
  publicationId: string,
  substackSidCookie: string,
  posts: PublicationPost[]
): Promise<FeedMetadata> {
  const firstPost = posts[0]
  const firstByline = getFirstByline(firstPost)

  // Substack's publication endpoint is the most stable source for feed-level metadata.
  let publicationInfo: PublicationInfo | null = null
  try {
    const publicationResponse = await axios.get<PublicationInfo>(
      `https://api.substack.com/api/v1/publications/${publicationId}`,
      {
        headers: {
          Cookie: substackSidCookie
        }
      }
    )
    publicationInfo = publicationResponse.data
  } catch (error: any) {
    console.warn('Failed to fetch publication details, using post-level fallback', {
      publicationId,
      message: error?.message,
      status: error?.response?.status
    })
  }

  return {
    firstPost,
    firstByline,
    publication: publicationInfo || getPublicationFromPosts(posts) || {}
  }
}

async function buildPublicationFeedXml(
  publicationId: string,
  substackSidCookie: string
): Promise<string> {
  // Walk every publication page so feed consumers get the complete post history.
  const posts = await fetchAllPublicationPosts(publicationId, substackSidCookie)
  const { firstPost, firstByline, publication } = await fetchFeedMetadata(publicationId, substackSidCookie, posts)

  const logoUrl = publication.logo_url || publication.logoUrl || ''
  const logoIsBucketeer = logoUrl.startsWith('https://bucketeer-')

  const feed = new Podcast({
    title: publication?.name || publication?.title || firstPost?.publisher_name || `Substack ${publicationId}`,
    description: publication?.hero_text || publication?.description || '',
    author: firstByline?.name || publication?.author_name || publication?.name || '',
    siteUrl: 'https://substackwoofer.vercel.app',
    imageUrl: logoIsBucketeer
      ? `https://substackcdn.com/image/fetch/${encodeURIComponent(logoUrl)}`
      : logoUrl
  })

  posts.forEach(post => {
    const audioUrl = post.audio_items?.[0]?.audio_url
    if (!audioUrl) {
      return
    }

    feed.addItem({
      title: post.title || '',
      description: `${post.description && '\n\n'}${post.canonical_url || ''}`,
      url: post.canonical_url || '',
      guid: post.id || post.canonical_url || undefined,
      author: getFirstByline(post)?.name || post.publisher_name || publication?.name || '',
      date: post.post_date,
      enclosure: {
        url: audioUrl,
        type: 'audio/mpeg'
      },
      image: post.cover_image
      // `podcast` typings do not include this field, but RSS consumers use it.
    } as any)
  })

  return feed.buildXml({ indent: '\t' })
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const reqParams = new URL('https://example.com' + req.url).searchParams
    const publicationId = reqParams.get('id')

    if (!publicationId) {
      res.status(400).json({ error: 'Missing publication id' })
      return
    }

    console.log(req.headers['user-agent'])
    const substackAuth = await getSubstackCookieForRequest(req)

    try {
      const xml = await buildPublicationFeedXml(publicationId, substackAuth.cookieHeader)
      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
      res.end(xml)
      return
    } catch (error: unknown) {
      if (isUnauthorizedError(error)) {
        console.warn('Substack cookie was rejected, retrying publication feed with a fresh login', { publicationId })
        invalidateCachedSubstackAuth(req)
        const refreshedAuth = await getSubstackCookieForRequest(req, { forceFreshLogin: true })
        const xml = await buildPublicationFeedXml(publicationId, refreshedAuth.cookieHeader)
        res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
        res.end(xml)
        return
      }

      throw error
    }
  } catch (error: unknown) {
    if (isSubstackAuthError(error)) {
      setBasicAuthChallengeHeader(res)
      res.status(error.statusCode).json({ error: error.message })
      return
    }

    const normalizedError = error as ApiErrorShape
    logApiError('Publication feed generation failed', normalizedError, { path: req?.url })
    res.status(normalizedError?.response?.status || 502).json({ error: 'Failed to build publication feed' })
    return
  }
}
