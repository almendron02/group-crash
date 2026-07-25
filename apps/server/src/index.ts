import { createHash, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import {
  avatarOptions,
  castLocalHostVote,
  createEmptyRoomSnapshot,
  joinLocalPlayer,
  markLocalPlayerDisconnected,
  passLocalHost,
  reconnectLocalPlayer,
  removeLocalPlayer,
  requestLocalHost,
  sendLocalMessage,
  type CastHostVotePayload,
  type ChessAvatar,
  type ClientEvent,
  type HostRequestPayload,
  type HostVote,
  type JoinRoomPayload,
  type LeaveRoomPayload,
  type PassHostPayload,
  type PlayerSessionPayload,
  type PublicPlayer,
  type ReconnectPayload,
  type RoomCreatedPayload,
  type RoomSnapshot,
  type SendMessagePayload,
  type ServerErrorPayload,
  type ServerEvent,
  type WatchRoomPayload
} from "@group-crash/protocol";

const port = Number(process.env.PORT ?? 3001);
const controllerOrigin = process.env.CONTROLLER_ORIGIN ?? "http://127.0.0.1:5174";
const roomTtlMs = Number(process.env.ROOM_TTL_MS ?? 2 * 60 * 60 * 1000);
const reconnectGraceMs = Number(process.env.RECONNECT_GRACE_MS ?? 30_000);
const cleanupIntervalMs = Number(process.env.CLEANUP_INTERVAL_MS ?? 15_000);
const messageCooldownMs = Number(process.env.MESSAGE_COOLDOWN_MS ?? 1200);
const maxMessageBytes = Number(process.env.MAX_MESSAGE_BYTES ?? 4096);
const roomCodeAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

interface SocketPeer {
  id: string;
  buffer: Buffer;
  playerId: string | null;
  role: "display" | "player" | "unassigned";
  roomCode: string | null;
  socket: Duplex;
}

interface RoomRecord {
  disconnectTimersByPlayerId: Map<string, ReturnType<typeof setTimeout>>;
  displayPeers: Set<SocketPeer>;
  expiresAt: number;
  lastMessageAtByPlayerId: Map<string, number>;
  playerPeers: Map<string, Set<SocketPeer>>;
  reconnectTokensByPlayerId: Map<string, string>;
  snapshot: RoomSnapshot;
}

const roomsByCode = new Map<string, RoomRecord>();
const peers = new Set<SocketPeer>();

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

server.listen(port, () => {
  console.log(`Group Crash server listening on http://127.0.0.1:${port}`);
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
  }
}

function handleCreateRoom(peer: SocketPeer) {
  const roomCode = createRoomCode();
  const roomId = `room-${randomUUID()}`;
  const expiresAt = Date.now() + roomTtlMs;
  const record: RoomRecord = {
    disconnectTimersByPlayerId: new Map(),
    displayPeers: new Set(),
    expiresAt,
    lastMessageAtByPlayerId: new Map(),
    playerPeers: new Map(),
    reconnectTokensByPlayerId: new Map(),
    snapshot: createEmptyRoomSnapshot({ roomCode, roomId })
  };

  roomsByCode.set(roomCode, record);
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
    sendError(peer, result.notice === "Room is full." ? "ROOM_FULL" : "UNKNOWN", result.notice);
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
      result.notice === "Message is too long." ? "MESSAGE_TOO_LONG" : "UNKNOWN",
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

  broadcastSnapshot(record);
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
  broadcast(record, { type: "room.snapshot", payload: record.snapshot });
}

function sendSnapshot(peer: SocketPeer, record: RoomRecord) {
  send(peer, { type: "room.snapshot", payload: record.snapshot });
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

function normalizeRoomCode(value: string) {
  return value.trim().toUpperCase();
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
