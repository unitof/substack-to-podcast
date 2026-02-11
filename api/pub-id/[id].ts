import axios from 'axios'
import { Podcast } from 'podcast'
import type { VercelRequest, VercelResponse } from '@vercel/node'

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
}

type ApiErrorShape = {
  response?: {
    status?: number
    data?: unknown
  }
  message?: string
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

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    let substackSidCookie = ''

    console.log(req.headers['user-agent'])

    if (process.env.SUBSTACK_SID) {
      // Useful during development to avoid login throttling while iterating.
      console.warn('Using process.env.SUBSTACK_SID to avoid SS ratelimits')
      substackSidCookie = process.env.SUBSTACK_SID
    } else {
      // This route returns cached login cookies so we avoid logging in on every request.
      if (!process.env.VERCEL_URL) {
        throw new Error('VERCEL_URL is not set')
      }

      const loginCookies = await axios.get<string[]>(`http://${process.env.VERCEL_URL}/api/login`)
      substackSidCookie = loginCookies.data?.find(cookie => cookie.startsWith('substack.sid=')) || ''
    }

    if (!substackSidCookie) {
      console.error('Missing substack.sid cookie for publication feed generation')
      res.status(500).json({ error: 'Could not authenticate with Substack' })
      return
    }

    const reqParams = new URL('https://example.com' + req.url).searchParams
    const publicationId = reqParams.get('id')

    if (!publicationId) {
      res.status(400).json({ error: 'Missing publication id' })
      return
    }

    const substackPosts = await axios.get<PublicationPostsResponse>(
      `https://api.substack.com/api/v1/publications/${publicationId}/posts?page=0&includeCrossPosts=true`,
      {
        headers: {
          Cookie: substackSidCookie
        }
      }
    )

    // Substack post payloads vary a lot; these defaults prevent runtime crashes.
    const posts = Array.isArray(substackPosts.data?.posts) ? substackPosts.data.posts : []
    const firstPost = posts[0]
    const firstByline = getFirstByline(firstPost)

    // Substack's publication endpoint is the most stable source for feed-level metadata.
    let publicationInfo: PublicationPost['publication'] | null = null
    try {
      const publicationResponse = await axios.get<PublicationPost['publication']>(
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

    const fallbackPublication = getPublicationFromPosts(posts)
    const publication = publicationInfo || fallbackPublication || {}
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
        description: `${post.subtitle || ''}\n\n${post.description || ''}\n\n${post.canonical_url || ''}`,
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

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
    res.end(feed.buildXml({ indent: '\t' }))
    return
  } catch (error: unknown) {
    const normalizedError = error as ApiErrorShape
    logApiError('Publication feed generation failed', normalizedError, { path: req?.url })
    res.status(normalizedError?.response?.status || 502).json({ error: 'Failed to build publication feed' })
    return
  }
}
