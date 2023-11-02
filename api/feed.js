const axios = require('axios')
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

  const substackPosts = await axios.get(
    // page 0 = latest 12 posts
    'https://api.substack.com/api/v1/inbox_v2',
    {
      headers: {
        Cookie: substackSidCookie
      }
    }
  )

	// console.log('FROM SUBSTACK:')
	// console.log(substackPosts.data) //debug

  const feed = new Podcast({
    title: 'My Substack Audio Feed',
    description: 'Totally unofficial feed generated for personal use in podcast players',
    author: 'Jacob ¶. Ford',
    siteUrl: 'https://substackwoofer.vercel.app',
    imageUrl: substackPosts.data.items[0].cover_photo_url // dumb but i want an image
  })

  substackPosts.data.items.filter(post => post.audio_url).forEach(post => {
    console.log('post', post)
    console.log('post.published_bylines', post.published_bylines)
    console.log('post.published_bylines[0]', post.published_bylines[0])
    console.log('post.published_bylines[0].name', post.published_bylines[0].name)
    feed.addItem({
      title: `${post.publisher_name}: ${post.title}`,
      description: post.detail_view_subtitle,
      url: post.web_url,
      guid: post.uuid,
      author: Array.isArray(post.authors)
        ? post.authors.join(' & ')
        : post.publisher_name,
      date: post.created_at,
      enclosure: {
        url: post.audio_url,
        type: 'audio/mpeg'
      },
      image: post.cover_photo_url
    })
  })

  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8')
  res.end(feed.buildXml('\t'))
}
