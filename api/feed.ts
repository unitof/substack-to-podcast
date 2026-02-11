import axios from 'axios'
import { Podcast } from 'podcast'
import type { VercelRequest, VercelResponse } from '@vercel/node'

type FeedPost = {
  audio_url?: string
  cover_photo_url?: string
  publisher_name?: string
  title?: string
  detail_view_subtitle?: string
  web_url?: string
  uuid?: string
  published_bylines?: Array<{ name?: string }>
  created_at?: string
}

type InboxResponse = {
  items?: FeedPost[]
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  let substackSidCookie = ''

  console.log(req.headers['user-agent'])

  if (process.env.SUBSTACK_SID) {
    // Useful during development to avoid login throttling while iterating.
    console.warn('Using process.env.SUBSTACK_SID to avoid SS ratelimits')
    substackSidCookie = process.env.SUBSTACK_SID
  } else {
    // This route returns cached login cookies so we avoid logging in on every request.
    const loginCookies = await axios.get<string[]>(`http://${process.env.VERCEL_URL}/api/login`)
    substackSidCookie = loginCookies.data.find(cookie => cookie.startsWith('substack.sid=')) || ''
  }

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
    feed.addItem({
      title: `${post.publisher_name || ''}: ${post.title || ''}`,
      description: `${post.detail_view_subtitle || ''}\n\n${post.web_url || ''}`,
      url: post.web_url || '',
      guid: post.uuid || post.web_url || undefined,
      author: Array.isArray(post.published_bylines)
        ? post.published_bylines[0]?.name
        : post.publisher_name,
      date: post.created_at,
      enclosure: {
        url: audioUrl,
        type: 'audio/mpeg'
      },
      image: post.cover_photo_url
      // `podcast` typings do not include this field, but RSS consumers use it.
    } as any)
  })

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
  res.end(feed.buildXml({ indent: '\t' }))
}
