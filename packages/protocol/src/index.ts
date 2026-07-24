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

