import getLoginResponse from '../lib/ss-login'

export default async (req, res) => {
  const loginResponse = await getLoginResponse
  console.log(loginResponse)
  const cookies = loginResponse.headers['set-cookie']
  res.end(JSON.stringify(cookies))
}
