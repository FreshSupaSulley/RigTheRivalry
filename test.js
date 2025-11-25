// import { HttpProxyAgent } from "http-proxy-agent";
import { HttpsProxyAgent } from "https-proxy-agent";
import fetch from 'node-fetch';
import * as utils from './utils.js';
import log4js from "log4js";

// Setup the file to log the working proxies to
const logFile = `proxies-${Date.now()}.txt`;
log4js.configure({
    // No formatting, just straight proxy URLs
    appenders: { proxies: { type: "file", filename: logFile, layout: { type: 'messagePassThrough' } } },
    categories: { default: { appenders: ["proxies"], level: "info" } },
});
const logger = log4js.getLogger();

// We're going to compare my IP to the server's interpretation of my IP. If they don't match, the proxy masks our IP and probably good for scraping
const { ip: myIp } = await (await fetch("https://api.ipify.org?format=json")).json();

export default async function testProxy(proxyURL) {
    const fetchPromise = fetch("https://api.ipify.org?format=json", {
        agent: new HttpsProxyAgent(`http://${proxyURL}`)
    });

    const res = await utils.timeoutRace(fetchPromise, 10 * 1000); // you get 10s to make this request
    const raw = await res.text();

    if (!res.ok) {
        throw new Error(raw);
    }

    const ip = JSON.parse(raw).ip;
    if (ip == myIp) {
        throw new Error("IP matches original");
    }

    // Otherwise this proxy is good to go
    return true;
}

// Collect our proxies
const NUM_WORKERS = 10;

const proxySet = new Set();
await addProxyList("https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt");
await addProxyList("https://raw.githubusercontent.com/saisuiu/Lionkings-Http-Proxys-Proxies/main/free.txt");

async function addProxyList(url, matcher = /^(?:\d{1,3}\.){3}\d{1,3}:\d+/gm) {
    const text = await (await fetch(url)).text();
    text.match(matcher)?.forEach(proxy => proxySet.add(proxy));
}

// Shuffle them
var proxyPool = [...proxySet].sort(() => Math.random() - 0.5);//.slice(0, 5);

// Worker function
async function worker(id) {
    while (proxyPool.length > 0) {
        // Pick the next proxy atomically
        const proxy = proxyPool.shift();
        if (!proxy) break;

        try {
            console.log(`${proxyPool.length} [Worker ${id}] Testing proxy: ${proxy}`);
            await testProxy(proxy);
            console.log(`[Worker ${id}] Proxy working: ${proxy}`);
            logger.info(proxy);
        } catch (err) {
            // console.warn(`[Worker ${id}] Proxy failed: ${proxy}`);
        }
    }
}

// Launch workers
async function runWorkers() {
    const workers = [];
    for (let i = 0; i < NUM_WORKERS; i++) {
        workers.push(worker(i + 1));
    }
    await Promise.all(workers);
    console.log("All proxies tested");
}

// If we ran `node test.js` by itself that means we want to find working proxies
if (import.meta.url === `file://${process.argv[1]}`) {
    await runWorkers();
}
