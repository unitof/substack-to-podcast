import axios, { type AxiosResponse } from 'axios'

type LoginResponse = AxiosResponse

const LOGIN_URL = 'https://substack.com/api/v1/login'
const LOGIN_RETRYABLE_CODES = new Set(['ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET'])

function shouldRetryLogin(error: unknown): boolean {
  const errorCode = (error as { code?: string } | undefined)?.code
  return Boolean(errorCode && LOGIN_RETRYABLE_CODES.has(errorCode))
}

export default async function getLoginResponse(): Promise<LoginResponse> {
  let lastError: unknown

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return await axios.post(
        LOGIN_URL,
        {
          email: process.env.SUBSTACK_EMAIL,
          for_pub: '',
          redirect: '/',
          password: process.env.SUBSTACK_PASSWORD,
          captcha_response: null
        },
        {
          timeout: 20_000,
          headers: {
            Host: 'substack.com',
            'Content-Type': 'application/json',
            Origin: 'https://substack.com',
            'Accept-Encoding': 'gzip, deflate, br',
            Connection: 'keep-alive',
            Accept: '*/*',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15',
            Referer: 'https://substack.com/sign-in?redirect=%2F',
            'Accept-Language': 'en-US,en;q=0.9'
          }
        }
      )
    } catch (error: unknown) {
      lastError = error
      if (!shouldRetryLogin(error) || attempt === 2) {
        throw error
      }

      console.warn('Substack login request failed, retrying once', {
        attempt,
        code: (error as { code?: string } | undefined)?.code,
        message: (error as { message?: string } | undefined)?.message
      })
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Substack login failed')
}
