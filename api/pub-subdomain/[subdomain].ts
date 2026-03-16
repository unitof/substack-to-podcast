import { getRequestOrigin } from '../../lib/substack-auth'

export async function GET(req: Request): Promise<Response> {
  // We parse search params from the incoming URL so `/api/pub-subdomain/:name` can proxy the feed.
  const reqParams = new URL(req.url, 'https://example.com').searchParams
  const publicationSubdomain = reqParams.get('subdomain')
  if (!publicationSubdomain) {
    return Response.json({ error: 'Missing publication subdomain' }, { status: 400 })
  }

  const publicationInfoRequest = await fetch(`https://api.substack.com/api/v1/publications/${publicationSubdomain}`)
  const substackResponse = await publicationInfoRequest.json() as { id?: string }

  if (publicationInfoRequest.status !== 200) {
    return Response.json(substackResponse, { status: publicationInfoRequest.status })
  }

  if (!substackResponse.id) {
    return Response.json({ error: 'Missing publication id' }, { status: 502 })
  }

  const forwardedHeaders = new Headers()
  const authorization = req.headers.get('authorization')
  if (authorization) {
    forwardedHeaders.set('Authorization', authorization)
  }

  const publicationFeedResponse = await fetch(
    `${getRequestOrigin(req)}/api/pub-id/${substackResponse.id}`,
    { headers: forwardedHeaders }
  )

  return new Response(publicationFeedResponse.body, {
    status: publicationFeedResponse.status,
    headers: publicationFeedResponse.headers
  })
}
