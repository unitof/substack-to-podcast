# Substackwoofer

## Personal Substack feed to audio podcast feed

In June 2022, Substack started [generating text-to-speech](https://on.substack.com/i/60531892/introducing-text-to-speech) versions of all published articles. These are currenly only explosed when using Substack iOS app, but a little [reverse engineering](https://twitter.com/unitof/status/1543309403453100034) revealed that they are hosted at predictable, public AWS URLs: `https://substack-video.s3.amazonaws.com/video_upload/post/[post ID]/tts/en-US-JennyNeural.mp3` (public even for subscriber-only posts!).

This is a li’l side project I did to prove to myself I can finish at least one li’l side project. It lets you subscribe to your own Substack feed as a podcast, where the episodes are those generated text-to-speech files.

Substack has no official API, so this does take your full login credentials to piece one together using cookies. I’m not comfy handling those so you’ll have to deploy and host this yourself if you want to use it. It’s designed to live on Vercel, which I like and is free.

1. [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Funitof%2Fsubstack-to-podcast&env=SUBSTACK_EMAIL,SUBSTACK_PASSWORD&envDescription=Substack%20doesn’t%20have%20an%20official%20API%20or%20OAuth%2C%20so%20we%20have%20to%20authenticate%20the%20clunky%20reverse-engineerish%20way%3A%20login%20once%2C%20cache%20the%20returned%20authentication%20cookie%2C%20reuse%20for%2024%20hours%2C%20repeat.%20If%20entering%20these%20makes%20you%20uncomfy%2C%20you’re%20correct!&envLink=https%3A%2F%2Fsupport.substack.com%2Fhc%2Fen-us%2Farticles%2F360038433912-Does-Substack-have-an-API-&project-name=substackwoofer&repo-name=substack-to-podcast&demo-title=Substackwoofer&demo-description=Generate%20a%20podcast%20from%20your%20Substack%20feed&demo-url=https%3A%2F%2Fsubstackwoofer.vercel.app)
2. Put in your Substack email & password as environment variables. If this creeps you out (it should!), definitely stop and read the code.
3. Subscribe to `https://[Your Deploy URL]/api/feed` in a podcast player. We still calling them podcatchers?

If you’re new to stuff like this and eager to learn, reach out and tell me specifically where you’re stuck! I’m happy to help you learn—many have helped me.

<small>**Not affiliated with Substack**, could break anytime, designed for personal & educational use only, no guarantees, etc.</small>
