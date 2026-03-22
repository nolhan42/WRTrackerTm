const mapTableBody = document.getElementById("mapTableBody");
const top5TableBody = document.getElementById("top5TableBody");
const statusText = document.getElementById("statusText");
const playerSearchInput = document.getElementById("playerSearch");
const searchSuggestions = document.getElementById("searchSuggestions");

let allPlayerNames = [];
let selectedPlayer = "";

const colors = [
  "#e93d31", // Champion
  "#27793f", // Author
  "#FFD700", // Gold
  "#C0C0C0", // Silver
  "#CD7F32"  // Bronze
];
const icons = ["👑", "🥈", "🥉", "🏅", " "];

function formatTime(ms) {
  if (typeof ms !== "number") return "-";

  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;

  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function formatDate(isoString) {
  if (!isoString) return "-";
  return new Date(isoString).toLocaleString();
}

/*Date functions*/
function timeSince(dateString) {
  if (!dateString) return "-";

  const now = new Date();
  const then = new Date(dateString);

  if (Number.isNaN(then.getTime())) return "-";

  let diffMs = now - then;
  const isFuture = diffMs < 0;
  diffMs = Math.abs(diffMs);

  const min = 60 * 1000;
  const h = 60 * min;
  const d = 24 * h;
  const mo = 30 * d;
  const y = 365 * d;

  const years = Math.floor(diffMs / y);
  diffMs -= years * y;

  const months = Math.floor(diffMs / mo);
  diffMs -= months * mo;

  const days = Math.floor(diffMs / d);
  diffMs -= days * d;

  const hours = Math.floor(diffMs / h);
  diffMs -= hours * h;

  const minutes = Math.floor(diffMs / min);

  const parts = [];

  if (years > 0) parts.push(`${years} year${years > 1 ? "s" : ""}`);
  if (months > 0) parts.push(`${months} month${months > 1 ? "s" : ""}`);
  if (days > 0) parts.push(`${days} day${days > 1 ? "s" : ""}`);

  // Only show hours/minutes if duration is small
  if (years === 0 && months === 0) {
    if (hours > 0) parts.push(`${hours} hour${hours > 1 ? "s" : ""}`);
    if (minutes > 0 && days === 0) {
      parts.push(`${minutes} minute${minutes > 1 ? "s" : ""}`);
    }
  }

  if (parts.length === 0) {
    return isFuture ? "in a few seconds" : "just now";
  }

  // Limit to 2 parts max → cleaner UI
  const result = parts.slice(0, 2).join(", ");

  return isFuture ? `in ${result}` : `${result} ago`;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/*Rendering functions*/
function renderTop5(maps) {
  top5TableBody.innerHTML = "";

  const counts = {};
  const playerRanks = {};

  for (const map of maps) {
    if (!map.wrHolder) continue;
    counts[map.wrHolder] = (counts[map.wrHolder] || 0) + 1;
  }

  const sortedPlayers = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sortedPlayers.length === 0) {
    top5TableBody.innerHTML = `
      <tr>
        <td colspan="3">No WR data found</td>
      </tr>
    `;
    return playerRanks;
  }

  sortedPlayers.forEach(([player, count], index) => {
    const row = document.createElement("tr");

    row.style.color = colors[index];
    playerRanks[player] = index;

    row.innerHTML = `
      <td>${icons[index]} ${index + 1}</td>
      <td>${player}</td>
      <td>${count}</td>
    `;

    top5TableBody.appendChild(row);
  });

  return playerRanks;
}

function renderMapsTable(maps, playerRanks) {
  mapTableBody.innerHTML = "";

  for (const map of maps) {
    const row = document.createElement("tr");

    const rankIndex = playerRanks[map.wrHolder];

    if (rankIndex !== undefined) {
      row.style.color = colors[rankIndex];
      row.style.fontWeight = "bold";
    }

    if (selectedPlayer) {
      const isMatch =
        map.wrHolder &&
        map.wrHolder.toLowerCase() === selectedPlayer.toLowerCase();

      if (isMatch) {
        row.style.backgroundColor = "#2a2a2a";
        row.style.fontWeight = "bold";
      } else {
        row.style.opacity = "0.45";
      }
    }

    const detailsRow = document.createElement("tr");
    detailsRow.style.display = "none";

    const detailsCell = document.createElement("td");
    detailsCell.colSpan = 5;
    detailsCell.style.backgroundColor = "#181818";
    detailsCell.style.fontSize = "14px";
    detailsCell.style.padding = "10px 14px";

    detailsCell.innerHTML = map.wrDate
      ? `Exact WR date: ${escapeHtml(formatDate(map.wrDate))}`
      : `No WR date available`;

    detailsRow.appendChild(detailsCell);

    const statusCellContent = map.wrDate
      ? `<span class="toggle-date" style="cursor:pointer; text-decoration:underline;">${timeSince(map.wrDate)}</span>`
      : (map.error ?? "-");

    row.innerHTML = `
      <td>${map.name ?? "-"}</td>
      <td>${map.wrHolder ?? "Not found"}</td>
      <td>${map.wrTime != null ? formatTime(map.wrTime) : "-"}</td>
      <td>${statusCellContent}</td>
    `;

    const toggleElement = row.querySelector(".toggle-date");
    if (toggleElement) {
      toggleElement.addEventListener("click", () => {
        detailsRow.style.display =
          detailsRow.style.display === "none" ? "table-row" : "none";
      });
    }

    mapTableBody.appendChild(row);
    mapTableBody.appendChild(detailsRow);
  }
}

function renderStatus(lastUpdate, isRefreshing, count) {
  if (!statusText) return;

  const updated = lastUpdate ? `Last update: ${formatDate(lastUpdate)}` : "Last update: never";
  const refreshing = isRefreshing ? "Refreshing in background..." : "Idle";

  statusText.textContent = `${updated} | ${refreshing} | ${count} maps cached`;
}

async function loadMaps() {
  try {
    const res = await fetch("/api/wrs");
    const data = await res.json();
    const playerRanks = renderTop5(data.maps);

    buildPlayerList(data.maps);

    renderStatus(data.lastUpdate, data.isRefreshing, data.maps.length);
    renderTop5(data.maps);
    renderMapsTable(data.maps, playerRanks);
  } catch (error) {
    mapTableBody.innerHTML = `
      <tr>
        <td colspan="5">Failed to load data: ${error.message}</td>
      </tr>
    `;

    top5TableBody.innerHTML = `
      <tr>
        <td colspan="3">Failed to load top 5</td>
      </tr>
    `;

    if (statusText) {
      statusText.textContent = "Failed to load tracker data";
    }

    console.error(error);
  }
}

/*Search bar functionality*/
function buildPlayerList(maps) {
  const uniqueNames = new Set();

  for (const map of maps) {
    if (map.wrHolder) {
      uniqueNames.add(map.wrHolder);
    }
  }

  allPlayerNames = Array.from(uniqueNames).sort((a, b) => a.localeCompare(b));
}

function renderSuggestions(filteredNames) {
  searchSuggestions.innerHTML = "";

  if (!filteredNames.length) {
    return;
  }

  filteredNames.forEach(name => {
    const item = document.createElement("div");
    item.className = "suggestion-item";
    item.textContent = name;

    item.addEventListener("click", () => {
      playerSearchInput.value = name;
      selectedPlayer = name;
      searchSuggestions.innerHTML = "";
      loadMaps();
    });

    searchSuggestions.appendChild(item);
  });
}

function setupSearch() {
  playerSearchInput.addEventListener("input", () => {
    const value = playerSearchInput.value.trim().toLowerCase();
    selectedPlayer = playerSearchInput.value.trim();

    if (!value) {
      searchSuggestions.innerHTML = "";
      loadMaps();
      return;
    }

    const filtered = allPlayerNames
      .filter(name => name.toLowerCase().includes(value))
      .slice(0, 10);

    renderSuggestions(filtered);
    loadMaps();
  });

  document.addEventListener("click", (event) => {
    if (
      event.target !== playerSearchInput &&
      !searchSuggestions.contains(event.target)
    ) {
      searchSuggestions.innerHTML = "";
    }
  });
}

/*Refresh API*/
async function triggerRefresh() {
  try {
    await fetch("/api/refresh", { method: "POST" });
    loadMaps();
  } catch (error) {
    console.error("Failed to trigger refresh:", error);
  }
}

setupSearch();
loadMaps();
setInterval(loadMaps, 30000);