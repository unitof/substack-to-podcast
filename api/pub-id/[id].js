import axios from 'axios'
import { Podcast } from 'podcast'

export default async (req, res) => {
  let substackSidCookie = ''

  console.log(req.headers['user-agent'])

  if (process.env.SUBSTACK_SID) {
    // prevent 429 errors while developing
    console.warn('Using process.env.SUBSTACK_SID to avoid SS ratelimits')
    substackSidCookie = process.env.SUBSTACK_SID
  } else {
    // use URL to take advantage of caching
    const loginCookies = await axios.get(`http://${process.env.VERCEL_URL}/api/login`)
    substackSidCookie = loginCookies.data.find(cookie => cookie.startsWith('substack.sid='))
  }

  const reqParams = new URL('https://example.com' + req.url).searchParams // idk
  const publicationId = reqParams.get('id')

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

  const firstPost = substackPosts.data.posts[0]
  const firstPublicationUser = firstPost.publishedBylines[0].publicationUsers.find(user => user.role == "admin").publication
  const logoIsBucketeer = firstPublicationUser.logo_url?.startsWith('https://bucketeer-')

  const feed = new Podcast({
    title: firstPublicationUser.name,
    description: firstPublicationUser.hero_text,
    author: firstPost.publishedBylines[0].name,
    siteUrl: 'https://substackwoofer.vercel.app',
    imageUrl: logoIsBucketeer
      ? `https://substackcdn.com/image/fetch/${encodeURIComponent(firstPublicationUser.logo_url)}` // bucketeer access restricted
      : firstPublicationUser.logo_url
  })

  substackPosts.data.posts.filter(post => post.audio_items?.length).forEach(post => {
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
  res.end(feed.buildXml('\t'))
}
