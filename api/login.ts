import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { AxiosResponse } from 'axios'
import getLoginResponse from '../lib/ss-login'

export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  try {
    const loginResponse: AxiosResponse = await getLoginResponse
    const cookies = loginResponse.headers['set-cookie'] as string[] | undefined

    // Cache for 24 hours and allow stale responses while background refresh runs.
    res.setHeader('Cache-Control', `s-maxage=${1 * 24 * 60 * 60}, stale-while-revalidate=${30 * 24 * 60 * 60}`)
    res.json(cookies || [])
  } catch (loginError: unknown) {
    console.error(loginError)
    res.status(500).json({ error: 'Substack login failed' })
  }
}
