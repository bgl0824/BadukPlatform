const http = require("http");

const PORT = Number(process.env.PORT || 8080);
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const KATAGO_SERVER_URL = process.env.KATAGO_SERVER_URL || "";
const KATAGO_ANALYZE_PATH = process.env.KATAGO_ANALYZE_PATH || "/api/v1/analyze";

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, {
      ok: true,
      katagoConfigured: Boolean(KATAGO_SERVER_URL),
    });
    return;
  }

  if (request.method === "POST" && request.url === "/counter-move") {
    try {
      const frontendPayload = await readJsonBody(request);
      const katagoResponse = await requestKatagoAnalysis(frontendPayload);
      const move = extractBestMove(katagoResponse);

      if (!move) {
        sendJson(response, 502, {
          error: "KataGo response did not contain a usable move.",
          raw: katagoResponse,
        });
        return;
      }

      sendJson(response, 200, {
        move,
        raw: katagoResponse,
      });
    } catch (error) {
      sendJson(response, 500, {
        error: error.message,
      });
    }
    return;
  }

  sendJson(response, 404, {
    error: "Not found",
  });
});

server.listen(PORT, () => {
  console.log(`BadukPlatform KataGo adapter listening on port ${PORT}`);
});

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

async function requestKatagoAnalysis(frontendPayload) {
  if (!KATAGO_SERVER_URL) {
    throw new Error("KATAGO_SERVER_URL is not configured.");
  }

  const endpoint = new URL(KATAGO_ANALYZE_PATH, KATAGO_SERVER_URL);
  const katagoPayload = toKatagoPayload(frontendPayload);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(katagoPayload),
  });

  if (!response.ok) {
    throw new Error(`KataGo server failed with ${response.status}`);
  }

  return response.json();
}

function toKatagoPayload(payload) {
  return {
    boardSize: payload.boardSize,
    nextColor: payload.nextColor || "white",
    stones: payload.stones || [],
    moves: payload.playedMoves || [],
    lastMove: payload.lastMove || null,
    sgf: payload.sgf || "",
    maxVisits: payload.maxVisits || 64,
    rules: payload.rules || "japanese",
  };
}

function extractBestMove(katagoResponse) {
  const candidate =
    katagoResponse?.move ||
    katagoResponse?.bestMove ||
    katagoResponse?.counterMove ||
    katagoResponse?.moveInfos?.[0]?.move ||
    katagoResponse?.analysis?.moveInfos?.[0]?.move ||
    katagoResponse?.moves?.[0];

  return normalizeMove(candidate);
}

function normalizeMove(candidate) {
  if (!candidate) {
    return null;
  }

  if (Number.isInteger(candidate.x) && Number.isInteger(candidate.y)) {
    return {
      x: candidate.x,
      y: candidate.y,
    };
  }

  if (Number.isInteger(candidate.col) && Number.isInteger(candidate.row)) {
    return {
      x: candidate.col,
      y: candidate.row,
    };
  }

  if (typeof candidate === "string") {
    return parseMoveString(candidate);
  }

  return null;
}

function parseMoveString(value) {
  const move = value.trim().toLowerCase();

  if (/^\d+,\d+$/.test(move)) {
    const [x, y] = move.split(",").map(Number);
    return { x, y };
  }

  if (/^[a-z][a-z]$/.test(move)) {
    return {
      x: move.charCodeAt(0) - "a".charCodeAt(0),
      y: move.charCodeAt(1) - "a".charCodeAt(0),
    };
  }

  return null;
}
