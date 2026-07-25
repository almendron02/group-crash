import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  await testRoomControls();
  await testImposterGameFlow();
  await testSketchGameFlow();
  await testReconnectGraceKeepsHost();
  await testHostReassignsAfterGrace();
  await testFilePersistenceRestoresRoom();
  await testRoomExpiration();

  console.log("Group Crash server integration tests passed.");
} finally {
  stopServerProcess();
}

process.exit(0);

async function waitForServer(targetServerUrl = serverUrl, getOutput = () => serverOutput) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 10_000) {
    try {
      const response = await fetch(targetServerUrl);

      if (response.ok) {
        return;
      }
    } catch {
      await delay(100);
    }
  }

  throw new Error(`Server did not start.\n${getOutput()}`);
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

async function testRoomControls() {
  const tv = await connectClient("tv-controls");
  const roomCode = await createRoom(tv);
  const alex = await joinPlayer(roomCode, "Alex", "king");
  const maya = await joinPlayer(roomCode, "Maya", "queen");
  await tv.waitFor("room.snapshot", (event) => event.payload.playerCount === 2);

  alex.client.send({
    type: "room.settings.update",
    payload: {
      hostPlayerId: alex.session.playerId,
      isLocked: true,
      roomCode
    }
  });
  await tv.waitFor("room.snapshot", (event) => event.payload.isLocked === true);

  const jay = await connectClient("player-Jay-locked");
  jay.send({
    type: "room.join",
    payload: { avatar: "bishop", name: "Jay", roomCode, wantsHost: false }
  });
  await jay.waitFor("error", (event) => event.payload.code === "ROOM_LOCKED");

  alex.client.send({
    type: "room.settings.update",
    payload: {
      hostPlayerId: alex.session.playerId,
      maxPlayers: 2,
      roomCode
    }
  });
  await tv.waitFor("room.snapshot", (event) => event.payload.maxPlayers === 2);

  alex.client.send({
    type: "player.mute",
    payload: {
      hostPlayerId: alex.session.playerId,
      isMuted: true,
      roomCode,
      targetPlayerId: maya.session.playerId
    }
  });
  await tv.waitFor(
    "room.snapshot",
    (event) =>
      event.payload.players.some(
        (player) => player.id === maya.session.playerId && player.isMuted
      )
  );

  maya.client.send({
    type: "message.send",
    payload: { playerId: maya.session.playerId, roomCode, text: "Muted?" }
  });
  await maya.client.waitFor(
    "error",
    (event) => event.payload.code === "PLAYER_MUTED"
  );

  alex.client.send({
    type: "player.kick",
    payload: {
      hostPlayerId: alex.session.playerId,
      roomCode,
      targetPlayerId: maya.session.playerId
    }
  });
  await maya.client.waitFor(
    "player.kicked",
    (event) => event.payload.targetPlayerId === maya.session.playerId
  );
  await tv.waitFor(
    "room.snapshot",
    (event) =>
      event.payload.playerCount === 1 &&
      event.payload.players.every((player) => player.id !== maya.session.playerId)
  );

  [tv, alex.client, maya.client, jay].forEach((client) => client.close());
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

async function testSketchGameFlow() {
  const tv = await connectClient("tv-sketch");
  const roomCode = await createRoom(tv);
  const alex = await joinPlayer(roomCode, "Alex", "king");
  const maya = await joinPlayer(roomCode, "Maya", "queen");
  const jay = await joinPlayer(roomCode, "Jay", "bishop");
  const players = [alex, maya, jay];
  await tv.waitFor("room.snapshot", (event) => event.payload.playerCount === 3);

  alex.client.send({
    type: "game.select",
    payload: {
      gameId: "sketch-crash",
      hostPlayerId: alex.session.playerId,
      roomCode
    }
  });
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.selectedGameId === "sketch-crash"
  );

  alex.client.send({
    type: "game.start",
    payload: {
      hostPlayerId: alex.session.playerId,
      roomCode
    }
  });
  const drawingSnapshot = await tv.waitFor(
    "room.snapshot",
    (event) =>
      event.payload.status === "playing" &&
      event.payload.activeGame?.gameId === "sketch-crash" &&
      event.payload.activeGame.phase === "drawing"
  );
  const drawerPlayerId = drawingSnapshot.payload.activeGame.drawerPlayerId;

  const privateStates = await Promise.all(
    players.map((player) =>
      player.client.waitFor(
        "game.private_state",
        (event) => event.payload?.gameId === "sketch-crash"
      )
    )
  );
  const drawerPrivateState = privateStates.find(
    (event) => event.payload.role === "drawer"
  );
  assert.ok(drawerPrivateState);
  assert.equal(drawerPrivateState.payload.playerId, drawerPlayerId);
  assert.equal(typeof drawerPrivateState.payload.prompt, "string");

  const drawer = players.find((player) => player.session.playerId === drawerPlayerId);
  const guessers = players.filter((player) => player.session.playerId !== drawerPlayerId);
  assert.ok(drawer);
  assert.equal(guessers.length, 2);

  guessers[0].client.send({
    type: "game.sketch.stroke",
    payload: {
      playerId: guessers[0].session.playerId,
      roomCode,
      stroke: {
        color: "#291313",
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 }
        ],
        size: 7
      }
    }
  });
  await guessers[0].client.waitFor(
    "error",
    (event) => event.payload.code === "NOT_ELIGIBLE"
  );

  drawer.client.send({
    type: "game.sketch.stroke",
    payload: {
      playerId: drawer.session.playerId,
      roomCode,
      stroke: {
        color: "#291313",
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.35, y: 0.35 },
          { x: 0.8, y: 0.2 }
        ],
        size: 7
      }
    }
  });
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.activeGame?.strokes?.length === 1
  );

  alex.client.send({
    type: "game.advance",
    payload: {
      action: "start_guessing",
      hostPlayerId: alex.session.playerId,
      roomCode
    }
  });
  await tv.waitFor(
    "room.snapshot",
    (event) => event.payload.activeGame?.phase === "guessing"
  );

  drawer.client.send({
    type: "game.sketch.guess",
    payload: {
      guess: "I drew it",
      playerId: drawer.session.playerId,
      roomCode
    }
  });
  await drawer.client.waitFor(
    "error",
    (event) => event.payload.code === "NOT_ELIGIBLE"
  );

  guessers[0].client.send({
    type: "game.sketch.guess",
    payload: {
      guess: drawerPrivateState.payload.prompt,
      playerId: guessers[0].session.playerId,
      roomCode
    }
  });
  guessers[1].client.send({
    type: "game.sketch.guess",
    payload: {
      guess: "banana castle",
      playerId: guessers[1].session.playerId,
      roomCode
    }
  });

  const results = await tv.waitFor(
    "room.snapshot",
    (event) =>
      event.payload.activeGame?.phase === "results" &&
      event.payload.activeGame.results?.winner === "guessers"
  );
  assert.ok(
    results.payload.activeGame.results.correctPlayerIds.includes(
      guessers[0].session.playerId
    )
  );

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

async function testFilePersistenceRestoresRoom() {
  const tempDir = await mkdtemp(path.join(tmpdir(), "group-crash-"));
  const storePath = path.join(tempDir, "rooms.json");
  const persistencePort = port + 1;
  const persistenceServerUrl = `http://127.0.0.1:${persistencePort}`;
  const persistenceSocketUrl = `ws://127.0.0.1:${persistencePort}`;
  let processA = null;
  let processB = null;

  try {
    processA = startServerProcess(persistencePort, {
      RECONNECT_GRACE_MS: "1500",
      ROOM_STORE_FILE_PATH: storePath,
      ROOM_TTL_MS: "5000"
    });
    await waitForServer(persistenceServerUrl, () => processA.output);

    const tvA = await connectClient("tv-persist-a", persistenceSocketUrl);
    const roomCode = await createRoom(tvA);
    const alex = await joinPlayer(roomCode, "Alex", "king", false, persistenceSocketUrl);
    const maya = await joinPlayer(roomCode, "Maya", "queen", false, persistenceSocketUrl);
    await tvA.waitFor("room.snapshot", (event) => event.payload.playerCount === 2);
    await delay(120);
    [tvA, alex.client, maya.client].forEach((client) => client.close());
    stopProcess(processA.process);

    processB = startServerProcess(persistencePort, {
      RECONNECT_GRACE_MS: "1500",
      ROOM_STORE_FILE_PATH: storePath,
      ROOM_TTL_MS: "5000"
    });
    await waitForServer(persistenceServerUrl, () => processB.output);

    const tvB = await connectClient("tv-persist-b", persistenceSocketUrl);
    tvB.send({ type: "room.watch", payload: { roomCode } });
    await tvB.waitFor(
      "room.snapshot",
      (event) =>
        event.payload.roomCode === roomCode &&
        event.payload.playerCount === 2 &&
        event.payload.players.every(
          (player) => player.connectionStatus === "disconnected"
        )
    );

    const alexReconnect = await connectClient("alex-persist-reconnect", persistenceSocketUrl);
    alexReconnect.send({ type: "room.reconnect", payload: alex.session });
    await alexReconnect.waitFor("player.session");
    await tvB.waitFor(
      "room.snapshot",
      (event) =>
        event.payload.players.some(
          (player) =>
            player.id === alex.session.playerId &&
            player.connectionStatus === "connected"
        )
    );

    [tvB, alexReconnect].forEach((client) => client.close());
  } finally {
    if (processA) {
      stopProcess(processA.process);
    }

    if (processB) {
      stopProcess(processB.process);
    }

    await rm(tempDir, { force: true, recursive: true });
  }
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

async function joinPlayer(
  roomCode,
  name,
  avatar,
  wantsHost = false,
  targetSocketUrl = socketUrl
) {
  const client = await connectClient(`player-${name}`, targetSocketUrl);
  client.send({
    type: "room.join",
    payload: { avatar, name, roomCode, wantsHost }
  });
  const sessionEvent = await client.waitFor("player.session");

  return { client, session: sessionEvent.payload };
}

async function connectClient(label, targetSocketUrl = socketUrl) {
  const socket = new WebSocket(targetSocketUrl);
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
  stopProcess(serverProcess);
}

function startServerProcess(targetPort, extraEnv = {}) {
  const child = spawn(process.execPath, [tsxCliPath, "src/index.ts"], {
    cwd: serverDir,
    env: {
      ...process.env,
      CLEANUP_INTERVAL_MS: "50",
      MESSAGE_COOLDOWN_MS: "40",
      PORT: String(targetPort),
      RECONNECT_GRACE_MS: "300",
      ROOM_TTL_MS: "350",
      ...extraEnv
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  const state = { output: "", process: child };

  child.stdout.on("data", (chunk) => {
    state.output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    state.output += chunk.toString();
  });

  return state;
}

function stopProcess(child) {
  if (!child || child.killed) {
    return;
  }

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore"
    });
    return;
  }

  child.kill();
}
