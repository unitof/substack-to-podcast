const axios = require('axios')

export default async (req, res) => {
  let substackSid = ''

  if (process.env.SUBSTACK_SID) {
    // prevent 429 errors while developing
    substackSid = process.env.SUBSTACK_SID
  } else {
    // use URL to take advantage of caching
    const loginCookies = await axios.get(`http://${process.env.VERCEL_URL}/api/login`)
    console.log('loginCookies', loginCookies)
    substackSid = loginCookies.data.find(cookie => cookie.startsWith('substack.sid='))
  }

  res.json(substackSid)
}
