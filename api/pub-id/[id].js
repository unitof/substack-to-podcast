import axios from 'axios'
import { Podcast } from 'podcast'

function getFirstByline(post) {
  if (!post) return null
  if (Array.isArray(post.publishedBylines) && post.publishedBylines.length) {
    return post.publishedBylines[0]
  }
  if (Array.isArray(post.published_bylines) && post.published_bylines.length) {
    return post.published_bylines[0]
  }
  return null
}

function getPublicationFromPosts(posts) {
  for (const post of posts) {
    if (!post) continue

    if (post.publication) return post.publication
    if (post.publisher) return post.publisher

    const byline = getFirstByline(post)
    if (byline?.publication) return byline.publication

    const adminPublication = byline?.publicationUsers?.find(user => user?.role === 'admin')?.publication
    if (adminPublication) return adminPublication
  }
  return null
}

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
    const firstByline = getFirstByline(firstPost)

    // Substack's publication endpoint is the most stable source for feed-level metadata.
    let publicationInfo = null
    try {
      const publicationResponse = await axios.get(
        `https://api.substack.com/api/v1/publications/${publicationId}`,
        {
          headers: {
            Cookie: substackSidCookie
          }
        }
      )
      publicationInfo = publicationResponse.data
    } catch (error) {
      console.warn('Failed to fetch publication details, using post-level fallback', {
        publicationId,
        message: error?.message,
        status: error?.response?.status
      })
    }

    const fallbackPublication = getPublicationFromPosts(posts)
    const publication = publicationInfo || fallbackPublication || {}
    const publicationLogoUrl = publication.logo_url || publication.logoUrl || ''
    const logoIsBucketeer = publicationLogoUrl.startsWith('https://bucketeer-')

    const feed = new Podcast({
      title: publication?.name || publication?.title || firstPost?.publisher_name || `Substack ${publicationId}`,
      description: publication?.hero_text || publication?.description || '',
      author: firstByline?.name || publication?.author_name || publication?.name || '',
      siteUrl: 'https://substackwoofer.vercel.app',
      imageUrl: logoIsBucketeer
        ? `https://substackcdn.com/image/fetch/${encodeURIComponent(publicationLogoUrl)}` // bucketeer access restricted
        : publicationLogoUrl
    })

    posts.filter(post => post.audio_items?.length).forEach(post => {
      const byline = getFirstByline(post)
      feed.addItem({
        title: post.title,
        description: `${post.subtitle}\n\n${post.canonical_url}`,
        url: post.canonical_url,
        guid: post.id,
        author: byline?.name || post.publisher_name || publication?.name || '',
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
