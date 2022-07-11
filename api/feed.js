const axios = require('axios')

export default async (req, res) => {
  // use URL to take advantage of caching
  const loginCookies = await axios.get(`${process.env.VERCEL_URL}/api/login`)

  const substackSid = loginCookies.find(cookie => cookie.startsWith('substack.sid='))

  res.json(substackSid)
}