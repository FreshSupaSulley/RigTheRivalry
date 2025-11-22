# Rig The Rivalry

Passively runs an endless (non-headless) browser that passively votes for OSU, thanks to [Puppeteer Real Browser](https://github.com/ZFC-Digital/puppeteer-real-browser).

> `headless` must be `false` to properly bypass the CAPTCHA to generate a Turnstile token </3

## Running

1. `npm i`
2. `node main.js`

## How it works

Puppeteer instructs the browser to navigate to https://ranktherivalry.com/#/vote and it just sits there, generating Turnstile tokens on-demand. The browser returns the token to Puppeteer, which then attaches it to `/vote` to rank a random OSU student over a random Michigan student.

When 403s are inevitably encountered, Puppeteer waits a certain amount of time before trying again. There is no "win condition", it runs indefinitely.

### How this could be improved

Distributed compute (and IP spread), to throw off Cloudflare's bot protection. Obviously impractical. This isn't me vs whoever made this site, this is me vs Cloudflare - and no one is winning that battle. So this script embraces "slow and steady wins the race", with the expectation of the following:

1. No one else is botting like this, and if they are, it's not as fast (a generous assumption).
2. The site is not popular enough with regular traffic to ignore the effects of this script.
3. This script will run 24/7.
4. I won't get IP blocked.
5. The ballots casted at my IP address won't be erased from the leaderboard.

## What the dev did right

1. Protecting `/vote` with Cloudflare Turnstile tokens.
2. Rate limiting how often someone can smash `/vote` (you get 403s after a while), _and_ `/getPair` (it's probably a site-wide rate limit).

## What the dev should've done better

1. Don't let me vote with just anyone. The frontend uses `/getPair` to get the candidates to vote for. Ensure that the client sticks to it!
2. Never send participant information to the client before you actually vote. Fetch the candidates _after_ to show who you voted for.

... and fix the CORS errors lol.
