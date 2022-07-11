const axios = require('axios')

export default async (req, res) => {
  if (process.env.SUBSTACK_SID) {
    // prevent 429 errors while developing
    const substackSid = process.env.SUBSTACK_SID
  } else {
    // use URL to take advantage of caching
    const loginCookies = await axios.get(`${process.env.VERCEL_URL}/api/login`)
    const substackSid = loginCookies.find(cookie => cookie.startsWith('substack.sid='))
  }

  res.json(substackSid)
}