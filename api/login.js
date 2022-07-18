import getLoginResponse from '../lib/ss-login'

export default async (req, res) => {
  try {
    const loginResponse = await getLoginResponse({
      substackEmail: req.body.ssEmail || process.env.SUBSTACK_EMAIL,
      substackPassword: req.body.ssPassword || process.env.SUBSTACK_PASSWORD
    })
    // console.debug(loginResponse)
    const cookies = loginResponse.headers['set-cookie']

    // cache for 24 hours, refresh in BG up to 30 days
    res.setHeader('Cache-Control', `s-maxage=${1 * 24 * 60 * 60}, stale-while-revalidate=${30 * 24 * 60 * 60}`)
    res.json(cookies)
  }

  catch (loginError) {
    console.log('Substack login API returned:', loginResponse)
    res.json(loginError)
  }
}
