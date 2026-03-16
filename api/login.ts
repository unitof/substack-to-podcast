import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AxiosResponse } from 'axios'
import getLoginResponse from '../lib/ss-login'
import {
  getSubstackCredentialsFromRequest,
  isSubstackAuthError,
  setBasicAuthChallengeHeader
} from '../lib/substack-auth'

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  res.setHeader('Cache-Control', 'private, no-store')

  try {
    const credentials = getSubstackCredentialsFromRequest(req)
    const loginResponse: AxiosResponse = await getLoginResponse(credentials)
    const cookies = loginResponse.headers['set-cookie'] as string[] | undefined

    res.json(cookies || [])
  } catch (loginError: unknown) {
    if (isSubstackAuthError(loginError)) {
      setBasicAuthChallengeHeader(res)
      res.status(loginError.statusCode).json({ error: loginError.message })
      return
    }

    console.error('Substack login failed', {
      message: (loginError as { message?: string } | undefined)?.message,
      code: (loginError as { code?: string } | undefined)?.code,
      status: (loginError as { response?: { status?: number } } | undefined)?.response?.status
    })
    res.status(502).json({ error: 'Substack login failed' })
  }
}
