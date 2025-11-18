const { connect } = require("puppeteer-real-browser");

async function test() {
    const { browser, page } = await connect({
        headless: false,
        args: [],
        customConfig: {},
        turnstile: true,
        connectOption: {},
        disableXvfb: false,
        ignoreAllFlags: false,
    });

    page.on("response", async (res) => {
        const url = res.url();
        if (url.includes("/getPair")) {
            console.log("getPair response:", url);
            try {
                const data = await res.json();
                console.log("Response JSON:", JSON.stringify(data));
                vote(url, data, data[0].university == "OSU" ? 0 : 1);
            } catch {
                console.log("⚠️ Response not JSON");
            }
        }
    });

    async function vote(url, data, winnerIndex) {
        console.log("VOTING FOR", data[winnerIndex].profileUrl);
        console.log("I HATE", data[(winnerIndex + 1) % 2].profileUrl);
        console.log("I AM GONG TO VOTE AT", url);
        await new Promise(r => setTimeout(r, 3000)); // sleep 0.2s
        // Wait until success
        // while (true) {
        //     const text = await page.evaluate(() => {
        //         const el = document.querySelector('#success-text');
        //         return el ? el.textContent.trim() : "";
        //     });
        //     console.log("I AM HERE", text);
        //     if (text.toLowerCase() === "success") {
        //         console.log("🔥 SUCCESS detected");
                let response = await fetch(url.replace("getPair", "vote"), {
                    method: "POST",
                    body: JSON.stringify({
                        loserUrl: data[(winnerIndex + 1) % 2].profileUrl,
                        winnerUrl: data[winnerIndex].profileUrl
                    })
                });
                console.log(response);
        //         break;
        //     }
        //     await new Promise(r => setTimeout(r, 200)); // sleep 0.2s
        // }
    }

    await page.goto("https://ranktherivalry.com/#/vote");
}

test();
