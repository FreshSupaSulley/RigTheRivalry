// https://github.com/ZFC-Digital/puppeteer-real-browser
import { connect } from "puppeteer-real-browser";

// I assume this stays the same? Might need to extract from the site
export const cfURL = "https://d33k4o8eoztw5u.cloudfront.net";

export default async function runClient(pool, turnstileCallback, proxyOptions) {
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

  const cooldown = 2500; // MS to wait between each token
  var turnstile = await getTokenFromPage();

  // Go indefinitely
  while (pool.running) {
    // Return the token back to the main loop
    turnstileCallback(turnstile);
    // Wait a lil bit before generating another generating another
    await sleep(cooldown);
    turnstile = await getTokenFromPage();
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
