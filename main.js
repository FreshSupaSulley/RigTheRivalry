// https://github.com/ZFC-Digital/puppeteer-real-browser
import { connect } from "puppeteer-real-browser";

// I assume this stays the same? Might need to extract from the site
const cfURL = "https://d33k4o8eoztw5u.cloudfront.net";

// Fetch the leaderboard
const participants = await (await fetch(`${cfURL}/leaderboard`)).json();
const osu = participants.filter(p => p.university === "OSU");
const umich = participants.filter(p => p.university === "UMich");

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
    disableXvfb: true, // to get raspberry pi to work
    ignoreAllFlags: false,
});

await page.setViewport({
    width: 400,
    height: 300,
    deviceScaleFactor: 1
});

await page.goto("https://ranktherivalry.com/#/vote");

// LEGACY
// async function fetchPairData() {
//     while (true) {
//         const response = await fetch(`${cfURL}/getPair`);
//         if (!response.ok) {
//             throw new Error("Failed getting candidates: " + await response.text());
//         }
//         const data = await response.json();
//         // Check if 1 is OSU, and 1 is Michigan
//         if (data[0].university !== data[1].university) {
//             console.log("OSU v Mich found!");
//             return {
//                 candidates: data,
//                 osuIndex: data[0].university == "OSU" ? 0 : 1
//             }
//         }
//         console.log("Same college, gonna keep looking...");
//     }
// }

// Instead of fetching live pairs just grab participants at random
async function fetchPairData() {
    const random = arr => arr[Math.floor(Math.random() * arr.length)];
    return {
        candidates: [random(osu), random(umich)],
        osuIndex: 0
    }
}

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
            setTimeout(() => reject("Turnstile token too long :("), 30000); // yes, it can take close to this long (on a pi)
        });
    });
}

const successTimeout = 6000; // MS to wait if successful
const errorTimeout = 60 * 1000; // If something goes wrong, back off for a while
const timeoutVariance = 5000; // [0 - timeoutVariance) extra MS to wait, picked at random, to potentially throw off CF
var attempt = 0, successes = 0, failures = 0;

var turnstile = await getTokenFromPage();

// Go indefinitely
while (true) {
    console.log(`Attempt ${++attempt} (successes: ${successes}, failures: ${failures})`);

    // Once the candidates are fetched AND the turnstile token is extracted, then vote
    const success = await fetchPairData().then(async data => {
        console.log("Voting...");
        const response = await fetch(`${cfURL}/vote`, {
            method: "POST",
            headers: {
                'x-turnstile-token': turnstile
            },
            body: JSON.stringify({
                loserUrl: data.candidates[(data.osuIndex + 1) % 2].profileUrl,
                winnerUrl: data.candidates[data.osuIndex].profileUrl
            })
        });
        if (!response.ok) {
            throw new Error(`Vote failed with status: ${response.status} - ${await response.text()}`);
        }
        console.log("Vote successful:", await response.json());
        successes++;
        return true;
    }).catch(e => {
        failures++;
        console.error("Failed to bot this bitch:", e);
        return false;
    });

    console.log("Success:", success);

    // Wait an arbitrary amount of time before trying again
    // If there was an error, wait a longer amount of time
    const cooldown = new Promise((resolve => setTimeout(resolve, timeoutVariance * Math.random() + (success ? successTimeout : errorTimeout))));

    // But during the /vote cooldown, generate another turnstile token
    [, turnstile] = await Promise.all([cooldown, getTokenFromPage()]);
}

// browser.close();
