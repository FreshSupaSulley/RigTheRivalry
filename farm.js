import * as utils from './utils.js';
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from 'node-fetch';
import run, { workerSuccesses } from './workers.js';
import fs from 'fs';

const osu = [];
const umich = [];

async function handler(job, proxyURL) {
    // Use the proxy to make the request
    const response = await utils.timeoutRace(fetch(`${utils.cfURL}/getPair`, {
        agent: new HttpsProxyAgent(`http://${proxyURL}`)
    }), 30 * 1000); // 30s ok?

    const raw = await response.text();

    if (!response.ok) {
        if (response.status == 429) {
            // Ignore too many requests. Idk what to do with those. Must be identifying me from the turnstile token
            console.warn("Got a too many requests error:", raw);
            return raw;
        }
        // Otherwise consider this job a failure upstream to replace its proxy
        throw new Error(`Vote failed with status: ${response.status} - ${raw}`);
    }

    // Don't bother JSON parsing. Printing JSON takes multiple lines in the terminal
    const people = JSON.parse(raw);

    for (const person of people) {
        const target = person.university === "OSU" ? osu : umich;
        // Don't add it if the college array already contains it
        if (!target.some(member => member.profileUrl === person.profileUrl)) {
            target.push(person);
        }
    }

    return raw;
}

// Run our workers
const pool = run(handler);
const minSuccess = 200;

while (workerSuccesses < minSuccess) {
    // Keep that damn queue pool filled until we're done
    while (pool.queue.length == 0) {
        pool.push();
    }
    console.log("OSU:", osu.length);
    console.log("UMich:", umich.length);
    await utils.sleep(1000);
}

fs.writeFileSync(`participants-${Date.now()}.json`, JSON.stringify({ osu, umich }));
console.log("Wrote to file");
pool.stop();
