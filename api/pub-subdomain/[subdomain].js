export async function GET(req) {
  // console.log(request) //debug

  const reqParams = new URL('https://example.com' + req.url).searchParams
  const publicationSubdomain = reqParams.get('subdomain')

  const publicationInfoRequest = await fetch(`https://api.substack.com/api/v1/publications/${publicationSubdomain}`)
  const substackResponse = await publicationInfoRequest.json()

  if (publicationInfoRequest.status !== 200) {
    return Response.json(substackResponse)
  } else {
    return new Response(null, {
      status: 308,
      headers: {
        Location: `/api/pub-id/${substackResponse.id}`,
      },
    });
  }
}
