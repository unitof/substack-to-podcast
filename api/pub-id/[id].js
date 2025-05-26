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
  console.log(publicationId)

  const substackPosts = await axios.get(
    // page 0 = latest 12 posts
    `https://api.substack.com/api/v1/publications/${publicationId}/posts?page=0&includeCrossPosts=true`,
    {
      headers: {
        Cookie: substackSidCookie
      }
    }
  )

	console.log('FROM SUBSTACK:')
	console.log(substackPosts.data) //debug

  const firstPost = substackPosts.data.posts[0]
  const firstPublicationUser = firstPost.publishedBylines[0].publicationUsers.find(user => user.role == "admin").publication

  const feed = new Podcast({
    title: firstPublicationUser.name,
    description: firstPublicationUser.hero_text,
    author: firstPost.publishedBylines[0].name,
    siteUrl: 'https://substackwoofer.vercel.app',
    imageUrl: firstPost.cover_photo_url
  })

  substackPosts.data.posts.filter(post => post.inboxItem?.audio_url).forEach(post => {
    const inboxItem = post.inboxItem
    feed.addItem({
      title: `${inboxItem.title}`,
      description: `${inboxItem.detail_view_subtitle}\n\n${inboxItem.web_url}`,
      url: inboxItem.web_url,
      guid: inboxItem.uuid,
      author: Array.isArray(inboxItem.published_bylines)
        ? inboxItem.published_bylines[0]?.name
        : inboxItem.publisher_name,
      date: inboxItem.created_at,
      enclosure: {
        url: inboxItem.audio_url,
        type: 'audio/mpeg'
      },
      image: inboxItem.cover_photo_url
    })
  })

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
  res.end(feed.buildXml('\t'))
}
