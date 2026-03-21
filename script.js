const mapTableBody = document.getElementById("mapTableBody");
const top5TableBody = document.getElementById("top5TableBody");
const statusText = document.getElementById("statusText");

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

function renderTop5(maps) {
  top5TableBody.innerHTML = "";

  const counts = {};

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
    return;
  }

  sortedPlayers.forEach(([player, count], index) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${player}</td>
      <td>${count}</td>
    `;

    top5TableBody.appendChild(row);
  });
}

function renderMapsTable(maps) {
  mapTableBody.innerHTML = "";

  for (const map of maps) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${map.name ?? "-"}</td>
      <td>${map.wrHolder ?? "Not found"}</td>
      <td>${map.wrTime != null ? formatTime(map.wrTime) : "-"}</td>
      <td>${map.wrDate ? formatDate(map.wrDate) : (map.error ?? "-")}</td>
    `;

    mapTableBody.appendChild(row);
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

    renderStatus(data.lastUpdate, data.isRefreshing, data.maps.length);
    renderTop5(data.maps);
    renderMapsTable(data.maps);
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

async function triggerRefresh() {
  try {
    await fetch("/api/refresh", { method: "POST" });
    loadMaps();
  } catch (error) {
    console.error("Failed to trigger refresh:", error);
  }
}

loadMaps();
setInterval(loadMaps, 30000);