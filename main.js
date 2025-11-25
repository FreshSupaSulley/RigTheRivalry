import runClient from './utils.js'
import * as utils from './utils.js';
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import log4js from "log4js";

// Setup a good logging library to log the worker's failed jobs because I'm using the console as an admin panel (clearing shit)
const logFile = "workers.log";
// Clear logs
if (fs.existsSync(logFile)) {
    fs.rmSync(logFile);
}

log4js.configure({
    appenders: { workers: { type: "file", filename: logFile } },
    categories: { default: { appenders: ["workers"], level: "error" } },
});

const logger = log4js.getLogger();
logger.level = "debug";

// Load our proxy list
const filename = "proxies.txt"; // update to reflect our current list of working proxies
const filePath = path.join(process.cwd(), filename);
const data = fs.readFileSync(filePath, 'utf-8');

// Store them as an array where URL so we can keep track of how many times they fail
var proxyPool = data.split('\n').map(url => ({
    url, errors: 0
}));//.slice(0, 5);

console.log(`Found ${proxyPool.length} proxies`);

const workers = 10; // number of workers
const maxErrors = 2;
const jobTime = 45 * 1000; // time before a job is expired (should be tied to how long a turnstile token lasts for, which I assume is just 1 minute?? Docs say otherwise but I think I was getting getting bot_verification_failed errors when it's more than that...)

var totalVotes = 0;

class ProxyWorker {
    constructor(proxyURL, handler) {
        this.proxyURL = proxyURL;
        this.handler = handler;
        this.busy = false;
    }

    async run(job) {
        return await this.handler(job, this.proxyURL);
    }
}

class ProxyPool {
    constructor(handler) {
        this.handler = handler;
        this.workers = [...Array(workers)].map(() => new ProxyWorker(this.getRandomProxy(), handler));
        this.queue = [];
        this.running = false;
    }

    push(job) {
        this.queue.push({ job, created: Date.now() });
    }

    getRandomProxy() {
        // Pick a random proxy that hasn't already been claimed by another worker
        const claimed = new Set(this.workers?.map(w => w.proxyURL) || []);
        const unclaimed = proxyPool.map(p => p.url).filter(url => !claimed.has(url));
        if (unclaimed.length === 0) {
            console.error("No more proxies!");
            process.exit(1);
        }
        return unclaimed[Math.floor(Math.random() * unclaimed.length)];
    }

    async tick() {
        // Scramble the workers so a random one is picked to run the task to help distribute the load
        let idle = utils.shuffle(this.workers.filter(w => !w.busy));

        // Abandon if there's no free workers OR there's nothing to do
        if (idle.length === 0 || this.queue.length === 0) {
            return;
        }

        // Assign jobs to all idle workers
        for (const worker of idle) {
            const entry = this.queue.shift();
            if (!entry) continue;

            const { job, created } = entry;

            if (Date.now() - created > jobTime) {
                console.warn("Job expired (a wasted turnstile token). Consider running more workers");
                continue;
            }

            // Claim worker
            worker.busy = true;

            (async () => {
                try {
                    const result = await worker.run(job);
                    logger.info(`Worker ${worker.proxyURL} completed job:`, result);
                    const proxy = proxyPool.find(p => p.url == worker.proxyURL);
                    proxy.errors = Math.max(0, proxy.errors - 1);
                } catch (error) {
                    // Keep track of how many errors each proxy gives us
                    const proxy = proxyPool.find(p => p.url == worker.proxyURL);
                    proxy.errors++;
                    logger.error(`Proxy ${worker.proxyURL} failed (${proxy.errors}/${maxErrors} allowed errors):`, error);
                    // If the proxy fucked up enough times
                    if (proxy.errors >= maxErrors) {
                        // Remove from the list
                        // console.warn("Proxy exceeded maximum allowed errors");
                        proxyPool = proxyPool.filter(p => p.url !== worker.proxyURL);
                    }
                    // Replace the worker's proxy and requeue the failed job
                    worker.proxyURL = this.getRandomProxy();
                    this.queue.unshift(entry);
                } finally {
                    // Release worker
                    worker.busy = false;
                }
            })();
        };
    }
}

// Give us an update
async function loop() {
    while (true) {
        pool.tick();

        const rows = pool.workers.map(worker => ([
            worker.proxyURL, worker.busy
        ]));

        // TODO: put this in a simple webpage instead of dumping into console
        // Prep console
        console.clear();
        console.log(`Votes: ${totalVotes}\tQueued jobs: ${pool.queue.length}`);
        printStats([`Workers (${rows.length})`, "Is Voting"], rows);

        // Print bad proxies
        console.log(`\nProxies: ${proxyPool.length}\tProxies with errors: ${proxyPool.filter(proxy => proxy.errors > 0).length}`);

        // Wait before updating again
        await utils.sleep(1000);
    }
}

function getPairData() {
    const random = arr => arr[Math.floor(Math.random() * arr.length)];
    return {
        candidates: [random(utils.osu), random(utils.umich)],
        // candidates: [random(utils.osu), random(utils.osu)],
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
        throw new Error(`Vote failed with status: ${response.status} - ${raw}`);
    }

    totalVotes++;

    // Don't bother JSON parsing. Printing JSON takes multiple lines in the terminal
    return raw;
}

const pool = new ProxyPool(handler);
loop();

// Now that we have a list of good proxies, start the turnstile token slave
const client = runClient(async (token) => {
    pool.push({
        token
    });
});

function printStats(headers, rows) {
    if (!rows.length) return;

    const colCount = Math.max(headers.length, ...rows.map(r => r.length));

    // Compute max width for each column
    const colWidths = Array(colCount).fill(0);
    for (let i = 0; i < colCount; i++) {
        colWidths[i] = Math.max(
            String(headers[i] ?? "").length,
            ...rows.map(r => String(r[i] ?? "").length)
        );
    }

    // Print header
    const headerLine = headers
        .map((h, i) => String(h).padEnd(colWidths[i]))
        .join(" | ");
    const divider = colWidths.map(w => "-".repeat(w)).join("-+-");

    console.log(headerLine);
    console.log(divider);

    // Print rows
    for (const row of rows) {
        const line = row
            .map((cell, i) => String(cell ?? "").padEnd(colWidths[i]))
            .join(" | ");
        console.log(line);
    }
}
