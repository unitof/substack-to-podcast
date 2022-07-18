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
    'https://api.substack.com/api/v1/inbox/posts?page=0',
    {
      headers: {
        Cookie: substackSidCookie
      }
    }
  )

  const feed = new Podcast({
    title: 'My Substack Audio Feed',
    description: 'Totally unofficial feed generated for personal use in podcast players',
    author: 'Jacob ¶. Ford',
    siteUrl: 'https://substackwoofer.vercel.app',
    imageUrl: substackPosts.data.posts[0].cover_image // dumb but i want an image
  })

  substackPosts.data.posts.filter(post => post.audio_items).forEach(post => {
    feed.addItem({
      title: post.title,
      description: post.description,
      url: post.canonical_url,
      guid: post.id,
      author: post.publishedBylines[0].name,
      date: post.post_date,
      enclosure: {
        url: post.audio_items[0].audio_url
      },
      image: post.cover_image
    })
  })

  res.setHeader('Content-Type', 'application/rss+xml')
  res.end(feed.buildXml('\t'))
}
