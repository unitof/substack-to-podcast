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

  // Weird glitch with Numb at the Lodge's logo_url, fall back to author
  const useAuthorImage = firstPublicationUser.logo_url == 'https://bucketeer-e05bbc84-baa3-437e-9518-adb32be77984.s3.amazonaws.com/public/images/75fb5a16-c295-4898-b7e3-9ab295cd3530_378x378.png'

  const feed = new Podcast({
    title: firstPublicationUser.name,
    description: firstPublicationUser.hero_text,
    author: firstPost.publishedBylines[0].name,
    siteUrl: 'https://substackwoofer.vercel.app',
    imageUrl: !useAuthorImage ? firstPublicationUser.logo_url : firstPost.publishedBylines[0].photo_url
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
