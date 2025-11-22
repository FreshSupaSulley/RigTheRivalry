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

await page.goto("https://ranktherivalry.com/#/vote");

// TODO: put this in a thread to extract while the token is still generating. When both are done, then vote
// I assume this stays the same? Might need to extract from the site
const voteURL = "https://d33k4o8eoztw5u.cloudfront.net";
var pairData, osuIndex;

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

const result = await Promise.all([fetchPairData(), getTokenFromPage()]).then(([data, token]) => {
    console.log("Both tasks complete");
    return fetch(`${voteURL}/vote`, {
        method: "POST",
        headers: {
            'x-turnstile-token': token
        },
        body: JSON.stringify({
            loserUrl: data.candidates[(data.osuIndex + 1) % 2].profileUrl,
            winnerUrl: data.candidates[data.osuIndex].profileUrl
        })
    }).then(async response => {
        if (!response.ok) {
            throw new Error(`Vote failed with status: ${response.status}`);
        }
        console.log("Vote successful:", await response.json());
        return true;
    })
}).catch(e => {
    console.error("Failed to bot this bitch:", e);
    return false;
});

console.log("Success:", result);
browser.close();
