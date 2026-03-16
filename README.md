# Substackwoofer

## Personal Substack feed to audio podcast feed

In June 2022, Substack started [generating text-to-speech](https://on.substack.com/i/60531892/introducing-text-to-speech) versions of all published articles. These are currenly only explosed when using Substack iOS app, but a little [reverse engineering](https://twitter.com/unitof/status/1543309403453100034) revealed that they are hosted at predictable, public AWS URLs: `https://substack-video.s3.amazonaws.com/video_upload/post/[post ID]/tts/en-US-JennyNeural.mp3` (public even for subscriber-only posts!).

This is a li’l side project I did to prove to myself I can finish at least one li’l side project. It lets you subscribe to your own Substack feed as a podcast, where the episodes are those generated text-to-speech files.

Substack has no official API, so this still has to authenticate the clunky reverse-engineerish way. The app now expects your podcast player to send HTTP Basic auth with your Substack email and password on each request, or you can optionally configure a raw `SUBSTACK_COOKIE` if you want one shared login cookie for the whole deploy. You’ll still have to deploy and host this yourself if you want to use it. It’s designed to live on Vercel, which I like and is free.

1. [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Funitof%2Fsubstack-to-podcast&project-name=substackwoofer&repo-name=substack-to-podcast&demo-title=Substackwoofer&demo-description=Generate%20a%20podcast%20from%20your%20Substack%20feed&demo-url=https%3A%2F%2Fsubstackwoofer.vercel.app)
2. Optionally set `SUBSTACK_COOKIE` to a raw `Cookie:` header value such as `substack.sid=...; substack.lli=...` if you want the whole deploy to share one authenticated Substack session.
3. Subscribe to `https://[Your Deploy URL]/api/feed` or `https://[Your Deploy URL]/[publication-subdomain]` in a podcast player that supports HTTP Basic auth, and use your Substack email as the username plus your Substack password as the password.

If you’re new to stuff like this and eager to learn, reach out and tell me specifically where you’re stuck! I’m happy to help you learn—many have helped me.

<small>**Not affiliated with Substack**, could break anytime, designed for personal & educational use only, no guarantees, etc.</small>
