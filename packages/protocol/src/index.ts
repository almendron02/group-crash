export type ChessAvatar =
  | "pawn"
  | "knight"
  | "bishop"
  | "rook"
  | "queen"
  | "king";

export type PlayerConnectionStatus = "connected" | "disconnected";

export interface PublicPlayer {
  id: string;
  name: string;
  avatar: ChessAvatar;
  connectionStatus: PlayerConnectionStatus;
  isHost: boolean;
  wantsHost: boolean;
  joinedAt: number;
}

export interface LobbyMessage {
  id: string;
  playerId: string;
  playerName: string;
  avatar: ChessAvatar;
  text: string;
  createdAt: number;
}

export interface HostVote {
  id: string;
  currentHostPlayerId: string | null;
  proposedHostPlayerId: string;
  eligiblePlayerIds: string[];
  yesPlayerIds: string[];
  noPlayerIds: string[];
  requiredYesVotes: number;
  createdAt: number;
  expiresAt: number;
}

export interface RoomSnapshot {
  roomId: string;
  roomCode: string;
  status: "lobby" | "playing" | "closed";
  hostPlayerId: string | null;
  players: PublicPlayer[];
  messages: LobbyMessage[];
  activeHostVote: HostVote | null;
  playerCount: number;
  maxPlayers: number;
  gamesAvailable: boolean;
}

export interface CreateRoomPayload {
  displayName?: string;
}

export interface WatchRoomPayload {
  roomCode: string;
}

export interface JoinRoomPayload {
  roomCode: string;
  name: string;
  avatar: ChessAvatar;
  wantsHost: boolean;
}

export interface ReconnectPayload {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface LeaveRoomPayload {
  roomCode: string;
  playerId: string;
}

export interface SendMessagePayload {
  roomCode: string;
  playerId: string;
  text: string;
}

export interface HostRequestPayload {
  roomCode: string;
  playerId: string;
}

export interface CastHostVotePayload {
  roomCode: string;
  playerId: string;
  voteId: string;
  vote: "yes" | "no";
}

export interface PassHostPayload {
  roomCode: string;
  hostPlayerId: string;
  targetPlayerId?: string;
}

export type ClientEvent =
  | { type: "room.create"; payload: CreateRoomPayload }
  | { type: "room.watch"; payload: WatchRoomPayload }
  | { type: "room.join"; payload: JoinRoomPayload }
  | { type: "room.reconnect"; payload: ReconnectPayload }
  | { type: "room.leave"; payload: LeaveRoomPayload }
  | { type: "message.send"; payload: SendMessagePayload }
  | { type: "host.request"; payload: HostRequestPayload }
  | { type: "host.vote.cast"; payload: CastHostVotePayload }
  | { type: "host.pass"; payload: PassHostPayload };

export interface RoomCreatedPayload {
  roomId: string;
  roomCode: string;
  joinUrl: string;
  expiresAt: number;
}

export interface PlayerStatusPayload {
  roomCode: string;
  playerId: string;
}

export interface PlayerSessionPayload {
  roomCode: string;
  playerId: string;
  reconnectToken: string;
}

export interface HostChangedPayload {
  roomCode: string;
  previousHostPlayerId: string | null;
  nextHostPlayerId: string;
  reason: "initial" | "vote" | "pass" | "disconnect";
}

export interface HostVoteCompletedPayload {
  roomCode: string;
  voteId: string;
  passed: boolean;
  previousHostPlayerId: string | null;
  proposedHostPlayerId: string;
  yesVotes: number;
  noVotes: number;
  requiredYesVotes: number;
}

export interface RoomClosedPayload {
  roomCode: string;
  reason: "tv_disconnected" | "expired" | "server_shutdown";
}

export interface ServerErrorPayload {
  code:
    | "ROOM_NOT_FOUND"
    | "ROOM_FULL"
    | "INVALID_NAME"
    | "INVALID_AVATAR"
    | "MESSAGE_TOO_LONG"
    | "RATE_LIMITED"
    | "NOT_HOST"
    | "VOTE_NOT_FOUND"
    | "NOT_ELIGIBLE"
    | "UNKNOWN";
  message: string;
}

export type ServerEvent =
  | { type: "room.created"; payload: RoomCreatedPayload }
  | { type: "room.snapshot"; payload: RoomSnapshot }
  | { type: "player.session"; payload: PlayerSessionPayload }
  | { type: "player.joined"; payload: PublicPlayer }
  | { type: "player.disconnected"; payload: PlayerStatusPayload }
  | { type: "player.reconnected"; payload: PlayerStatusPayload }
  | { type: "message.received"; payload: LobbyMessage }
  | { type: "host.changed"; payload: HostChangedPayload }
  | { type: "host.vote.started"; payload: HostVote }
  | { type: "host.vote.updated"; payload: HostVote }
  | { type: "host.vote.completed"; payload: HostVoteCompletedPayload }
  | { type: "room.closed"; payload: RoomClosedPayload }
  | { type: "error"; payload: ServerErrorPayload };

export const avatarOptions: ChessAvatar[] = [
  "pawn",
  "knight",
  "bishop",
  "rook",
  "queen",
  "king"
];

export const mockRoomSnapshot: RoomSnapshot = {
  roomId: "room-preview",
  roomCode: "K7P4",
  status: "lobby",
  hostPlayerId: "alex",
  players: [
    {
      id: "alex",
      name: "Alex",
      avatar: "king",
      connectionStatus: "connected",
      isHost: true,
      wantsHost: false,
      joinedAt: 1
    },
    {
      id: "maya",
      name: "Maya",
      avatar: "queen",
      connectionStatus: "connected",
      isHost: false,
      wantsHost: true,
      joinedAt: 2
    },
    {
      id: "zoe",
      name: "Zoe",
      avatar: "knight",
      connectionStatus: "connected",
      isHost: false,
      wantsHost: true,
      joinedAt: 3
    },
    {
      id: "jay",
      name: "Jay",
      avatar: "bishop",
      connectionStatus: "connected",
      isHost: false,
      wantsHost: false,
      joinedAt: 4
    },
    {
      id: "sam",
      name: "Sam",
      avatar: "rook",
      connectionStatus: "connected",
      isHost: false,
      wantsHost: false,
      joinedAt: 5
    },
    {
      id: "leo",
      name: "Leo",
      avatar: "pawn",
      connectionStatus: "disconnected",
      isHost: false,
      wantsHost: false,
      joinedAt: 6
    }
  ],
  messages: [
    {
      id: "message-1",
      playerId: "maya",
      playerName: "Maya",
      avatar: "queen",
      text: "Ready!",
      createdAt: 1
    },
    {
      id: "message-2",
      playerId: "zoe",
      playerName: "Zoe",
      avatar: "knight",
      text: "Let's go!",
      createdAt: 2
    },
    {
      id: "message-3",
      playerId: "sam",
      playerName: "Sam",
      avatar: "rook",
      text: "Start soon!",
      createdAt: 3
    },
    {
      id: "message-4",
      playerId: "jay",
      playerName: "Jay",
      avatar: "bishop",
      text: "Can't wait!",
      createdAt: 4
    }
  ],
  activeHostVote: null,
  playerCount: 6,
  maxPlayers: 8,
  gamesAvailable: false
};

export const mockVoteRoomSnapshot: RoomSnapshot = {
  ...mockRoomSnapshot,
  activeHostVote: {
    id: "vote-maya-host",
    currentHostPlayerId: "alex",
    proposedHostPlayerId: "maya",
    eligiblePlayerIds: ["alex", "maya", "zoe", "jay", "sam", "leo"],
    yesPlayerIds: ["maya", "zoe", "jay"],
    noPlayerIds: ["alex"],
    requiredYesVotes: 4,
    createdAt: 1,
    expiresAt: 2
  }
};

export type LobbyActionStatus = "success" | "blocked";

export interface LobbyActionResult {
  notice: string;
  room: RoomSnapshot;
  status: LobbyActionStatus;
}

export interface JoinLocalPlayerInput {
  avatar: ChessAvatar;
  id: string;
  name: string;
  wantsHost?: boolean;
}

export const quickMessageOptions = [
  "Ready!",
  "Let's go!",
  "I call host!",
  "Start soon!",
  "Can't wait!",
  "Vote time!"
] as const;

const previewBenchPlayers: JoinLocalPlayerInput[] = [
  { id: "nia", name: "Nia", avatar: "bishop" },
  { id: "omar", name: "Omar", avatar: "knight" },
  { id: "ivy", name: "Ivy", avatar: "rook", wantsHost: true },
  { id: "ren", name: "Ren", avatar: "pawn" }
];

export function createEmptyRoomSnapshot({
  maxPlayers = 8,
  roomCode,
  roomId
}: {
  maxPlayers?: number;
  roomCode: string;
  roomId: string;
}): RoomSnapshot {
  return {
    roomId,
    roomCode,
    status: "lobby",
    hostPlayerId: null,
    players: [],
    messages: [],
    activeHostVote: null,
    playerCount: 0,
    maxPlayers,
    gamesAvailable: false
  };
}

export function createLocalLobbyRoom(state: "lobby" | "vote" = "lobby"): RoomSnapshot {
  return normalizeRoom(state === "vote" ? mockVoteRoomSnapshot : mockRoomSnapshot);
}

export function getNextPreviewPlayer(room: RoomSnapshot): JoinLocalPlayerInput | null {
  const existingIds = new Set(room.players.map((player) => player.id));
  return previewBenchPlayers.find((player) => !existingIds.has(player.id)) ?? null;
}

export function calculateRequiredYesVotes(eligiblePlayerCount: number): number {
  return Math.floor(eligiblePlayerCount / 2) + 1;
}

export function joinLocalPlayer(
  room: RoomSnapshot,
  input: JoinLocalPlayerInput
): LobbyActionResult {
  const next = cloneRoom(room);

  if (next.players.length >= next.maxPlayers) {
    return blocked(next, "Room is full.");
  }

  if (next.players.some((player) => player.id === input.id)) {
    return blocked(next, `${input.name} is already in the room.`);
  }

  const joinedAt = Math.max(0, ...next.players.map((player) => player.joinedAt)) + 1;
  next.players.push({
    id: input.id,
    name: input.name.trim().slice(0, 16),
    avatar: input.avatar,
    connectionStatus: "connected",
    isHost: false,
    wantsHost: Boolean(input.wantsHost),
    joinedAt
  });

  const normalized = normalizeRoom(next);

  if (normalized.hostPlayerId === null) {
    return setHost(normalized, input.id, `${input.name} joined and became host.`);
  }

  if (input.wantsHost && normalized.activeHostVote) {
    return success(
      normalized,
      `${input.name} joined. A host vote is already active.`
    );
  }

  if (input.wantsHost) {
    return requestLocalHost(normalized, input.id);
  }

  return success(normalized, `${input.name} joined the room.`);
}

export function removeLocalPlayer(room: RoomSnapshot, playerId: string): LobbyActionResult {
  const next = cloneRoom(room);
  const player = next.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    return blocked(next, "Player is not in the room.");
  }

  next.players = next.players.filter((candidate) => candidate.id !== playerId);

  if (next.activeHostVote?.proposedHostPlayerId === playerId) {
    next.activeHostVote = null;
  }

  if (next.hostPlayerId === playerId) {
    const replacement = getLongestConnectedPlayer(next);
    if (!replacement) {
      return success(normalizeRoom({ ...next, hostPlayerId: null }), `${player.name} left. No host remains.`);
    }

    return setHost(next, replacement.id, `${player.name} left. ${replacement.name} became host.`);
  }

  return success(normalizeRoom(next), `${player.name} left the room.`);
}

export function updateLocalPlayerProfile(
  room: RoomSnapshot,
  playerId: string,
  profile: { avatar: ChessAvatar; name: string }
): LobbyActionResult {
  const next = cloneRoom(room);
  const player = next.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    return blocked(next, "Player is not in the room.");
  }

  player.name = profile.name.trim().slice(0, 16) || player.name;
  player.avatar = profile.avatar;

  next.messages = next.messages.map((message) =>
    message.playerId === playerId
      ? { ...message, avatar: player.avatar, playerName: player.name }
      : message
  );

  return success(normalizeRoom(next), `${player.name} updated their profile.`);
}

export function sendLocalMessage(
  room: RoomSnapshot,
  playerId: string,
  text: string
): LobbyActionResult {
  const next = cloneRoom(room);
  const player = next.players.find((candidate) => candidate.id === playerId);

  if (!player || player.connectionStatus !== "connected") {
    return blocked(next, "Only connected players can send shouts.");
  }

  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return blocked(next, "Message cannot be empty.");
  }

  if (trimmed.length > 40) {
    return blocked(next, "Message is too long.");
  }

  const createdAt = Math.max(0, ...next.messages.map((message) => message.createdAt)) + 1;
  next.messages = [
    ...next.messages,
    {
      id: `message-${createdAt}`,
      playerId: player.id,
      playerName: player.name,
      avatar: player.avatar,
      text: trimmed,
      createdAt
    }
  ].slice(-8);

  return success(normalizeRoom(next), `${player.name} sent "${trimmed}".`);
}

export function requestLocalHost(room: RoomSnapshot, playerId: string): LobbyActionResult {
  const next = cloneRoom(room);
  const player = next.players.find((candidate) => candidate.id === playerId);

  if (!player || player.connectionStatus !== "connected") {
    return blocked(next, "Only connected players can request host.");
  }

  if (next.hostPlayerId === playerId) {
    return blocked(next, `${player.name} is already host.`);
  }

  if (next.activeHostVote) {
    return blocked(next, "A host vote is already active.");
  }

  if (!next.hostPlayerId) {
    return setHost(next, playerId, `${player.name} became host.`);
  }

  player.wantsHost = true;
  next.activeHostVote = createHostVote(next, playerId);

  return success(normalizeRoom(next), `${player.name} started a host vote.`);
}

export function castLocalHostVote(
  room: RoomSnapshot,
  playerId: string,
  vote: "yes" | "no"
): LobbyActionResult {
  const next = cloneRoom(room);
  const activeVote = next.activeHostVote;
  const player = next.players.find((candidate) => candidate.id === playerId);

  if (!activeVote) {
    return blocked(next, "No host vote is active.");
  }

  if (!player || player.connectionStatus !== "connected") {
    return blocked(next, "Only connected players can vote.");
  }

  if (!activeVote.eligiblePlayerIds.includes(playerId)) {
    return blocked(next, `${player.name} is not eligible for this vote.`);
  }

  activeVote.yesPlayerIds = activeVote.yesPlayerIds.filter((id) => id !== playerId);
  activeVote.noPlayerIds = activeVote.noPlayerIds.filter((id) => id !== playerId);

  if (vote === "yes") {
    activeVote.yesPlayerIds.push(playerId);
  } else {
    activeVote.noPlayerIds.push(playerId);
  }

  if (activeVote.yesPlayerIds.length >= activeVote.requiredYesVotes) {
    const proposedHost = next.players.find(
      (candidate) => candidate.id === activeVote.proposedHostPlayerId
    );

    return setHost(
      next,
      activeVote.proposedHostPlayerId,
      `${proposedHost?.name ?? "New host"} won the vote.`
    );
  }

  const remainingVotes =
    activeVote.eligiblePlayerIds.length -
    new Set([...activeVote.yesPlayerIds, ...activeVote.noPlayerIds]).size;

  if (activeVote.yesPlayerIds.length + remainingVotes < activeVote.requiredYesVotes) {
    const proposedPlayer = next.players.find(
      (candidate) => candidate.id === activeVote.proposedHostPlayerId
    );

    if (proposedPlayer) {
      proposedPlayer.wantsHost = false;
    }

    next.activeHostVote = null;

    return success(normalizeRoom(next), "Host vote failed.");
  }

  return success(normalizeRoom(next), `${player.name} voted ${vote}.`);
}

export function castNextLocalHostVote(
  room: RoomSnapshot,
  vote: "yes" | "no"
): LobbyActionResult {
  const activeVote = room.activeHostVote;

  if (!activeVote) {
    return blocked(room, "No host vote is active.");
  }

  const votedIds = new Set([...activeVote.yesPlayerIds, ...activeVote.noPlayerIds]);
  const nextVoterId = activeVote.eligiblePlayerIds.find((playerId) => !votedIds.has(playerId));

  if (!nextVoterId) {
    return blocked(room, "Everyone has already voted.");
  }

  return castLocalHostVote(room, nextVoterId, vote);
}

export function passLocalHost(room: RoomSnapshot, targetPlayerId?: string): LobbyActionResult {
  const next = cloneRoom(room);
  const currentHost = next.players.find((player) => player.id === next.hostPlayerId);

  if (!currentHost || currentHost.connectionStatus !== "connected") {
    return blocked(next, "No connected host can pass control.");
  }

  const target =
    (targetPlayerId
      ? next.players.find(
          (player) => player.id === targetPlayerId && player.connectionStatus === "connected"
        )
      : undefined) ??
    next.players.find(
      (player) =>
        player.id !== currentHost.id &&
        player.connectionStatus === "connected" &&
        player.wantsHost
    ) ??
    getLongestConnectedPlayer(next, currentHost.id);

  if (!target) {
    return blocked(next, "No eligible player can receive host.");
  }

  return setHost(next, target.id, `${currentHost.name} passed host to ${target.name}.`);
}

export function disconnectLocalPlayer(room: RoomSnapshot, playerId: string): LobbyActionResult {
  const next = cloneRoom(room);
  const player = next.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    return blocked(next, "Player is not in the room.");
  }

  if (player.connectionStatus === "disconnected") {
    return blocked(next, `${player.name} is already disconnected.`);
  }

  player.connectionStatus = "disconnected";

  if (next.hostPlayerId === playerId) {
    const replacement = getLongestConnectedPlayer(next, playerId);

    if (replacement) {
      return setHost(
        next,
        replacement.id,
        `${player.name} disconnected. ${replacement.name} became host.`
      );
    }
  }

  return success(normalizeRoom(next), `${player.name} disconnected.`);
}

export function reconnectLocalPlayer(room: RoomSnapshot, playerId: string): LobbyActionResult {
  const next = cloneRoom(room);
  const player = next.players.find((candidate) => candidate.id === playerId);

  if (!player) {
    return blocked(next, "Player is not in the room.");
  }

  if (player.connectionStatus === "connected") {
    return blocked(next, `${player.name} is already connected.`);
  }

  player.connectionStatus = "connected";

  return success(normalizeRoom(next), `${player.name} reconnected.`);
}

function cloneRoom(room: RoomSnapshot): RoomSnapshot {
  return {
    ...room,
    players: room.players.map((player) => ({ ...player })),
    messages: room.messages.map((message) => ({ ...message })),
    activeHostVote: room.activeHostVote
      ? {
          ...room.activeHostVote,
          eligiblePlayerIds: [...room.activeHostVote.eligiblePlayerIds],
          yesPlayerIds: [...room.activeHostVote.yesPlayerIds],
          noPlayerIds: [...room.activeHostVote.noPlayerIds]
        }
      : null
  };
}

function normalizeRoom(room: RoomSnapshot): RoomSnapshot {
  const connectedEligibleIds = new Set(
    room.players
      .filter((player) => player.connectionStatus === "connected")
      .map((player) => player.id)
  );
  const activeVoteEligibleIds =
    room.activeHostVote?.eligiblePlayerIds.filter((id) => connectedEligibleIds.has(id)) ??
    [];

  const activeHostVote = room.activeHostVote
    ? {
        ...room.activeHostVote,
        eligiblePlayerIds: activeVoteEligibleIds,
        yesPlayerIds: room.activeHostVote.yesPlayerIds.filter((id) =>
          activeVoteEligibleIds.includes(id)
        ),
        noPlayerIds: room.activeHostVote.noPlayerIds.filter((id) =>
          activeVoteEligibleIds.includes(id)
        ),
        requiredYesVotes: calculateRequiredYesVotes(activeVoteEligibleIds.length)
      }
    : null;

  const hostPlayerId = room.players.some((player) => player.id === room.hostPlayerId)
    ? room.hostPlayerId
    : null;

  return {
    ...room,
    hostPlayerId,
    playerCount: room.players.length,
    players: room.players.map((player) => ({
      ...player,
      isHost: player.id === hostPlayerId,
      wantsHost: player.id === hostPlayerId ? false : player.wantsHost
    })),
    activeHostVote
  };
}

function createHostVote(room: RoomSnapshot, proposedHostPlayerId: string): HostVote {
  const eligiblePlayerIds = room.players
    .filter((player) => player.connectionStatus === "connected")
    .map((player) => player.id);
  const createdAt = Math.max(0, room.activeHostVote?.createdAt ?? 0) + 1;

  return {
    id: `vote-${proposedHostPlayerId}-${createdAt}`,
    currentHostPlayerId: room.hostPlayerId,
    proposedHostPlayerId,
    eligiblePlayerIds,
    yesPlayerIds: [proposedHostPlayerId],
    noPlayerIds: [],
    requiredYesVotes: calculateRequiredYesVotes(eligiblePlayerIds.length),
    createdAt,
    expiresAt: createdAt + 30
  };
}

function setHost(room: RoomSnapshot, nextHostPlayerId: string, notice: string): LobbyActionResult {
  const next = cloneRoom(room);
  const nextHost = next.players.find((player) => player.id === nextHostPlayerId);

  if (!nextHost || nextHost.connectionStatus !== "connected") {
    return blocked(next, "Host must be a connected player.");
  }

  next.hostPlayerId = nextHostPlayerId;
  next.activeHostVote = null;
  next.players = next.players.map((player) => ({
    ...player,
    isHost: player.id === nextHostPlayerId,
    wantsHost: player.id === nextHostPlayerId ? false : player.wantsHost
  }));

  return success(normalizeRoom(next), notice);
}

function getLongestConnectedPlayer(
  room: RoomSnapshot,
  excludedPlayerId?: string
): PublicPlayer | null {
  return (
    [...room.players]
      .filter(
        (player) =>
          player.id !== excludedPlayerId && player.connectionStatus === "connected"
      )
      .sort((left, right) => left.joinedAt - right.joinedAt)[0] ?? null
  );
}

function success(room: RoomSnapshot, notice: string): LobbyActionResult {
  return { notice, room: normalizeRoom(room), status: "success" };
}

function blocked(room: RoomSnapshot, notice: string): LobbyActionResult {
  return { notice, room: normalizeRoom(room), status: "blocked" };
}
