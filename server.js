const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(__dirname));

const MAPS_FILE = path.join(__dirname, "maps.json");
const CACHE_FILE = path.join(__dirname, "cache.json");

const REFRESH_INTERVAL_MS = 12 * 60 * 1000; // 12 hours
const BATCH_SIZE = 10;
const DELAY_BETWEEN_REQUESTS_MS = 1000;
const DELAY_BETWEEN_BATCHES_MS = 3000;

function getPreviousMapData(uid) {
  return cache.maps.find(map => map.uid === uid) || null;
}

let cache = {
  lastUpdate: null,
  isRefreshing: false,
  maps: []
}; 

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function readJsonFile(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }

    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read ${path.basename(filePath)}:`, error.message);
    return fallback;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error(`Failed to write ${path.basename(filePath)}:`, error.message);
  }
}

function loadMaps() {
  const maps = readJsonFile(MAPS_FILE, []);
  if (!Array.isArray(maps)) {
    throw new Error("maps.json must contain an array");
  }
  return maps;
}

function loadCache() {
  const saved = readJsonFile(CACHE_FILE, null);

  if (
    saved &&
    typeof saved === "object" &&
    Array.isArray(saved.maps)
  ) {
    cache = {
      lastUpdate: saved.lastUpdate ?? null,
      isRefreshing: false,
      maps: saved.maps
    };
  } else {
    cache = {
      lastUpdate: null,
      isRefreshing: false,
      maps: []
    };
  }
}

function saveCache() {
  writeJsonFile(CACHE_FILE, {
    lastUpdate: cache.lastUpdate,
    maps: cache.maps
  });
}

async function fetchMapWR(map) {
  try {
    const response = await fetch(
      `https://trackmania.io/api/leaderboard/map/${map.uid}`,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "trackmania-wr-tracker"
        }
      }
    );

    if (response.status === 429) {
      return {
        ...map,
        rateLimited: true,
        error: "HTTP 429"
      };
    }

    if (!response.ok) {
      return {
        ...map,
        wrHolder: null,
        wrTime: null,
        wrDate: null,
        error: `HTTP ${response.status}`
      };
    }

    const data = await response.json();
    const wr = data?.tops?.[0] ?? null;

    return {
      ...map,
      wrHolder: wr?.player?.name ?? null,
      wrTime: wr?.time ?? null,
      wrDate: wr?.timestamp ?? null,
      error: wr ? null : "No tops data"
    };
  } catch (error) {
    return {
      ...map,
      wrHolder: null,
      wrTime: null,
      wrDate: null,
      error: error.message
    };
  }
}

async function refreshCache() {
  if (cache.isRefreshing) {
    console.log("Refresh already in progress, skipping.");
    return;
  }

  cache.isRefreshing = true;
  console.log("Starting cache refresh...");

  try {
    const maps = loadMaps();
    const results = [];

    for (let i = 0; i < maps.length; i += BATCH_SIZE) {
      const batch = maps.slice(i, i + BATCH_SIZE);
      console.log(`Refreshing batch ${i / BATCH_SIZE + 1} / ${Math.ceil(maps.length / BATCH_SIZE)}`);

      for (const map of batch) {
        const freshResult = await fetchMapWR(map);
        const previous = getPreviousMapData(map.uid);

        if (freshResult.rateLimited && previous) {
          results.push({
            ...previous,
            error: "HTTP 429 (kept previous cached data)"
          });
        } else {
          results.push({
            ...freshResult,
            rateLimited: undefined
          });
        }

        await delay(DELAY_BETWEEN_REQUESTS_MS);
      }

      if (i + BATCH_SIZE < maps.length) {
        await delay(DELAY_BETWEEN_BATCHES_MS);
      }
    }

    cache.maps = results;
    cache.lastUpdate = new Date().toISOString();
    saveCache();

    console.log(`Cache refresh complete. ${results.length} maps updated.`);
  } catch (error) {
    console.error("Cache refresh failed:", error.message);
  } finally {
    cache.isRefreshing = false;
  }
}

app.get("/api/wrs", (req, res) => {
  const REFRESH_HOUR = 12 * 60 * 1000; /*12 hours*/

  if (
    !cache.isRefreshing &&
    cache.lastUpdate &&
    Date.now() - new Date(cache.lastUpdate).getTime() > REFRESH_HOUR
  ) {
    console.log("Cache is old → refreshing...");
    refreshCache();
  }

  res.json({
    lastUpdate: cache.lastUpdate,
    isRefreshing: cache.isRefreshing,
    maps: cache.maps
  });
});

app.post("/api/refresh", async (req, res) => {
  if (!cache.isRefreshing) {
    refreshCache();
  }

  res.json({
    ok: true,
    message: "Refresh started",
    isRefreshing: cache.isRefreshing
  });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  loadCache();

  if (cache.maps.length === 0) {
    console.log("No cache found, starting initial refresh...");
    refreshCache(); // only first time ever
  } else {
    console.log(`Loaded ${cache.maps.length} cached maps.`);
    console.log(`Last update: ${cache.lastUpdate ?? "never"}`);
    console.log("Using cached data, no refresh on startup.");
  }

  // 🔄 refresh every 12hours
  setInterval(() => {
    refreshCache();
  }, 12 * 60 * 1000);
});