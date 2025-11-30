import runClient from './utils.js'
import * as utils from './utils.js';
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from 'node-fetch';
import run, { workerLogger } from './workers.js';
import fs from "fs";

// Get the prebuilt list of participants
const participants = JSON.parse(fs.readFileSync("participants.json"));
const osu = sortParticipants(participants.osu);
const umich = sortParticipants(participants.umich);

function sortParticipants(array) {
    return array.sort((a, b) => b.elo - a.elo);
}

function getPairData() {
    // Vote for the lowest OSU candidates over the highest UMich ones
    // Sorted such that the highest is at the last index and the lowest ELO is at the 0th
    const variance = arr => Math.floor(Math.random() * (arr.length / 8));
    const random = arr => arr[Math.floor(Math.random() * arr.length)];
    return {
        // candidates: [osu[osu.length - 1 - variance(osu)], umich[variance(umich)]],
        candidates: [osu.find(person => person.profileUrl === "https://www.linkedin.com/in/raniaomer/"), osu[variance(osu)]],
        osuIndex: 0,
    };
}

async function handler(job, proxyURL) {
    // Get our participants
    const data = getPairData();
    // Use the proxy to make the request
    const response = await utils.timeoutRace(fetch(`${utils.cfURL}/vote`, {
        agent: new HttpsProxyAgent(`http://${proxyURL}`),
        method: "POST",
        headers: {
            "x-turnstile-token": job.token,
        },
        body: JSON.stringify({
            loserUrl: data.candidates[(data.osuIndex + 1) % 2].profileUrl,
            winnerUrl: data.candidates[data.osuIndex].profileUrl,
        }),
    }), 30 * 1000); // 30s ok?

    // TODO: deny jobs that have tokens expiring too soon
    const raw = await response.text();

    if (!response.ok) {
        if (response.status == 429) {
            // Ignore too many requests. Idk what to do with those. Must be identifying me from the turnstile token
            console.warn("Got a too many requests error:", raw);
            return raw;
        }
        // Otherwise consider this job a failure upstream to replace its proxy
        throw new Error(`Worker failed with status: ${response.status} - ${raw}`);
    }

    const json = JSON.parse(raw);

    // Update the elo
    const updateElo = (arr, url, newElo) => {
        const player = arr.find(p => p.profileUrl === url);
        if (player) player.elo = newElo;
        sortParticipants(arr);
    };

    updateElo(osu, json.winnerUrl, json.newWinnerElo);
    updateElo(umich, json.winnerUrl, json.newWinnerElo);
    updateElo(osu, json.loserUrl, json.newLoserElo);
    updateElo(umich, json.loserUrl, json.newLoserElo);
    return raw;
}

// Run our workers
const pool = run(handler);

// Start the turnstile token slave
runClient(pool, async (token) => {
    pool.push({
        token
    });
});
