// https://github.com/ZFC-Digital/puppeteer-real-browser
import { connect } from "puppeteer-real-browser";

const { browser, page } = await connect({
    // Apparently only headless: false consistently bypasses CAPTCHAs so we're fucked on this one ig
    // https://github.com/ZFC-Digital/puppeteer-real-browser/issues/272
    headless: false,
    // ... so let's reduce our footprint
    args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--disable-dev-shm-usage',
        '--disable-infobars',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--password-store=basic',
        '--use-mock-keychain',
        '--window-size=1,1',
        '--window-position=0,0',
        '--hide-scrollbars',
        '--disable-infobars',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-renderer-backgrounding',
        '--disable-backgrounding-occluded-windows',
        '--disable-extensions',
        '--disable-features=IsolateOrigins,site-per-process,TranslateUI',
        '--mute-audio',
        '--start-minimized'
        // These seem to fuck shit up
        // '--remote-debugging-port=0',
        // '--no-startup-window',
    ],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
});

await page.setViewport({
    width: 400,
    height: 300,
    deviceScaleFactor: 1
});

await page.goto("https://ranktherivalry.com/#/vote");

// I assume this stays the same? Might need to extract from the site
const voteURL = "https://d33k4o8eoztw5u.cloudfront.net";

async function fetchPairData() {
    while (true) {
        const response = await fetch(`${voteURL}/getPair`);
        if (!response.ok) {
            throw new Error("Failed getting candidates: " + await response.text());
        }
        const data = await response.json();
        // Check if 1 is OSU, and 1 is Michigan
        if (data[0].university !== data[1].university) {
            console.log("OSU v Mich found!");
            return {
                candidates: data,
                osuIndex: data[0].university == "OSU" ? 0 : 1
            }
        }
        console.log("Same college, gonna keep looking...");
    }
}

async function getTokenFromPage() {
    return await page.evaluate(() => {
        return new Promise((resolve, reject) => {
            // Listen for the message event
            window.addEventListener("message", (event) => {
                if (event.data.token) {
                    resolve(event.data.token);
                }
            });

            // Optionally handle timeout if the event doesn't fire
            setTimeout(() => reject("Token not received in time :("), 5000);
        });
    });
}

// Once the candidates are fetched AND the turnstile token is extracted, then vote
const result = await Promise.all([fetchPairData(), getTokenFromPage()]).then(async ([data, token]) => {
    console.log("Voting...");
    const response = await fetch(`${voteURL}/vote`, {
        method: "POST",
        headers: {
            'x-turnstile-token': token
        },
        body: JSON.stringify({
            loserUrl: data.candidates[(data.osuIndex + 1) % 2].profileUrl,
            winnerUrl: data.candidates[data.osuIndex].profileUrl
        })
    });
    if (!response.ok) {
        throw new Error(`Vote failed with status: ${response.status}`);
    }
    console.log("Vote successful:", await response.json());
    return true;
}).catch(e => {
    console.error("Failed to bot this bitch:", e);
    return false;
});

console.log("Success:", result);
browser.close();
