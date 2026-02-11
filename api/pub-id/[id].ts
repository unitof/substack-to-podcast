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
  publicationUsers?: PublicationUser[]
}

type PublicationPost = {
  id?: string
  title?: string
  subtitle?: string
  canonical_url?: string
  post_date?: string
  cover_image?: string
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
    const firstByline = firstPost?.publishedBylines?.[0]
    const firstPublicationUser = firstByline?.publicationUsers?.find(user => user.role === 'admin')?.publication
    const logoUrl = firstPublicationUser?.logo_url || ''
    const logoIsBucketeer = logoUrl.startsWith('https://bucketeer-')

    const feed = new Podcast({
      title: firstPublicationUser?.name || `Substack ${publicationId}`,
      description: firstPublicationUser?.hero_text || '',
      author: firstByline?.name || '',
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
        description: `${post.subtitle || ''}\n\n${post.canonical_url || ''}`,
        url: post.canonical_url || '',
        guid: post.id || post.canonical_url || undefined,
        author: Array.isArray(post.published_bylines)
          ? post.published_bylines[0]?.name
          : post.publisher_name,
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
