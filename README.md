# Rig The Rivalry

Passively runs an endless (headed) browser that votes for OSU students, thanks to [Puppeteer Real Browser](https://github.com/ZFC-Digital/puppeteer-real-browser).

## Running

1. `npm i`
2. `node main.js`

### Scripts

| Name    | Purpose                                                                                                                      |
| ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| main.js | Votes for the lowest ELO OSU students over the highest ELO UMich students from a precompiled list, generated with `farm.js`. |
| farm.js | Harvests participants from `/getPair` into one giant JSON object (it's gitignored).                                          |
| test.js | Collects, tests, and outputs a list of proxies to the running directory from sketchy repos.                                  |

The other JS files are utility scripts.

## How it works

To work around the site's rate limits, we're taking advantage of proxy lists I found on random GitHub repos. "Workers" distribute the traffic across them to avoid getting IP traced. It's overkill, but Tor could also be explored as an option.

### Turnstile tokens

Each time we hit `/vote`, we need a turnstile token to complete the request. Puppeteer instructs the browser to navigate to https://ranktherivalry.com/#/vote and sit there generating Turnstile tokens. Because simply refreshing the home page enough times will get you rate limited, I was worried about mass generating tokens. But this process, importantly, doesn't appear to have a rate limit that's tied to the site (and has less strict rate limits)! This means you can churn out turnstile tokens like pancakes and return the token to Puppeteer, which then attaches it to `/vote` to rank a random OSU student over a random Michigan student.

> I wonder how feasible it would be to launch multiple Puppeteer instances to create many turnstile tokens at once...

### How this script could be improved

This is pretty slow. Turnstile token generating needs to be parallelized (idk how you do that and stay under the radar) and faster proxies could be found (although this is optional, as you can just expand the number of workers to test more proxies at a time). This script embraces "slow and steady wins the race", with the expectation of the following:

- No one else is botting like this, and if they are, it's not as fast.
- The site is not popular enough with regular traffic to naturally ignore the impact of this script.
- My assumption about Cloudflare turnstile tokens not being rate limited very harshly holds true (it's probably not).
- The ballots casted through the IP list won't be erased from the leaderboard.

## What was done right

1. Protecting `/vote` with Cloudflare Turnstile tokens, and discarding that turnstile token when used.
2. Imposing harsh rate limits.

## What could've been done better

- Implement accounts - that's the easiest way to stop all of this (although that's impractical for this). If you force people to login, you can easily rate limit based on users and not per connection _and_ filter out people who abuse the site. Without accounts, you open yourself up to degenerate distributed attacks like this.
- Ensure the server validates that I'm voting for the candidates returned in `/getPair`. Because it doesn't, I was able to vote with any combination of students I want. You could achieve this by attaching a short-lived and randomly generated token / header that represents a "voting session" that internally points to 2 particular candidates, and `/vote` only accepts that token and 0 or 1 for the winner. Or maybe there's no need for a token - just ID the client based on the Cloudflare connection. Once the POST request is successful, only then should it return the candidate information to present the results (see the next line).
- Never trust the client. You shouldn't send participant information before you vote. Anybody can simply watch their network connection to see who belongs to which college and ruin the surprise. Fetch the candidates _after_ to show who you voted for.
