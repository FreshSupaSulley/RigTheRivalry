// https://github.com/ZFC-Digital/puppeteer-real-browser
import { connect } from "puppeteer-real-browser";

const { browser, page } = await connect({
    headless: false,
    args: [],
    customConfig: {},
    turnstile: true,
    connectOption: {},
    disableXvfb: false,
    ignoreAllFlags: false,
});

// TODO: put this in a thread to extract while the token is still generating. When both are done, then vote
// I assume this stays the same? Might need to extract from the site
const voteURL = "https://d33k4o8eoztw5u.cloudfront.net";
var pairData, osuIndex;

while (true) {
    const response = await fetch(`${voteURL}/getPair`);
    const data = await response.json();
    console.log(data);
    // Check if 1 is OSU, and 1 is Michigan
    if (data[0].university !== data[1].university) {
        pairData = data;
        osuIndex = data[0].university == "OSU" ? 0 : 1;
        break;
    }
    console.log("Same college, gonna keep looking...");
}

// First, wait for getPair to come back
// page.on("response", async (res) => {
//     const url = res.url();
//     if (url.includes("/getPair")) {
//         const data = await res.json();
//         // Store for voting in about 2 more seconds
//         voteURL = url;
//         pairData = data;
//         osuIndex = data[0].university == "OSU" ? 0 : 1;
//     }
// });

/**
 * WHAT WE SHOULD DO INSTEAD
 * 
 * Constantly smash https://URL.cloudfront.net/getPair
 * 
 * Then once we get OSU v Michigan, only vote for OSU.
 */
await page.goto("https://ranktherivalry.com/#/vote");
const result = await page.evaluate(() => {
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
}).then(async token => {
    console.log("Token acquired:", token);
    return fetch(`${voteURL}/vote`, {
        method: "POST",
        headers: {
            'x-turnstile-token': token
        },
        body: JSON.stringify({
            loserUrl: pairData[(osuIndex + 1) % 2].profileUrl,
            winnerUrl: pairData[osuIndex].profileUrl
        })
    });
}).then(async response => {
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
