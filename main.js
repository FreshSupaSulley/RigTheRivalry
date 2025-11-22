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

// First, wait for getPair to come back
var voteURL, pairData, osuIndex;
page.on("response", async (res) => {
    const url = res.url();
    if (url.includes("/getPair")) {
        const data = await res.json();
        // Store for voting in about 2 more seconds
        voteURL = url;
        pairData = data;
        osuIndex = data[0].university == "OSU" ? 0 : 1;
    }
});

/**
 * WHAT WE SHOULD DO INSTEAD
 * 
 * Constantly smash https://URL.cloudfront.net/getPair
 * 
 * Then once we get OSU v Michigan, only vote for OSU.
 */

/*
 * TODO:
 * If both players are on the same team, do the following:
 * 
 * If both are UMich, vote for the worse ELO score.
 * If both are Ohio State, vote for the higher ELO.
 */

await page.goto("https://ranktherivalry.com/#/vote");
const token = await page.evaluate(() => {
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
    console.log("RAHH!H!!", token);
    let response = await fetch(voteURL.replace("getPair", "vote"), {
        method: "POST",
        headers: {
            'x-turnstile-token': token
        },
        body: JSON.stringify({
            loserUrl: pairData[(osuIndex + 1) % 2].profileUrl,
            winnerUrl: pairData[osuIndex].profileUrl
        })
    });
    console.log("RESPONSE", await response.json());
}).catch(e => {
    console.error("Failed to bot this bitch:", e);
    return null;
});
