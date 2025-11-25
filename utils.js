// https://github.com/ZFC-Digital/puppeteer-real-browser
import { connect } from "puppeteer-real-browser";

// I assume this stays the same? Might need to extract from the site
export const cfURL = "https://d33k4o8eoztw5u.cloudfront.net";

// Use the proxy for this
export const participants = await fetch(`${cfURL}/leaderboard`).then(response => {
  if (response.ok) {
    return response.json();
  }
  throw response.text();
}, cfURL).catch(async (e) => {
  console.error("Can't fetch the leaderboard. Abandoning...\n", await e);
  process.exit(1);
});

export const osu = participants.filter(p => p.university === "OSU");
export const umich = participants.filter(p => p.university === "UMich");

export default async function runClient(turnstileCallback, proxyOptions) {
  console.log("Starting turnstile token slave...");
  const { browser, page } = await connect({
    // Apparently only headless: false consistently bypasses CAPTCHAs so we're fucked on this one ig
    // https://github.com/ZFC-Digital/puppeteer-real-browser/issues/272
    headless: false,
    proxy: proxyOptions,
    // ... so let's reduce our footprint
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--disable-infobars",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--password-store=basic",
      "--use-mock-keychain",
      "--window-size=1,1",
      "--window-position=0,0",
      "--hide-scrollbars",
      "--disable-infobars",
      "--disable-background-networking",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      "--disable-extensions",
      "--disable-features=IsolateOrigins,site-per-process,TranslateUI",
      "--mute-audio",
      "--start-minimized",
      // These seem to fuck shit up
      // '--no-sandbox',
      // '--disable-setuid-sandbox',
      // '--remote-debugging-port=0',
      // '--no-startup-window',
    ],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: true, // to get raspberry pi to work
    ignoreAllFlags: false,
  });

  await page.setViewport({
    width: 400,
    height: 300,
    deviceScaleFactor: 1,
  });

  await page.goto("https://ranktherivalry.com/#/vote", {
    // Disable the timeout (30s default)
    timeout: 0,
  });

  // Instead of fetching live pairs just grab participants at random
  async function fetchPairData() {
    const random = arr => arr[Math.floor(Math.random() * arr.length)];
    return {
      candidates: [random(osu), random(umich)],
      osuIndex: 0,
    };
  }

  // TODO: make this function indefinitely try and try again if it ever fails
  async function getTokenFromPage() {
    return await page.evaluate(() => {
      // Get a new token (the ? is to ensure the widget / api script exists, which it usually doesn't on first boot)
      window.turnstile?.reset();
      return new Promise((resolve, reject) => {
        // Listen for the message event
        window.addEventListener("message", (event) => {
          if (event.data.token) {
            resolve(event.data.token);
          }
        });
        // Handle timeout in case the event doesn't fire
        setTimeout(() => reject("Turnstile token too long :("), 120 * 1000); // tweak as necessary (slow hardware / proxy)
      });
    });
  }

  const successTimeout = 3000; // MS to wait if successful
  const errorTimeout = 60 * 1000; // If something goes wrong, back off for a while
  const timeoutVariance = 3000; // [0 - timeoutVariance) extra MS to wait, picked at random, to potentially throw off CF
  var attempt = 0,
    successes = 0,
    failures = 0;

  var turnstile = await getTokenFromPage();

  // Go indefinitely
  while (true) {
    // console.log(`Attempt ${++attempt} (successes: ${successes}, failures: ${failures})`);

    // Once the candidates are fetched AND the turnstile token is extracted, then vote
    const success = await fetchPairData()
      .then(async (data) => {
        // console.log("Voting...");
        // Return the token back to the main loop
        turnstileCallback(turnstile);
        // const response = await proxyFetch(`${cfURL}/vote`, {
        //   method: "POST",
        //   headers: {
        //     "x-turnstile-token": turnstile,
        //   },
        //   body: JSON.stringify({
        //     loserUrl: data.candidates[(data.osuIndex + 1) % 2].profileUrl,
        //     winnerUrl: data.candidates[data.osuIndex].profileUrl,
        //   }),
        // });
        // if (!response.ok) {
        //   throw new Error(`Vote failed with status: ${response.status} - ${await response.text()}`);
        // }
        // console.log("Vote successful:", await response.json());
        successes++;
        return true;
      })
      .catch((e) => {
        failures++;
        console.error("Failed to bot this bitch:", e);
        return false;
      });

    // Wait an arbitrary amount of time before trying again
    // If there was an error, wait a longer amount of time
    const cooldown = new Promise((resolve) => setTimeout(resolve, timeoutVariance * Math.random() + (success ? successTimeout : errorTimeout)));

    // But during the /vote cooldown, generate another turnstile token
    [, turnstile] = await Promise.all([cooldown, getTokenFromPage()]);
  }
}

export async function timeoutRace(promise, timeout) {
  return await Promise.race([promise, new Promise((_, reject) =>
    setTimeout(() => reject(new Error("Fetch timed out")), timeout))
  ]);
}

export async function sleep(timeout) {
  return new Promise(resolve => setTimeout(resolve, timeout));
}

export function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}
