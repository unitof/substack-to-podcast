import axios from 'axios'
import { Podcast } from 'podcast'

function logApiError(context, error, extra = {}) {
  console.error(context, {
    ...extra,
    message: error?.message,
    status: error?.response?.status,
    responseData: error?.response?.data
  })
}

export default async (req, res) => {
  try {
    let substackSidCookie = ''

    console.log(req.headers['user-agent'])

    if (process.env.SUBSTACK_SID) {
      // prevent 429 errors while developing
      console.warn('Using process.env.SUBSTACK_SID to avoid SS ratelimits')
      substackSidCookie = process.env.SUBSTACK_SID
    } else {
      // use URL to take advantage of caching
      if (!process.env.VERCEL_URL) {
        throw new Error('VERCEL_URL is not set')
      }

      const loginCookies = await axios.get(`http://${process.env.VERCEL_URL}/api/login`)
      substackSidCookie = loginCookies.data?.find(cookie => cookie.startsWith('substack.sid='))
    }

    if (!substackSidCookie) {
      console.error('Missing substack.sid cookie for publication feed generation')
      return res.status(500).json({ error: 'Could not authenticate with Substack' })
    }

    const reqParams = new URL('https://example.com' + req.url).searchParams // idk
    const publicationId = reqParams.get('id')

    if (!publicationId) {
      return res.status(400).json({ error: 'Missing publication id' })
    }

    const substackPosts = await axios.get(
      // page 0 = latest 12 posts
      `https://api.substack.com/api/v1/publications/${publicationId}/posts?page=0&includeCrossPosts=true`,
      {
        headers: {
          Cookie: substackSidCookie
        }
      }
    )

    // console.log('FROM SUBSTACK:')
    // console.log(substackPosts.data) //debug
    const posts = Array.isArray(substackPosts.data?.posts) ? substackPosts.data.posts : []
    const firstPost = posts[0]
    const firstByline = firstPost?.publishedBylines?.[0]
    const firstPublicationUser = firstByline?.publicationUsers?.find(user => user.role == 'admin')?.publication
    const logoIsBucketeer = firstPublicationUser?.logo_url?.startsWith('https://bucketeer-') || false

    const feed = new Podcast({
      title: firstPublicationUser?.name || `Substack ${publicationId}`,
      description: firstPublicationUser?.hero_text || '',
      author: firstByline?.name || '',
      siteUrl: 'https://substackwoofer.vercel.app',
      imageUrl: logoIsBucketeer
        ? `https://substackcdn.com/image/fetch/${encodeURIComponent(firstPublicationUser.logo_url)}` // bucketeer access restricted
        : (firstPublicationUser?.logo_url || '')
    })

    posts.filter(post => post.audio_items?.length).forEach(post => {
      feed.addItem({
        title: post.title,
        description: `${post.subtitle}\n\n${post.canonical_url}`,
        url: post.canonical_url,
        guid: post.id,
        author: Array.isArray(post.published_bylines)
          ? post.published_bylines[0]?.name
          : post.publisher_name,
        date: post.post_date,
        enclosure: {
          url: post.audio_items[0].audio_url,
          type: 'audio/mpeg'
        },
        image: post.cover_image
      })
    })

    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
    return res.end(feed.buildXml('\t'))
  } catch (error) {
    logApiError('Publication feed generation failed', error, { path: req?.url })
    return res.status(error?.response?.status || 502).json({ error: 'Failed to build publication feed' })
  }
}
