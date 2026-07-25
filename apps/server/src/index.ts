import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { demoCrashManifest } from "@group-crash/demo-crash";
import {
  applyImposterAction,
  createImposterGameState,
  createImposterPrivateView,
  createImposterPublicView,
  imposterCrashManifest,
  type ImposterGameState
} from "@group-crash/imposter-crash";
import {
  applySketchAction,
  createSketchGameState,
  createSketchPrivateView,
  createSketchPublicView,
  sketchCrashManifest,
  type SketchGameState
} from "@group-crash/sketch-crash";
import {
  avatarOptions,
  castLocalHostVote,
  createEmptyRoomSnapshot,
  joinLocalPlayer,
  markLocalPlayerDisconnected,
  muteLocalPlayer,
  passLocalHost,
  reconnectLocalPlayer,
  removeLocalPlayer,
  requestLocalHost,
  selectLocalGame,
  sendLocalMessage,
  updateLocalRoomSettings,
  type AdvanceGamePayload,
  type CastGameVotePayload,
  type CastHostVotePayload,
  type ChessAvatar,
  type ClientEvent,
  type HostRequestPayload,
  type HostVote,
  type KickPlayerPayload,
  type PrivateGameView,
  type JoinRoomPayload,
  type LeaveRoomPayload,
  type MutePlayerPayload,
  type PassHostPayload,
  type PlayerSessionPayload,
  type PublicPlayer,
  type ReconnectPayload,
  type RoomCreatedPayload,
  type RoomSnapshot,
  type SelectGamePayload,
  type SendMessagePayload,
  type SendSketchStrokePayload,
  type ServerErrorPayload,
  type SubmitSketchGuessPayload,
  type ServerEvent,
  type StartGamePayload,
  type UpdateRoomSettingsPayload,
  type WatchRoomPayload
} from "@group-crash/protocol";
import {
  createRoomStore,
  type StoredRoomRecord
} from "./persistence";

const host = process.env.HOST ?? "0.0.0.0";
const port = Number(process.env.PORT ?? 3001);
const controllerOrigin = process.env.CONTROLLER_ORIGIN ?? "http://127.0.0.1:5174";
const roomTtlMs = Number(process.env.ROOM_TTL_MS ?? 2 * 60 * 60 * 1000);
const reconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS ?? 30_000);
const cleanupIntervalMs = Number(process.env.CLEANUP_INTERVAL_MS ?? 15_000);
const messageCooldownMs = Number(process.env.MESSAGE_COOLDOWN_MS ?? 1200);
const maxMessageBytes = Number(process.env.MAX_MESSAGE_BYTES ?? 4096);
const roomStoreFilePath = process.env.ROOM_STORE_FILE_PATH;
const roomStoreRedisUrl = process.env.ROOM_STORE_REDIS_URL;
const roomStoreKeyPrefix = process.env.ROOM_STORE_KEY_PREFIX ?? "group-crash";
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const gameRegistry = [demoCrashManifest, sketchCrashManifest, imposterCrashManifest];

interface SocketPeer {
  id: string;
  buffer: Buffer;
  playerId: string | null;
  role: "display" | "player" | "unassigned";
  roomCode: string | null;
  socket: Duplex;
}

interface RoomRecord {
  activeGame: ActiveGameRecord | null;
  disconnectTimersByPlayerId: Map<string, ReturnType<typeof setTimeout>>;
  displayPeers: Set<SocketPeer>;
  expiresAt: number;
  lastMessageAtByPlayerId: Map<string, number>;
  playerPeers: Map<string, Set<SocketPeer>>;
  reconnectTokensByPlayerId: Map<string, string>;
  snapshot: RoomSnapshot;
}

type ActiveGameRecord =
  | {
      gameId: "imposter-crash";
      state: ImposterGameState;
    }
  | {
      gameId: "sketch-crash";
      state: SketchGameState;
    };

const roomsByCode = new Map<string, RoomRecord>();
const peers = new Set<SocketPeer>();
const roomStore = createRoomStore<ActiveGameRecord>({
  filePath: roomStoreFilePath,
  keyPrefix: roomStoreKeyPrefix,
  redisUrl: roomStoreRedisUrl
});

const cleanupTimer = setInterval(expireInactiveRooms, cleanupIntervalMs);
cleanupTimer.unref?.();

const server = createServer((request, response) => {
  const body = JSON.stringify({
    name: "Group Crash server",
    status: "live-lobby",
    rooms: roomsByCode.size
  });

  response.writeHead(200, {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json"
  });
  response.end(body);
});

server.on("upgrade", (request, socket) => {
  if (!isWebSocketUpgrade(request)) {
    socket.destroy();
    return;
  }

  const acceptKey = createHash("sha1")
    .update(
      `${request.headers["sec-websocket-key"]}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`
    )
    .digest("base64");

  socket.write(
    [
      "HTTP/1.1 101 Switching Protocols",
      "Upgrade: websocket",
      "Connection: Upgrade",
      `Sec-WebSocket-Accept: ${acceptKey}`,
      "",
      ""
    ].join("\r\n")
  );

  const peer: SocketPeer = {
    id: randomUUID(),
    buffer: Buffer.alloc(0),
    playerId: null,
    role: "unassigned",
    roomCode: null,
    socket
  };

  peers.add(peer);

  socket.on("data", (chunk: Buffer) => handleSocketData(peer, chunk));
  socket.on("close", () => handlePeerClose(peer));
  socket.on("error", () => handlePeerClose(peer));
});

await restorePersistedRooms();

server.listen(port, host, () => {
  console.log(`Group Crash server listening on http://${host}:${port}`);
});

function isWebSocketUpgrade(request: IncomingMessage) {
  return (
    request.headers.upgrade?.toLowerCase() === "websocket" &&
    typeof request.headers["sec-websocket-key"] === "string"
  );
}

function handleSocketData(peer: SocketPeer, chunk: Buffer) {
  peer.buffer = Buffer.concat([peer.buffer, chunk]);

  if (peer.buffer.length > maxMessageBytes) {
    sendError(peer, "UNKNOWN", "Message was too large.");
    peer.socket.end();
    return;
  }

  const parsed = parseFrames(peer.buffer);
  peer.buffer = parsed.remaining;

  for (const frame of parsed.frames) {
    if (frame.opcode === 0x8) {
      peer.socket.end();
      continue;
    }

    if (frame.opcode === 0x9) {
      writeFrame(peer.socket, frame.payload, 0xA);
      continue;
    }

    if (frame.opcode !== 0x1) {
      continue;
    }

    handleClientMessage(peer, frame.payload.toString("utf8"));
  }
}

function handleClientMessage(peer: SocketPeer, rawMessage: string) {
  const event = parseClientEvent(rawMessage);

  if (!event) {
    sendError(peer, "UNKNOWN", "Message was not a valid Group Crash event.");
    return;
  }

  switch (event.type) {
    case "room.create":
      handleCreateRoom(peer);
      break;
    case "room.watch":
      handleWatchRoom(peer, event.payload);
      break;
    case "room.join":
      handleJoinRoom(peer, event.payload);
      break;
    case "room.reconnect":
      handleReconnect(peer, event.payload);
      break;
    case "room.leave":
      handleLeaveRoom(peer, event.payload);
      break;
    case "room.settings.update":
      handleUpdateRoomSettings(peer, event.payload);
      break;
    case "player.kick":
      handleKickPlayer(peer, event.payload);
      break;
    case "player.mute":
      handleMutePlayer(peer, event.payload);
      break;
    case "message.send":
      handleSendMessage(peer, event.payload);
      break;
    case "host.request":
      handleHostRequest(peer, event.payload);
      break;
    case "host.vote.cast":
      handleHostVote(peer, event.payload);
      break;
    case "host.pass":
      handleHostPass(peer, event.payload);
      break;
    case "game.select":
      handleGameSelect(peer, event.payload);
      break;
    case "game.start":
      handleGameStart(peer, event.payload);
      break;
    case "game.advance":
      handleGameAdvance(peer, event.payload);
      break;
    case "game.vote.cast":
      handleGameVote(peer, event.payload);
      break;
    case "game.sketch.stroke":
      handleSketchStroke(peer, event.payload);
      break;
    case "game.sketch.guess":
      handleSketchGuess(peer, event.payload);
      break;
  }
}

function handleCreateRoom(peer: SocketPeer) {
  const roomCode = createRoomCode();
  const roomId = `room-${randomUUID()}`;
  const expiresAt = Date.now() + roomTtlMs;
  const record: RoomRecord = {
    activeGame: null,
    disconnectTimersByPlayerId: new Map(),
    displayPeers: new Set(),
    expiresAt,
    lastMessageAtByPlayerId: new Map(),
    playerPeers: new Map(),
    reconnectTokensByPlayerId: new Map(),
    snapshot: createEmptyRoomSnapshot({ availableGames: gameRegistry, roomCode, roomId })
  };

  roomsByCode.set(roomCode, record);
  persistRoom(record);
  attachDisplay(peer, record);

  const payload: RoomCreatedPayload = {
    roomId,
    roomCode,
    joinUrl: `${controllerOrigin}/?room=${roomCode}`,
    expiresAt
  };

  send(peer, { type: "room.created", payload });
  sendSnapshot(peer, record);
}

function handleWatchRoom(peer: SocketPeer, payload: WatchRoomPayload) {
  const record = findRoom(payload.roomCode);

  if (!record) {
    sendError(peer, "ROOM_NOT_FOUND", "That room is not active.");
    return;
  }

  touchRoom(record);
  attachDisplay(peer, record);
  sendSnapshot(peer, record);
}

function handleJoinRoom(peer: SocketPeer, payload: JoinRoomPayload) {
  const record = findRoom(payload.roomCode);

  if (!record) {
    sendError(peer, "ROOM_NOT_FOUND", "That room is not active.");
    return;
  }

  touchRoom(record);

  if (record.snapshot.status !== "lobby") {
    sendError(peer, "NOT_ELIGIBLE", "This room is already playing.");
    return;
  }

  const sanitizedName = sanitizePlayerName(payload.name);

  if (!sanitizedName) {
    sendError(peer, "INVALID_NAME", "Name must be 2 to 16 characters.");
    return;
  }

  if (!isChessAvatar(payload.avatar)) {
    sendError(peer, "INVALID_AVATAR", "Choose one of the supported chess avatars.");
    return;
  }

  const playerId = `player-${randomUUID()}`;
  const result = joinLocalPlayer(record.snapshot, {
    avatar: payload.avatar,
    id: playerId,
    name: sanitizedName,
    wantsHost: payload.wantsHost
  });

  if (result.status === "blocked") {
    sendError(
      peer,
      result.notice === "Room is full."
        ? "ROOM_FULL"
        : result.notice === "Room is locked."
          ? "ROOM_LOCKED"
          : "UNKNOWN",
      result.notice
    );
    return;
  }

  record.snapshot = result.room;
  attachPlayer(peer, record, playerId);

  const session: PlayerSessionPayload = {
    playerId,
    reconnectToken: randomUUID(),
    roomCode: record.snapshot.roomCode
  };

  record.reconnectTokensByPlayerId.set(playerId, session.reconnectToken);
  send(peer, { type: "player.session", payload: session });

  const joinedPlayer = record.snapshot.players.find((player) => player.id === playerId);

  if (joinedPlayer) {
    broadcast(record, { type: "player.joined", payload: joinedPlayer });
  }

  broadcastSnapshot(record);
}

function handleReconnect(peer: SocketPeer, payload: ReconnectPayload) {
  const record = findRoom(payload.roomCode);

  if (!record) {
    sendError(peer, "ROOM_NOT_FOUND", "That room is not active.");
    return;
  }

  touchRoom(record);
  const token = record.reconnectTokensByPlayerId.get(payload.playerId);

  if (!token || token !== payload.reconnectToken) {
    sendError(peer, "NOT_ELIGIBLE", "Reconnect token was not accepted.");
    return;
  }

  const result = reconnectLocalPlayer(record.snapshot, payload.playerId);
  record.snapshot = result.room;
  clearDisconnectTimer(record, payload.playerId);
  attachPlayer(peer, record, payload.playerId);

  send(peer, {
    type: "player.session",
    payload: {
      playerId: payload.playerId,
      reconnectToken: payload.reconnectToken,
      roomCode: payload.roomCode
    }
  });
  broadcast(record, {
    type: "player.reconnected",
    payload: { playerId: payload.playerId, roomCode: payload.roomCode }
  });
  broadcastSnapshot(record);
}

function handleLeaveRoom(peer: SocketPeer, payload: LeaveRoomPayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.playerId);

  if (!record) {
    return;
  }

  const previousHostPlayerId = record.snapshot.hostPlayerId;
  const playerWasInActiveGame = Boolean(
    record.activeGame?.state.playerIds.includes(payload.playerId)
  );
  const result = removeLocalPlayer(record.snapshot, payload.playerId);
  record.snapshot = result.room;
  clearDisconnectTimer(record, payload.playerId);
  record.reconnectTokensByPlayerId.delete(payload.playerId);
  detachPeerFromRoom(peer);

  const nextHostPlayerId = record.snapshot.hostPlayerId;

  if (previousHostPlayerId !== nextHostPlayerId && nextHostPlayerId) {
    broadcast(record, {
      type: "host.changed",
      payload: {
        nextHostPlayerId,
        previousHostPlayerId,
        reason: "disconnect",
        roomCode: record.snapshot.roomCode
      }
    });
  }

  if (playerWasInActiveGame) {
    clearActiveGame(record);
  }

  broadcastSnapshot(record);
}

function handleUpdateRoomSettings(
  peer: SocketPeer,
  payload: UpdateRoomSettingsPayload
) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.hostPlayerId);

  if (!record) {
    return;
  }

  const result = updateLocalRoomSettings(record.snapshot, payload.hostPlayerId, {
    isLocked: payload.isLocked,
    maxPlayers: payload.maxPlayers
  });

  if (result.status === "blocked") {
    sendError(peer, record.snapshot.hostPlayerId === payload.hostPlayerId ? "NOT_ELIGIBLE" : "NOT_HOST", result.notice);
    return;
  }

  record.snapshot = result.room;
  broadcast(record, {
    type: "room.settings.updated",
    payload: {
      roomCode: record.snapshot.roomCode,
      isLocked: record.snapshot.isLocked,
      maxPlayers: record.snapshot.maxPlayers,
      updatedByPlayerId: payload.hostPlayerId
    }
  });
  broadcastSnapshot(record);
}

function handleKickPlayer(peer: SocketPeer, payload: KickPlayerPayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.hostPlayerId);

  if (!record) {
    return;
  }

  if (record.snapshot.hostPlayerId !== payload.hostPlayerId) {
    sendError(peer, "NOT_HOST", "Only the current host can kick players.");
    return;
  }

  if (payload.targetPlayerId === payload.hostPlayerId) {
    sendError(peer, "NOT_ELIGIBLE", "The host cannot kick themselves.");
    return;
  }

  const target = record.snapshot.players.find(
    (player) => player.id === payload.targetPlayerId
  );

  if (!target) {
    sendError(peer, "NOT_ELIGIBLE", "Player is not in the room.");
    return;
  }

  const targetPeers = [...(record.playerPeers.get(payload.targetPlayerId) ?? [])];
  const playerWasInActiveGame = Boolean(
    record.activeGame?.state.playerIds.includes(payload.targetPlayerId)
  );
  const result = removeLocalPlayer(record.snapshot, payload.targetPlayerId);

  if (result.status === "blocked") {
    sendError(peer, "NOT_ELIGIBLE", result.notice);
    return;
  }

  record.snapshot = result.room;
  clearDisconnectTimer(record, payload.targetPlayerId);
  record.reconnectTokensByPlayerId.delete(payload.targetPlayerId);

  for (const targetPeer of targetPeers) {
    send(targetPeer, {
      type: "player.kicked",
      payload: {
        kickedByPlayerId: payload.hostPlayerId,
        roomCode: record.snapshot.roomCode,
        targetPlayerId: payload.targetPlayerId
      }
    });
    detachPeerFromRoom(targetPeer);
  }

  broadcast(record, {
    type: "player.kicked",
    payload: {
      kickedByPlayerId: payload.hostPlayerId,
      roomCode: record.snapshot.roomCode,
      targetPlayerId: payload.targetPlayerId
    }
  });

  if (playerWasInActiveGame) {
    clearActiveGame(record);
  }

  broadcastSnapshot(record);
  broadcastPrivateGameStates(record);
}

function handleMutePlayer(peer: SocketPeer, payload: MutePlayerPayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.hostPlayerId);

  if (!record) {
    return;
  }

  const result = muteLocalPlayer(
    record.snapshot,
    payload.hostPlayerId,
    payload.targetPlayerId,
    payload.isMuted
  );

  if (result.status === "blocked") {
    sendError(peer, record.snapshot.hostPlayerId === payload.hostPlayerId ? "NOT_ELIGIBLE" : "NOT_HOST", result.notice);
    return;
  }

  record.snapshot = result.room;
  broadcast(record, {
    type: "player.muted",
    payload: {
      isMuted: payload.isMuted,
      mutedByPlayerId: payload.hostPlayerId,
      roomCode: record.snapshot.roomCode,
      targetPlayerId: payload.targetPlayerId
    }
  });
  broadcastSnapshot(record);
}

function handleSendMessage(peer: SocketPeer, payload: SendMessagePayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.playerId);

  if (!record) {
    return;
  }

  const now = Date.now();
  const lastMessageAt = record.lastMessageAtByPlayerId.get(payload.playerId) ?? 0;

  if (now - lastMessageAt < messageCooldownMs) {
    sendError(peer, "RATE_LIMITED", "Slow down before sending another shout.");
    return;
  }

  const result = sendLocalMessage(record.snapshot, payload.playerId, payload.text);

  if (result.status === "blocked") {
    sendError(
      peer,
      result.notice === "Message is too long."
        ? "MESSAGE_TOO_LONG"
        : result.notice === "You are muted in this room."
          ? "PLAYER_MUTED"
          : "UNKNOWN",
      result.notice
    );
    return;
  }

  record.lastMessageAtByPlayerId.set(payload.playerId, now);
  record.snapshot = result.room;

  const message = record.snapshot.messages.at(-1);

  if (message) {
    broadcast(record, { type: "message.received", payload: message });
  }

  broadcastSnapshot(record);
}

function handleHostRequest(peer: SocketPeer, payload: HostRequestPayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.playerId);

  if (!record) {
    return;
  }

  const hadVote = Boolean(record.snapshot.activeHostVote);
  const previousHostPlayerId = record.snapshot.hostPlayerId;
  const result = requestLocalHost(record.snapshot, payload.playerId);

  if (result.status === "blocked") {
    sendError(peer, "NOT_ELIGIBLE", result.notice);
    return;
  }

  record.snapshot = result.room;

  if (previousHostPlayerId !== record.snapshot.hostPlayerId && record.snapshot.hostPlayerId) {
    broadcast(record, {
      type: "host.changed",
      payload: {
        nextHostPlayerId: record.snapshot.hostPlayerId,
        previousHostPlayerId,
        reason: "initial",
        roomCode: record.snapshot.roomCode
      }
    });
  }

  if (!hadVote && record.snapshot.activeHostVote) {
    broadcast(record, { type: "host.vote.started", payload: record.snapshot.activeHostVote });
  }

  broadcastSnapshot(record);
}

function handleHostVote(peer: SocketPeer, payload: CastHostVotePayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.playerId);

  if (!record) {
    return;
  }

  const activeVote = record.snapshot.activeHostVote;

  if (!activeVote || activeVote.id !== payload.voteId) {
    sendError(peer, "VOTE_NOT_FOUND", "That host vote is not active.");
    return;
  }

  const previousHostPlayerId = record.snapshot.hostPlayerId;
  const voteBeforeCast = cloneHostVote(activeVote);
  const completedVote = applyVoteToHostVote(
    voteBeforeCast,
    payload.playerId,
    payload.vote
  );
  const result = castLocalHostVote(record.snapshot, payload.playerId, payload.vote);

  if (result.status === "blocked") {
    sendError(peer, "NOT_ELIGIBLE", result.notice);
    return;
  }

  record.snapshot = result.room;

  if (record.snapshot.activeHostVote) {
    broadcast(record, { type: "host.vote.updated", payload: record.snapshot.activeHostVote });
    broadcastSnapshot(record);
    return;
  }

  const passed = record.snapshot.hostPlayerId === voteBeforeCast.proposedHostPlayerId;

  broadcast(record, {
    type: "host.vote.completed",
    payload: {
      noVotes: completedVote.noPlayerIds.length,
      passed,
      previousHostPlayerId,
      proposedHostPlayerId: voteBeforeCast.proposedHostPlayerId,
      requiredYesVotes: voteBeforeCast.requiredYesVotes,
      roomCode: record.snapshot.roomCode,
      voteId: voteBeforeCast.id,
      yesVotes: completedVote.yesPlayerIds.length
    }
  });

  if (passed && record.snapshot.hostPlayerId) {
    broadcast(record, {
      type: "host.changed",
      payload: {
        nextHostPlayerId: record.snapshot.hostPlayerId,
        previousHostPlayerId,
        reason: "vote",
        roomCode: record.snapshot.roomCode
      }
    });
  }

  broadcastSnapshot(record);
}

function handleHostPass(peer: SocketPeer, payload: PassHostPayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.hostPlayerId);

  if (!record) {
    return;
  }

  if (record.snapshot.hostPlayerId !== payload.hostPlayerId) {
    sendError(peer, "NOT_HOST", "Only the current host can pass host.");
    return;
  }

  const previousHostPlayerId = record.snapshot.hostPlayerId;
  const result = passLocalHost(record.snapshot, payload.targetPlayerId);

  if (result.status === "blocked") {
    sendError(peer, "NOT_ELIGIBLE", result.notice);
    return;
  }

  record.snapshot = result.room;

  if (record.snapshot.hostPlayerId && record.snapshot.hostPlayerId !== previousHostPlayerId) {
    broadcast(record, {
      type: "host.changed",
      payload: {
        nextHostPlayerId: record.snapshot.hostPlayerId,
        previousHostPlayerId,
        reason: "pass",
        roomCode: record.snapshot.roomCode
      }
    });
  }

  broadcastSnapshot(record);
}

function handleGameSelect(peer: SocketPeer, payload: SelectGamePayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.hostPlayerId);

  if (!record) {
    return;
  }

  if (record.snapshot.hostPlayerId !== payload.hostPlayerId) {
    sendError(peer, "NOT_HOST", "Only the current host can select games.");
    return;
  }

  const result = selectLocalGame(
    record.snapshot,
    payload.hostPlayerId,
    payload.gameId
  );

  if (result.status === "blocked") {
    sendError(
      peer,
      result.notice === "That game is not installed in this room."
        ? "GAME_NOT_FOUND"
        : "NOT_ELIGIBLE",
      result.notice
    );
    return;
  }

  record.snapshot = result.room;
  broadcast(record, {
    type: "game.selected",
    payload: {
      gameId: payload.gameId,
      roomCode: record.snapshot.roomCode,
      selectedByPlayerId: payload.hostPlayerId
    }
  });
  broadcastSnapshot(record);
}

function handleGameStart(peer: SocketPeer, payload: StartGamePayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.hostPlayerId);

  if (!record) {
    return;
  }

  if (record.snapshot.hostPlayerId !== payload.hostPlayerId) {
    sendError(peer, "NOT_HOST", "Only the current host can start games.");
    return;
  }

  if (record.activeGame || record.snapshot.activeGame) {
    sendError(peer, "GAME_ALREADY_ACTIVE", "A game is already running.");
    return;
  }

  const selectedGame = record.snapshot.availableGames.find(
    (game) => game.id === record.snapshot.selectedGameId
  );

  if (!selectedGame) {
    sendError(peer, "GAME_NOT_FOUND", "Select a game before starting.");
    return;
  }

  if (selectedGame.status !== "playable") {
    sendError(peer, "INVALID_GAME_ACTION", `${selectedGame.name} is not playable yet.`);
    return;
  }

  const connectedPlayerIds = record.snapshot.players
    .filter((player) => player.connectionStatus === "connected")
    .map((player) => player.id);

  if (connectedPlayerIds.length < selectedGame.minPlayers) {
    sendError(
      peer,
      "NOT_ELIGIBLE",
      `${selectedGame.name} needs at least ${selectedGame.minPlayers} players.`
    );
    return;
  }

  if (selectedGame.id === imposterCrashManifest.id) {
    const state = createImposterGameState({ playerIds: connectedPlayerIds });
    record.activeGame = { gameId: "imposter-crash", state };
  } else if (selectedGame.id === sketchCrashManifest.id) {
    const state = createSketchGameState({ playerIds: connectedPlayerIds });
    record.activeGame = { gameId: "sketch-crash", state };
  } else {
    sendError(peer, "INVALID_GAME_ACTION", `${selectedGame.name} is not playable yet.`);
    return;
  }

  syncActiveGameSnapshot(record);

  broadcast(record, {
    type: "game.started",
    payload: {
      gameId: selectedGame.id,
      roomCode: record.snapshot.roomCode,
      startedByPlayerId: payload.hostPlayerId
    }
  });
  broadcastSnapshot(record);
  broadcastPrivateGameStates(record);
}

function handleGameAdvance(peer: SocketPeer, payload: AdvanceGamePayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.hostPlayerId);

  if (!record) {
    return;
  }

  if (record.snapshot.hostPlayerId !== payload.hostPlayerId) {
    sendError(peer, "NOT_HOST", "Only the current host can advance games.");
    return;
  }

  if (!record.activeGame) {
    sendError(peer, "GAME_NOT_ACTIVE", "No game is running.");
    return;
  }

  if (payload.action === "return_lobby") {
    clearActiveGame(record);
    broadcastSnapshot(record);
    broadcastPrivateGameStates(record);
    return;
  }

  if (record.activeGame.gameId === "imposter-crash") {
    if (payload.action !== "start_voting") {
      sendError(peer, "INVALID_GAME_ACTION", "That action does not belong to Imposter Crash.");
      return;
    }

    if (record.activeGame.state.phase !== "discussion") {
      sendError(peer, "INVALID_GAME_ACTION", "Voting can only start after discussion.");
      return;
    }

    record.activeGame.state = applyImposterAction(record.activeGame.state, {
      type: "start_voting"
    });
    syncActiveGameSnapshot(record);
    broadcast(record, { type: "game.updated", payload: record.snapshot.activeGame! });
    broadcastSnapshot(record);
    broadcastPrivateGameStates(record);
    return;
  }

  if (payload.action === "start_guessing") {
    if (record.activeGame.state.phase !== "drawing") {
      sendError(peer, "INVALID_GAME_ACTION", "Guessing can only open after drawing.");
      return;
    }

    record.activeGame.state = applySketchAction(record.activeGame.state, {
      type: "start_guessing"
    });
  } else if (payload.action === "show_results") {
    if (record.activeGame.state.phase !== "guessing") {
      sendError(peer, "INVALID_GAME_ACTION", "Results can only show after guessing.");
      return;
    }

    record.activeGame.state = applySketchAction(record.activeGame.state, {
      type: "show_results"
    });
  } else {
    sendError(peer, "INVALID_GAME_ACTION", "That action does not belong to Sketch Crash.");
    return;
  }

  syncActiveGameSnapshot(record);
  broadcast(record, { type: "game.updated", payload: record.snapshot.activeGame! });
  broadcastSnapshot(record);
  broadcastPrivateGameStates(record);
}

function handleGameVote(peer: SocketPeer, payload: CastGameVotePayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.playerId);

  if (!record) {
    return;
  }

  if (!record.activeGame) {
    sendError(peer, "GAME_NOT_ACTIVE", "No game vote is active.");
    return;
  }

  if (record.activeGame.gameId !== "imposter-crash") {
    sendError(peer, "INVALID_GAME_ACTION", "This game does not use voting targets.");
    return;
  }

  if (record.activeGame.state.phase !== "voting") {
    sendError(peer, "INVALID_GAME_ACTION", "Voting is not open yet.");
    return;
  }

  if (
    payload.targetPlayerId === payload.playerId ||
    !record.activeGame.state.playerIds.includes(payload.targetPlayerId)
  ) {
    sendError(peer, "INVALID_GAME_ACTION", "Vote for another active player.");
    return;
  }

  record.activeGame.state = applyImposterAction(record.activeGame.state, {
    type: "cast_vote",
    playerId: payload.playerId,
    targetPlayerId: payload.targetPlayerId
  });
  syncActiveGameSnapshot(record);
  broadcast(record, { type: "game.updated", payload: record.snapshot.activeGame! });
  broadcastSnapshot(record);
  broadcastPrivateGameStates(record);
}

function handleSketchStroke(peer: SocketPeer, payload: SendSketchStrokePayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.playerId);

  if (!record) {
    return;
  }

  if (!record.activeGame || record.activeGame.gameId !== "sketch-crash") {
    sendError(peer, "GAME_NOT_ACTIVE", "No Sketch Crash round is active.");
    return;
  }

  if (record.activeGame.state.phase !== "drawing") {
    sendError(peer, "INVALID_GAME_ACTION", "Drawing is closed for this round.");
    return;
  }

  if (record.activeGame.state.drawerPlayerId !== payload.playerId) {
    sendError(peer, "NOT_ELIGIBLE", "Only the drawer can send strokes.");
    return;
  }

  record.activeGame.state = applySketchAction(record.activeGame.state, {
    type: "add_stroke",
    playerId: payload.playerId,
    stroke: payload.stroke
  });
  syncActiveGameSnapshot(record);
  broadcast(record, { type: "game.updated", payload: record.snapshot.activeGame! });
  broadcastSnapshot(record);
  broadcastPrivateGameStates(record);
}

function handleSketchGuess(peer: SocketPeer, payload: SubmitSketchGuessPayload) {
  const record = assertPlayerAction(peer, payload.roomCode, payload.playerId);

  if (!record) {
    return;
  }

  if (!record.activeGame || record.activeGame.gameId !== "sketch-crash") {
    sendError(peer, "GAME_NOT_ACTIVE", "No Sketch Crash round is active.");
    return;
  }

  if (record.activeGame.state.phase !== "guessing") {
    sendError(peer, "INVALID_GAME_ACTION", "Guessing is not open yet.");
    return;
  }

  if (record.activeGame.state.drawerPlayerId === payload.playerId) {
    sendError(peer, "NOT_ELIGIBLE", "The drawer cannot submit a guess.");
    return;
  }

  record.activeGame.state = applySketchAction(record.activeGame.state, {
    type: "submit_guess",
    guess: payload.guess,
    playerId: payload.playerId
  });
  syncActiveGameSnapshot(record);
  broadcast(record, { type: "game.updated", payload: record.snapshot.activeGame! });
  broadcastSnapshot(record);
  broadcastPrivateGameStates(record);
}

function assertPlayerAction(
  peer: SocketPeer,
  roomCode: string,
  playerId: string
): RoomRecord | null {
  const record = findRoom(roomCode);

  if (!record) {
    sendError(peer, "ROOM_NOT_FOUND", "That room is not active.");
    return null;
  }

  if (peer.role !== "player" || peer.roomCode !== roomCode || peer.playerId !== playerId) {
    sendError(peer, "NOT_ELIGIBLE", "This controller is not attached to that player.");
    return null;
  }

  touchRoom(record);
  return record;
}

function handlePeerClose(peer: SocketPeer) {
  if (!peers.has(peer)) {
    return;
  }

  peers.delete(peer);

  if (peer.role !== "player" || !peer.roomCode || !peer.playerId) {
    detachPeerFromRoom(peer);
    return;
  }

  const record = findRoom(peer.roomCode);
  const playerId = peer.playerId;

  detachPeerFromRoom(peer);

  if (!record) {
    return;
  }

  const stillConnected = (record.playerPeers.get(playerId)?.size ?? 0) > 0;

  if (stillConnected) {
    return;
  }

  schedulePlayerDisconnect(record, playerId);
}

function schedulePlayerDisconnect(record: RoomRecord, playerId: string) {
  if (record.disconnectTimersByPlayerId.has(playerId)) {
    return;
  }

  const result = markLocalPlayerDisconnected(record.snapshot, playerId);

  if (result.status === "success") {
    record.snapshot = result.room;
    broadcast(record, {
      type: "player.disconnected",
      payload: { playerId, roomCode: record.snapshot.roomCode }
    });
    broadcastSnapshot(record);
  }

  const timer = setTimeout(() => {
    finalizePlayerDisconnect(record.snapshot.roomCode, playerId);
  }, reconnectGraceMs);

  timer.unref?.();
  record.disconnectTimersByPlayerId.set(playerId, timer);
}

function finalizePlayerDisconnect(roomCode: string, playerId: string) {
  const record = findRoom(roomCode);

  if (!record) {
    return;
  }

  clearDisconnectTimer(record, playerId);

  if ((record.playerPeers.get(playerId)?.size ?? 0) > 0) {
    return;
  }

  const previousHostPlayerId = record.snapshot.hostPlayerId;
  const playerWasInActiveGame = Boolean(record.activeGame?.state.playerIds.includes(playerId));
  const result = removeLocalPlayer(record.snapshot, playerId);
  record.snapshot = result.room;
  record.reconnectTokensByPlayerId.delete(playerId);

  if (
    previousHostPlayerId !== record.snapshot.hostPlayerId &&
    record.snapshot.hostPlayerId
  ) {
    broadcast(record, {
      type: "host.changed",
      payload: {
        nextHostPlayerId: record.snapshot.hostPlayerId,
        previousHostPlayerId,
        reason: "disconnect",
        roomCode: record.snapshot.roomCode
      }
    });
  }

  if (playerWasInActiveGame) {
    clearActiveGame(record);
  }

  broadcastSnapshot(record);
  broadcastPrivateGameStates(record);
}

function clearDisconnectTimer(record: RoomRecord, playerId: string) {
  const timer = record.disconnectTimersByPlayerId.get(playerId);

  if (timer) {
    clearTimeout(timer);
    record.disconnectTimersByPlayerId.delete(playerId);
  }
}

function attachDisplay(peer: SocketPeer, record: RoomRecord) {
  detachPeerFromRoom(peer);
  peer.role = "display";
  peer.roomCode = record.snapshot.roomCode;
  peer.playerId = null;
  record.displayPeers.add(peer);
}

function attachPlayer(peer: SocketPeer, record: RoomRecord, playerId: string) {
  detachPeerFromRoom(peer);
  peer.role = "player";
  peer.roomCode = record.snapshot.roomCode;
  peer.playerId = playerId;

  const playerPeers = record.playerPeers.get(playerId) ?? new Set<SocketPeer>();
  playerPeers.add(peer);
  record.playerPeers.set(playerId, playerPeers);
}

function detachPeerFromRoom(peer: SocketPeer) {
  if (!peer.roomCode) {
    return;
  }

  const record = findRoom(peer.roomCode);

  if (record) {
    record.displayPeers.delete(peer);

    if (peer.playerId) {
      const playerPeers = record.playerPeers.get(peer.playerId);
      playerPeers?.delete(peer);

      if (playerPeers?.size === 0) {
        record.playerPeers.delete(peer.playerId);
      }
    }
  }

  peer.roomCode = null;
  peer.playerId = null;
  peer.role = "unassigned";
}

function findRoom(roomCode: string) {
  const record = roomsByCode.get(roomCode.trim().toUpperCase()) ?? null;

  if (!record) {
    return null;
  }

  if (Date.now() > record.expiresAt) {
    expireRoom(record, "expired");
    return null;
  }

  return record;
}

function touchRoom(record: RoomRecord) {
  record.expiresAt = Date.now() + roomTtlMs;
  persistRoom(record);
}

function expireInactiveRooms() {
  const now = Date.now();

  for (const record of roomsByCode.values()) {
    if (now > record.expiresAt) {
      expireRoom(record, "expired");
    }
  }
}

function expireRoom(record: RoomRecord, reason: "expired" | "server_shutdown") {
  const roomCode = record.snapshot.roomCode;

  for (const playerId of record.disconnectTimersByPlayerId.keys()) {
    clearDisconnectTimer(record, playerId);
  }

  broadcast(record, {
    type: "room.closed",
    payload: { reason, roomCode }
  });

  for (const peer of record.displayPeers) {
    peer.roomCode = null;
    peer.playerId = null;
    peer.role = "unassigned";
  }

  for (const playerPeers of record.playerPeers.values()) {
    for (const peer of playerPeers) {
      peer.roomCode = null;
      peer.playerId = null;
      peer.role = "unassigned";
    }
  }

  record.displayPeers.clear();
  record.playerPeers.clear();
  record.reconnectTokensByPlayerId.clear();
  record.lastMessageAtByPlayerId.clear();
  roomsByCode.delete(roomCode);
  deletePersistedRoom(roomCode);
}

function broadcast(record: RoomRecord, event: ServerEvent) {
  for (const peer of record.displayPeers) {
    send(peer, event);
  }

  for (const playerPeers of record.playerPeers.values()) {
    for (const peer of playerPeers) {
      send(peer, event);
    }
  }
}

function broadcastSnapshot(record: RoomRecord) {
  persistRoom(record);
  broadcast(record, { type: "room.snapshot", payload: record.snapshot });
}

function sendSnapshot(peer: SocketPeer, record: RoomRecord) {
  send(peer, { type: "room.snapshot", payload: record.snapshot });
  sendPrivateGameState(peer, record);
}

function syncActiveGameSnapshot(record: RoomRecord) {
  record.snapshot = {
    ...record.snapshot,
    activeGame: createPublicGameView(record.activeGame),
    status: record.activeGame ? "playing" : "lobby"
  };
}

function clearActiveGame(record: RoomRecord) {
  record.activeGame = null;
  syncActiveGameSnapshot(record);
}

function broadcastPrivateGameStates(record: RoomRecord) {
  for (const peer of record.displayPeers) {
    sendPrivateGameState(peer, record);
  }

  for (const playerPeers of record.playerPeers.values()) {
    for (const peer of playerPeers) {
      sendPrivateGameState(peer, record);
    }
  }
}

function sendPrivateGameState(peer: SocketPeer, record: RoomRecord) {
  if (peer.role !== "player" || !peer.playerId) {
    return;
  }

  const payload: PrivateGameView | null = createPrivateGameView(
    record.activeGame,
    peer.playerId
  );

  send(peer, { type: "game.private_state", payload });
}

function createPublicGameView(activeGame: ActiveGameRecord | null) {
  if (!activeGame) {
    return null;
  }

  return activeGame.gameId === "imposter-crash"
    ? createImposterPublicView(activeGame.state)
    : createSketchPublicView(activeGame.state);
}

function createPrivateGameView(
  activeGame: ActiveGameRecord | null,
  playerId: string
): PrivateGameView | null {
  if (!activeGame) {
    return null;
  }

  return activeGame.gameId === "imposter-crash"
    ? createImposterPrivateView(activeGame.state, playerId)
    : createSketchPrivateView(activeGame.state, playerId);
}

function send(peer: SocketPeer, event: ServerEvent) {
  if (!peer.socket.writable) {
    return;
  }

  writeFrame(peer.socket, Buffer.from(JSON.stringify(event), "utf8"), 0x1);
}

function sendError(
  peer: SocketPeer,
  code: ServerErrorPayload["code"],
  message: string
) {
  send(peer, { type: "error", payload: { code, message } });
}

async function restorePersistedRooms() {
  if (!roomStore) {
    return;
  }

  try {
    const storedRooms = await roomStore.loadAll();

    for (const storedRoom of storedRooms) {
      if (Date.now() > storedRoom.expiresAt) {
        await roomStore.delete(storedRoom.snapshot.roomCode);
        continue;
      }

      const record = createRoomRecordFromStored(storedRoom);
      roomsByCode.set(record.snapshot.roomCode, record);

      for (const player of record.snapshot.players) {
        schedulePlayerDisconnect(record, player.id);
      }
    }

    if (storedRooms.length > 0) {
      console.log(`Restored ${roomsByCode.size} persisted Group Crash room(s).`);
    }
  } catch (error) {
    console.error("Could not restore persisted rooms.", error);
  }
}

function createRoomRecordFromStored(
  storedRoom: StoredRoomRecord<ActiveGameRecord>
): RoomRecord {
  const snapshot: RoomSnapshot = {
    ...storedRoom.snapshot,
    players: storedRoom.snapshot.players.map((player) => ({
      ...player,
      connectionStatus: "disconnected"
    }))
  };
  const record: RoomRecord = {
    activeGame: storedRoom.activeGame,
    disconnectTimersByPlayerId: new Map(),
    displayPeers: new Set(),
    expiresAt: storedRoom.expiresAt,
    lastMessageAtByPlayerId: new Map(storedRoom.lastMessageAtEntries),
    playerPeers: new Map(),
    reconnectTokensByPlayerId: new Map(storedRoom.reconnectTokenEntries),
    snapshot
  };

  syncActiveGameSnapshot(record);
  return record;
}

function persistRoom(record: RoomRecord) {
  if (!roomStore) {
    return;
  }

  const storedRoom: StoredRoomRecord<ActiveGameRecord> = {
    activeGame: record.activeGame,
    expiresAt: record.expiresAt,
    lastMessageAtEntries: [...record.lastMessageAtByPlayerId.entries()],
    reconnectTokenEntries: [...record.reconnectTokensByPlayerId.entries()],
    snapshot: record.snapshot
  };

  void roomStore.save(storedRoom).catch((error) => {
    console.error("Could not persist room.", error);
  });
}

function deletePersistedRoom(roomCode: string) {
  if (!roomStore) {
    return;
  }

  void roomStore.delete(roomCode).catch((error) => {
    console.error("Could not delete persisted room.", error);
  });
}

function parseClientEvent(rawMessage: string): ClientEvent | null {
  try {
    const value = JSON.parse(rawMessage) as unknown;

    if (!isRecord(value) || typeof value.type !== "string") {
      return null;
    }

    const payload = value.payload;

    switch (value.type) {
      case "room.create":
        return isRecord(payload)
          ? { type: "room.create", payload: { displayName: optionalString(payload.displayName) } }
          : null;
      case "room.watch":
        return isRecord(payload) && isRoomCode(payload.roomCode)
          ? { type: "room.watch", payload: { roomCode: normalizeRoomCode(payload.roomCode) } }
          : null;
      case "room.join":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          typeof payload.name === "string" &&
          typeof payload.avatar === "string" &&
          isChessAvatar(payload.avatar) &&
          typeof payload.wantsHost === "boolean"
          ? {
              type: "room.join",
              payload: {
                avatar: payload.avatar,
                name: payload.name,
                roomCode: normalizeRoomCode(payload.roomCode),
                wantsHost: payload.wantsHost
              }
            }
          : null;
      case "room.reconnect":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.playerId) &&
          isNonEmptyString(payload.reconnectToken)
          ? {
              type: "room.reconnect",
              payload: {
                playerId: payload.playerId,
                reconnectToken: payload.reconnectToken,
                roomCode: normalizeRoomCode(payload.roomCode)
              }
            }
          : null;
      case "room.leave":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.playerId)
          ? {
              type: "room.leave",
              payload: { playerId: payload.playerId, roomCode: normalizeRoomCode(payload.roomCode) }
            }
          : null;
      case "room.settings.update":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.hostPlayerId) &&
          (payload.maxPlayers === undefined || isRoomCapacity(payload.maxPlayers)) &&
          (payload.isLocked === undefined || typeof payload.isLocked === "boolean")
          ? {
              type: "room.settings.update",
              payload: {
                hostPlayerId: payload.hostPlayerId,
                isLocked:
                  typeof payload.isLocked === "boolean" ? payload.isLocked : undefined,
                maxPlayers:
                  typeof payload.maxPlayers === "number"
                    ? Math.trunc(payload.maxPlayers)
                    : undefined,
                roomCode: normalizeRoomCode(payload.roomCode)
              }
            }
          : null;
      case "player.kick":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.hostPlayerId) &&
          isNonEmptyString(payload.targetPlayerId)
          ? {
              type: "player.kick",
              payload: {
                hostPlayerId: payload.hostPlayerId,
                roomCode: normalizeRoomCode(payload.roomCode),
                targetPlayerId: payload.targetPlayerId
              }
            }
          : null;
      case "player.mute":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.hostPlayerId) &&
          isNonEmptyString(payload.targetPlayerId) &&
          typeof payload.isMuted === "boolean"
          ? {
              type: "player.mute",
              payload: {
                hostPlayerId: payload.hostPlayerId,
                isMuted: payload.isMuted,
                roomCode: normalizeRoomCode(payload.roomCode),
                targetPlayerId: payload.targetPlayerId
              }
            }
          : null;
      case "message.send":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.playerId) &&
          typeof payload.text === "string"
          ? {
              type: "message.send",
              payload: {
                playerId: payload.playerId,
                roomCode: normalizeRoomCode(payload.roomCode),
                text: payload.text
              }
            }
          : null;
      case "host.request":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.playerId)
          ? {
              type: "host.request",
              payload: { playerId: payload.playerId, roomCode: normalizeRoomCode(payload.roomCode) }
            }
          : null;
      case "host.vote.cast":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.playerId) &&
          isNonEmptyString(payload.voteId) &&
          (payload.vote === "yes" || payload.vote === "no")
          ? {
              type: "host.vote.cast",
              payload: {
                playerId: payload.playerId,
                roomCode: normalizeRoomCode(payload.roomCode),
                vote: payload.vote,
                voteId: payload.voteId
              }
            }
          : null;
      case "host.pass":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.hostPlayerId) &&
          (payload.targetPlayerId === undefined || isNonEmptyString(payload.targetPlayerId))
          ? {
              type: "host.pass",
              payload: {
                hostPlayerId: payload.hostPlayerId,
                roomCode: normalizeRoomCode(payload.roomCode),
                targetPlayerId: optionalString(payload.targetPlayerId)
              }
            }
          : null;
      case "game.select":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.hostPlayerId) &&
          isGameId(payload.gameId)
          ? {
              type: "game.select",
              payload: {
                gameId: normalizeGameId(payload.gameId),
                hostPlayerId: payload.hostPlayerId,
                roomCode: normalizeRoomCode(payload.roomCode)
              }
            }
          : null;
      case "game.start":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.hostPlayerId)
          ? {
              type: "game.start",
              payload: {
                hostPlayerId: payload.hostPlayerId,
                roomCode: normalizeRoomCode(payload.roomCode)
              }
            }
          : null;
      case "game.advance":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.hostPlayerId) &&
          (payload.action === "start_voting" ||
            payload.action === "start_guessing" ||
            payload.action === "show_results" ||
            payload.action === "return_lobby")
          ? {
              type: "game.advance",
              payload: {
                action: payload.action,
                hostPlayerId: payload.hostPlayerId,
                roomCode: normalizeRoomCode(payload.roomCode)
              }
            }
          : null;
      case "game.vote.cast":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.playerId) &&
          isNonEmptyString(payload.targetPlayerId)
          ? {
              type: "game.vote.cast",
              payload: {
                playerId: payload.playerId,
                roomCode: normalizeRoomCode(payload.roomCode),
                targetPlayerId: payload.targetPlayerId
              }
            }
          : null;
      case "game.sketch.stroke":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.playerId) &&
          isSketchStrokeInput(payload.stroke)
          ? {
              type: "game.sketch.stroke",
              payload: {
                playerId: payload.playerId,
                roomCode: normalizeRoomCode(payload.roomCode),
                stroke: payload.stroke
              }
            }
          : null;
      case "game.sketch.guess":
        return isRecord(payload) &&
          isRoomCode(payload.roomCode) &&
          isNonEmptyString(payload.playerId) &&
          typeof payload.guess === "string" &&
          payload.guess.trim().length >= 1 &&
          payload.guess.trim().length <= 40
          ? {
              type: "game.sketch.guess",
              payload: {
                guess: payload.guess,
                playerId: payload.playerId,
                roomCode: normalizeRoomCode(payload.roomCode)
              }
            }
          : null;
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRoomCode(value: unknown): value is string {
  return typeof value === "string" && /^[A-Z0-9]{4}$/.test(value.trim().toUpperCase());
}

function isRoomCapacity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 2 && value <= 8;
}

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
}

function isGameId(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9-]{2,48}$/.test(value.trim().toLowerCase());
}

function isSketchStrokeInput(value: unknown): value is SendSketchStrokePayload["stroke"] {
  if (!isRecord(value) || !Array.isArray(value.points)) {
    return false;
  }

  return (
    typeof value.color === "string" &&
    /^#[0-9a-f]{6}$/i.test(value.color) &&
    typeof value.size === "number" &&
    Number.isFinite(value.size) &&
    value.size >= 1 &&
    value.size <= 24 &&
    value.points.length >= 2 &&
    value.points.length <= 80 &&
    value.points.every(
      (point) =>
        isRecord(point) &&
        typeof point.x === "number" &&
        Number.isFinite(point.x) &&
        point.x >= 0 &&
        point.x <= 1 &&
        typeof point.y === "number" &&
        Number.isFinite(point.y) &&
        point.y >= 0 &&
        point.y <= 1
    )
  );
}

function normalizeGameId(value: string) {
  return value.trim().toLowerCase();
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function createRoomCode() {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const code = Array.from({ length: 4 }, () =>
      roomCodeAlphabet[Math.floor(Math.random() * roomCodeAlphabet.length)]
    ).join("");

    if (!roomsByCode.has(code)) {
      return code;
    }
  }

  return randomUUID().slice(0, 4).toUpperCase();
}

function sanitizePlayerName(name: string) {
  const trimmed = name.trim().replace(/\s+/g, " ");

  if (trimmed.length < 2 || trimmed.length > 16) {
    return null;
  }

  return trimmed;
}

function isChessAvatar(avatar: string): avatar is ChessAvatar {
  return avatarOptions.includes(avatar as ChessAvatar);
}

function cloneHostVote(vote: HostVote): HostVote {
  return {
    ...vote,
    eligiblePlayerIds: [...vote.eligiblePlayerIds],
    noPlayerIds: [...vote.noPlayerIds],
    yesPlayerIds: [...vote.yesPlayerIds]
  };
}

function applyVoteToHostVote(
  vote: HostVote,
  playerId: string,
  ballot: "yes" | "no"
): HostVote {
  const nextVote = cloneHostVote(vote);

  nextVote.yesPlayerIds = nextVote.yesPlayerIds.filter((id) => id !== playerId);
  nextVote.noPlayerIds = nextVote.noPlayerIds.filter((id) => id !== playerId);

  if (ballot === "yes") {
    nextVote.yesPlayerIds.push(playerId);
  } else {
    nextVote.noPlayerIds.push(playerId);
  }

  return nextVote;
}

function parseFrames(buffer: Buffer) {
  const frames: Array<{ opcode: number; payload: Buffer }> = [];
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) === 0x80;
    let payloadLength = secondByte & 0x7f;
    let cursor = offset + 2;

    if (payloadLength === 126) {
      if (cursor + 2 > buffer.length) {
        break;
      }

      payloadLength = buffer.readUInt16BE(cursor);
      cursor += 2;
    } else if (payloadLength === 127) {
      if (cursor + 8 > buffer.length) {
        break;
      }

      const bigLength = buffer.readBigUInt64BE(cursor);

      if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
        break;
      }

      payloadLength = Number(bigLength);
      cursor += 8;
    }

    const maskLength = masked ? 4 : 0;

    if (cursor + maskLength + payloadLength > buffer.length) {
      break;
    }

    const mask = masked ? buffer.subarray(cursor, cursor + 4) : null;
    cursor += maskLength;

    const payload = Buffer.from(buffer.subarray(cursor, cursor + payloadLength));
    cursor += payloadLength;

    if (mask) {
      for (let index = 0; index < payload.length; index += 1) {
        payload[index] ^= mask[index % 4];
      }
    }

    frames.push({ opcode, payload });
    offset = cursor;
  }

  return { frames, remaining: buffer.subarray(offset) };
}

function writeFrame(socket: Duplex, payload: Buffer, opcode: number) {
  const length = payload.length;
  let header: Buffer;

  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  header[0] = 0x80 | opcode;
  socket.write(Buffer.concat([header, payload]));
}
