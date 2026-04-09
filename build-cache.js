const fs = require("fs");
const path = require("path");

const MAPS_FILE = path.join(__dirname, "maps.json");
const CACHE_FILE = path.join(__dirname, "cache.json");

const DELAY_BETWEEN_REQUESTS_MS = 2000;
const DELAY_BETWEEN_BATCHES_MS = 1000;
const BATCH_SIZE = 10;

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    console.error(`Failed to read ${filePath}:`, error.message);
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

async function fetchMapWR(map) {
  try {
    const response = await fetch(
      `https://trackmania.io/api/leaderboard/map/${map.uid}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "wrtrackertm-cache-builder"
        }
      }
    );

    if (!response.ok) {
      return {
        ...map,
        wrHolder: null,
        wrTime: null,
        wrDate: null,
        secondHolder: null,
        secondTime: null,
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    const wr = data?.tops?.[0] ?? null;
    const second = data?.tops?.[1] ?? null;

    return {
      ...map,
      wrHolder: wr?.player?.name ?? null,
      wrTime: wr?.time ?? null,
      wrDate: wr?.timestamp ?? null,
      secondHolder: second?.player?.name ?? null,
      secondTime: second?.time ?? null,
      error: wr ? null : "No tops data"
    };
  } catch (error) {
    return {
      ...map,
      wrHolder: null,
      wrTime: null,
      wrDate: null,
      secondHolder: null,
      secondTime: null,
      error: error.message
    };
  }
}

async function main() {
  const maps = readJsonFile(MAPS_FILE, []);
  if (!Array.isArray(maps)) {
    throw new Error("maps.json must contain an array");
  }

  const results = [];

  for (let i = 0; i < maps.length; i += BATCH_SIZE) {
    const batch = maps.slice(i, i + BATCH_SIZE);
    console.log(`Refreshing batch ${i / BATCH_SIZE + 1}/${Math.ceil(maps.length / BATCH_SIZE)}`);

    for (const map of batch) {
      const result = await fetchMapWR(map);
      results.push(result);
      await delay(DELAY_BETWEEN_REQUESTS_MS);
    }

    if (i + BATCH_SIZE < maps.length) {
      await delay(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  writeJsonFile(CACHE_FILE, {
    lastUpdate: new Date().toISOString(),
    maps: results
  });

  console.log(`cache.json updated with ${results.length} maps`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});