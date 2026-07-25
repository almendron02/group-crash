import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const serverDir = path.resolve(repoRoot, "apps/server");
const tsxCliPath = path.resolve(serverDir, "node_modules/tsx/dist/cli.mjs");
const port = Number(process.env.TEST_PORT ?? 3217);
const serverUrl = `http://127.0.0.1:${port}`;
const socketUrl = `ws://127.0.0.1:${port}`;

const serverProcess = spawn(
  process.execPath,
  [tsxCliPath, "src/index.ts"],
  {
    cwd: serverDir,
    env: {
      ...process.env,
      CLEANUP_INTERVAL_MS: "50",
      MESSAGE_COOLDOWN_MS: "40",
      PORT: String(port),
      RECONNECT_GRACE_MS: "150",
      ROOM_TTL_MS: "350"
    },
    stdio: ["ignore", "pipe", "pipe"]
  }
);

let serverOutput = "";
serverProcess.stdout.on("data", (chunk) => {
  serverOutput += chunk.toString();
});
serverProcess.stderr.on("data", (chunk) => {
  serverOutput += chunk.toString();
});

try {
  await waitForServer();

  await testInvalidPayload();
  await testMessageRateLimitAndHostPass();
  await testImposterGameFlow();
  await testReconnectGraceKeepsHost();
  await testHostReassignsAfterGrace();
  await testRoomExpiration();

  console.log("Group Crash server integration tests passed.");
} finally {
  stopServerProcess();
}

process.exit(0);

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(serverUrl);

      if (response.ok) {
        return;
      }
    } catch {
      await delay(100);
    }
  }

  throw new Error(`Server did not start.\n${serverOutput}`);
}

async function testInvalidPayload() {
  const client = await connectClient("invalid-payload");
  client.send({ type: "room.join", payload: { roomCode: "NOPE" } });

  const error = await client.waitFor("error", (event) => event.payload.code === "UNKNOWN");
  assert.match(error.payload.message, /valid Group Crash event/);

  client.close();
}

async function testMessageRateLimitAndHostPass() {
  const tv = await connectClient("tv-pass");
  const roomCode = await createRoom(tv);
  const alex = await joinPlayer(roomCode, "Alex", "king");
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.hostPlayerId === alex.session.playerId
  );

  const maya = await joinPlayer(roomCode, "Maya", "queen");
  const jay = await joinPlayer(roomCode, "Jay", "bishop");
  await tv.waitFor("room.snapshot", (event) => event.payload.playerCount === 3);

  alex.client.send({
    type: "host.pass",
    payload: {
      hostPlayerId: alex.session.playerId,
      roomCode,
      targetPlayerId: jay.session.playerId
    }
  });
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.hostPlayerId === jay.session.playerId
  );

  maya.client.send({
    type: "game.select",
    payload: {
      gameId: "demo-crash",
      hostPlayerId: maya.session.playerId,
      roomCode
    }
  });
  await maya.client.waitFor(
    "error",
    (event) => event.payload.code === "NOT_HOST"
  );

  jay.client.send({
    type: "game.select",
    payload: {
      gameId: "demo-crash",
      hostPlayerId: jay.session.playerId,
      roomCode
    }
  });
  await tv.waitFor(
    "game.selected",
    (event) => event.payload.gameId === "demo-crash"
  );
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.selectedGameId === "demo-crash"
  );

  jay.client.send({
    type: "message.send",
    payload: { playerId: jay.session.playerId, roomCode, text: "Ready!" }
  });
  await tv.waitFor("message.received", (event) => event.payload.text === "Ready!");

  jay.client.send({
    type: "message.send",
    payload: { playerId: jay.session.playerId, roomCode, text: "Too fast!" }
  });
  await jay.client.waitFor(
    "error",
    (event) => event.payload.code === "RATE_LIMITED"
  );

  [tv, alex.client, maya.client, jay.client].forEach((client) => client.close());
}

async function testImposterGameFlow() {
  const tv = await connectClient("tv-imposter");
  const roomCode = await createRoom(tv);
  const alex = await joinPlayer(roomCode, "Alex", "king");
  const maya = await joinPlayer(roomCode, "Maya", "queen");
  const jay = await joinPlayer(roomCode, "Jay", "bishop");
  await tv.waitFor("room.snapshot", (event) => event.payload.playerCount === 3);

  alex.client.send({
    type: "game.select",
    payload: {
      gameId: "imposter-crash",
      hostPlayerId: alex.session.playerId,
      roomCode
    }
  });
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.selectedGameId === "imposter-crash"
  );

  alex.client.send({
    type: "game.start",
    payload: {
      hostPlayerId: alex.session.playerId,
      roomCode
    }
  });
  await tv.waitFor(
    "room.snapshot",
    (event) =>
      event.payload.status === "playing" &&
      event.payload.activeGame?.gameId === "imposter-crash" &&
      event.payload.activeGame.phase === "discussion"
  );

  const privateStates = await Promise.all([
    alex.client.waitFor("game.private_state", (event) => Boolean(event.payload?.role)),
    maya.client.waitFor("game.private_state", (event) => Boolean(event.payload?.role)),
    jay.client.waitFor("game.private_state", (event) => Boolean(event.payload?.role))
  ]);
  const imposterState = privateStates.find(
    (event) => event.payload.role === "imposter"
  );
  const crewStates = privateStates.filter((event) => event.payload.role === "crew");
  assert.ok(imposterState);
  assert.equal(imposterState.payload.secretWord, null);
  assert.equal(crewStates.length, 2);
  assert.ok(crewStates.every((event) => typeof event.payload.secretWord === "string"));

  alex.client.send({
    type: "game.advance",
    payload: {
      action: "start_voting",
      hostPlayerId: alex.session.playerId,
      roomCode
    }
  });
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.activeGame?.phase === "voting"
  );

  const imposterPlayerId = imposterState.payload.playerId;
  for (const player of [alex, maya, jay]) {
    const targetPlayerId =
      player.session.playerId === imposterPlayerId
        ? crewStates[0].payload.playerId
        : imposterPlayerId;
    player.client.send({
      type: "game.vote.cast",
      payload: {
        playerId: player.session.playerId,
        roomCode,
        targetPlayerId
      }
    });
  }

  const results = await tv.waitFor(
    "room.snapshot",
    (event) =>
      event.payload.activeGame?.phase === "results" &&
      event.payload.activeGame.results?.winner === "crew"
  );
  assert.equal(results.payload.activeGame.results.imposterPlayerId, imposterPlayerId);

  maya.client.send({
    type: "game.advance",
    payload: {
      action: "return_lobby",
      hostPlayerId: maya.session.playerId,
      roomCode
    }
  });
  await maya.client.waitFor("error", (event) => event.payload.code === "NOT_HOST");

  alex.client.send({
    type: "game.advance",
    payload: {
      action: "return_lobby",
      hostPlayerId: alex.session.playerId,
      roomCode
    }
  });
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.status === "lobby" && event.payload.activeGame === null
  );

  [tv, alex.client, maya.client, jay.client].forEach((client) => client.close());
}

async function testReconnectGraceKeepsHost() {
  const tv = await connectClient("tv-reconnect");
  const roomCode = await createRoom(tv);
  const alex = await joinPlayer(roomCode, "Alex", "king");
  const maya = await joinPlayer(roomCode, "Maya", "queen");
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.hostPlayerId === alex.session.playerId
  );

  alex.client.close();
  await tv.waitFor(
    "room.snapshot",
    (event) =>
      event.payload.hostPlayerId === alex.session.playerId &&
      event.payload.players.some(
        (player) =>
          player.id === alex.session.playerId &&
          player.connectionStatus === "disconnected"
      )
  );

  const alexReconnect = await connectClient("alex-reconnect");
  alexReconnect.send({ type: "room.reconnect", payload: alex.session });
  await alexReconnect.waitFor("player.session");
  await delay(220);

  const stableSnapshot = tv.latest("room.snapshot");
  assert.ok(stableSnapshot);
  assert.equal(stableSnapshot.payload.hostPlayerId, alex.session.playerId);
  assert.ok(
    stableSnapshot.payload.players.some(
      (player) =>
        player.id === alex.session.playerId &&
        player.connectionStatus === "connected"
    )
  );

  [tv, alexReconnect, maya.client].forEach((client) => client.close());
}

async function testHostReassignsAfterGrace() {
  const tv = await connectClient("tv-reassign");
  const roomCode = await createRoom(tv);
  const alex = await joinPlayer(roomCode, "Alex", "king");
  const maya = await joinPlayer(roomCode, "Maya", "queen");
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.hostPlayerId === alex.session.playerId
  );

  alex.client.close();
  await tv.waitFor(
    "room.snapshot",
    (event) =>
      event.payload.hostPlayerId === maya.session.playerId &&
      event.payload.players.every((player) => player.id !== alex.session.playerId)
  );

  [tv, maya.client].forEach((client) => client.close());
}

async function testRoomExpiration() {
  const tv = await connectClient("tv-expiration");
  const roomCode = await createRoom(tv);

  const closed = await tv.waitFor(
    "room.closed",
    (event) => event.payload.roomCode === roomCode && event.payload.reason === "expired",
    2000
  );
  assert.equal(closed.payload.reason, "expired");

  tv.close();
}

async function createRoom(client) {
  client.send({ type: "room.create", payload: {} });
  const created = await client.waitFor("room.created");
  await client.waitFor(
    "room.snapshot",
    (event) => event.payload.roomCode === created.payload.roomCode
  );
  return created.payload.roomCode;
}

async function joinPlayer(roomCode, name, avatar, wantsHost = false) {
  const client = await connectClient(`player-${name}`);
  client.send({
    type: "room.join",
    payload: { avatar, name, roomCode, wantsHost }
  });
  const sessionEvent = await client.waitFor("player.session");

  return { client, session: sessionEvent.payload };
}

async function connectClient(label) {
  const socket = new WebSocket(socketUrl);
  const messages = [];

  socket.addEventListener("message", (event) => {
    messages.push(JSON.parse(event.data));
  });

  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    label,
    send(event) {
      socket.send(JSON.stringify(event));
    },
    waitFor(type, predicate = () => true, timeoutMs = 5000) {
      return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const timer = setInterval(() => {
          const message = messages.find(
            (candidate) => candidate.type === type && predicate(candidate)
          );

          if (message) {
            clearInterval(timer);
            resolve(message);
            return;
          }

          if (Date.now() - startedAt > timeoutMs) {
            clearInterval(timer);
            reject(new Error(`${label} timed out waiting for ${type}`));
          }
        }, 20);
      });
    },
    latest(type) {
      return messages.findLast((candidate) => candidate.type === type);
    },
    close() {
      socket.close();
    }
  };
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function stopServerProcess() {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(serverProcess.pid), "/t", "/f"], {
      stdio: "ignore"
    });
    return;
  }

  serverProcess.kill();
}
