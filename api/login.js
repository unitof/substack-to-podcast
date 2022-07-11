import loginReponse from '../lib/ss-login'

export default async (req, res) => {
  await loginReponse
  console.log(loginReponse)
  const cookies = loginReponse.headers['set-cookie']
  res.end(JSON.stringify(cookies))
}
