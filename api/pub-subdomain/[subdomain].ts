export async function GET(req: Request): Promise<Response> {
  // We parse search params from the incoming URL so `/api/pub-subdomain/:name` can redirect.
  const reqParams = new URL('https://example.com' + req.url).searchParams
  const publicationSubdomain = reqParams.get('subdomain')

  const publicationInfoRequest = await fetch(`https://api.substack.com/api/v1/publications/${publicationSubdomain}`)
  const substackResponse = await publicationInfoRequest.json() as { id?: string }

  if (publicationInfoRequest.status !== 200) {
    return Response.json(substackResponse)
  }

  return new Response(null, {
    status: 308,
    headers: {
      Location: `/api/pub-id/${substackResponse.id}`,
    },
  })
}
