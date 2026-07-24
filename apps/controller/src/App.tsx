import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  DoorOpen,
  Gamepad2,
  MessageCircle,
  Send,
  UserPlus,
  Vote
} from "lucide-react";
import {
  avatarOptions,
  quickMessageOptions,
  type ChessAvatar,
  type ClientEvent,
  type PlayerSessionPayload,
  type RoomSnapshot,
  type ServerEvent
} from "@group-crash/protocol";
import {
  Badge,
  Button,
  ChessAvatar as ChessAvatarBadge,
  EmptyGameCard,
  HostVotePanel,
  LogoMark,
  PhoneShell,
  StatusPill
} from "@group-crash/ui";

type Screen = "name" | "avatar" | "role" | "player" | "host" | "vote";
type ConnectionStatus = "connecting" | "connected" | "disconnected";

const storageKey = "group-crash-player-session";

function getInitialRoomCode() {
  if (typeof window === "undefined") {
    return "";
  }

  return new URLSearchParams(window.location.search).get("room")?.trim().toUpperCase() ?? "";
}

function getSocketUrl() {
  const configuredUrl = import.meta.env.VITE_GROUP_CRASH_WS_URL as string | undefined;

  if (configuredUrl) {
    return configuredUrl;
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.hostname}:3001`;
}

function readStoredSession() {
  const rawSession = window.localStorage.getItem(storageKey);

  if (!rawSession) {
    return null;
  }

  try {
    return JSON.parse(rawSession) as PlayerSessionPayload;
  } catch {
    return null;
  }
}

export function App() {
  const [screen, setScreen] = useState<Screen>("name");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [room, setRoom] = useState<RoomSnapshot | null>(null);
  const [playerSession, setPlayerSession] = useState<PlayerSessionPayload | null>(null);
  const [hasJoined, setHasJoined] = useState(false);
  const [roomCode, setRoomCode] = useState(getInitialRoomCode);
  const [playerName, setPlayerName] = useState("Maya");
  const [avatar, setAvatar] = useState<ChessAvatar>("queen");
  const [wantsHost, setWantsHost] = useState(false);
  const [sentMessage, setSentMessage] = useState("Ready!");
  const [feedback, setFeedback] = useState("Connect to a TV room to join.");

  useEffect(() => {
    const webSocket = new WebSocket(getSocketUrl());
    const initialRoomCode = getInitialRoomCode();
    const storedSession = readStoredSession();

    setSocket(webSocket);

    webSocket.addEventListener("open", () => {
      setConnectionStatus("connected");

      if (
        storedSession &&
        (!initialRoomCode || storedSession.roomCode === initialRoomCode)
      ) {
        setHasJoined(true);
        setPlayerSession(storedSession);
        setRoomCode(storedSession.roomCode);
        setFeedback("Reconnecting to your room...");
        sendWithSocket(webSocket, {
          type: "room.reconnect",
          payload: storedSession
        });
      } else {
        setFeedback("Connected. Enter your player info.");
      }
    });

    webSocket.addEventListener("message", (message) => {
      const event = JSON.parse(String(message.data)) as ServerEvent;

      if (event.type === "player.session") {
        window.localStorage.setItem(storageKey, JSON.stringify(event.payload));
        setPlayerSession(event.payload);
        setRoomCode(event.payload.roomCode);
        setHasJoined(true);
        setFeedback("Joined the room.");
        return;
      }

      if (event.type === "room.snapshot") {
        setRoom(event.payload);
        return;
      }

      if (event.type === "error") {
        setFeedback(event.payload.message);
      }
    });

    webSocket.addEventListener("close", () => {
      setConnectionStatus("disconnected");
      setFeedback("Connection lost. Reopen the room when the server is back.");
    });
    webSocket.addEventListener("error", () => {
      setConnectionStatus("disconnected");
      setFeedback("Could not reach the lobby server.");
    });

    return () => webSocket.close();
  }, []);

  const currentHost = room?.players.find((player) => player.isHost);

  const currentPlayer = useMemo(
    () =>
      room?.players.find((player) => player.id === playerSession?.playerId) ?? {
        id: playerSession?.playerId ?? "pending-player",
        name: playerName.trim() || "Maya",
        avatar,
        connectionStatus: connectionStatus === "connected" ? "connected" as const : "disconnected" as const,
        isHost: false,
        wantsHost,
        joinedAt: Date.now()
      },
    [avatar, connectionStatus, playerName, playerSession, room?.players, wantsHost]
  );

  useEffect(() => {
    if (!hasJoined || !playerSession || !room) {
      return;
    }

    const player = room.players.find((candidate) => candidate.id === playerSession.playerId);

    if (!player) {
      return;
    }

    if (player.isHost) {
      setScreen("host");
      return;
    }

    if (room.activeHostVote) {
      setScreen("vote");
      return;
    }

    setScreen("player");
  }, [hasJoined, playerSession, room]);

  function sendEvent(event: ClientEvent) {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setFeedback("Controller is not connected to the server yet.");
      return false;
    }

    socket.send(JSON.stringify(event));
    return true;
  }

  function finishJoin() {
    const normalizedRoomCode = roomCode.trim().toUpperCase();

    if (!normalizedRoomCode) {
      setFeedback("Enter the room code shown on the TV.");
      setScreen("name");
      return;
    }

    const sent = sendEvent({
      type: "room.join",
      payload: {
        avatar,
        name: playerName,
        roomCode: normalizedRoomCode,
        wantsHost
      }
    });

    if (sent) {
      setRoomCode(normalizedRoomCode);
      setFeedback("Joining room...");
    }
  }

  function sendSelectedMessage() {
    if (!playerSession) {
      setFeedback("Join the room before sending a shout.");
      return;
    }

    sendEvent({
      type: "message.send",
      payload: {
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode,
        text: sentMessage
      }
    });
  }

  function requestHostFromPhone() {
    if (!playerSession) {
      setFeedback("Join the room before requesting host.");
      return;
    }

    sendEvent({
      type: "host.request",
      payload: {
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode
      }
    });
  }

  function castPhoneVote(vote: "yes" | "no") {
    if (!playerSession || !room?.activeHostVote) {
      setFeedback("No host vote is active.");
      return;
    }

    sendEvent({
      type: "host.vote.cast",
      payload: {
        playerId: playerSession.playerId,
        roomCode: playerSession.roomCode,
        vote,
        voteId: room.activeHostVote.id
      }
    });
  }

  function passHostFromPhone() {
    if (!playerSession) {
      setFeedback("Join the room before passing host.");
      return;
    }

    sendEvent({
      type: "host.pass",
      payload: {
        hostPlayerId: playerSession.playerId,
        roomCode: playerSession.roomCode
      }
    });
  }

  return (
    <main className="controller-stage">
      <PhoneShell>
        {screen === "name" ? (
          <section className="phone-card join-card">
            <LogoMark size="phone" />
            <Badge tone="yellow">
              {roomCode ? `Room ${roomCode}` : "Room code"}
            </Badge>
            <div className="phone-copy">
              <h1>Step into the crash.</h1>
              <p>Pick the name the TV will show when you join the lobby.</p>
            </div>
            <label className="field-label" htmlFor="room-code">
              Room code
            </label>
            <input
              id="room-code"
              className="text-input"
              maxLength={4}
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            />
            <label className="field-label" htmlFor="player-name">
              Display name
            </label>
            <input
              id="player-name"
              className="text-input"
              maxLength={16}
              value={playerName}
              onChange={(event) => setPlayerName(event.target.value)}
            />
            <p className="phone-feedback" aria-live="polite">
              {feedback}
            </p>
            <Button
              disabled={connectionStatus !== "connected"}
              variant="primary"
              icon={<UserPlus aria-hidden="true" />}
              onClick={() => setScreen("avatar")}
            >
              Continue
            </Button>
          </section>
        ) : null}

        {screen === "avatar" ? (
          <section className="phone-card">
            <div className="phone-header-row">
              <Badge tone="cream">Choose avatar</Badge>
              <StatusPill
                status={connectionStatus === "connected" ? "connected" : "disconnected"}
              >
                {connectionStatus === "connected" ? roomCode || "Live" : "Offline"}
              </StatusPill>
            </div>
            <div className="phone-copy">
              <h1>Pick your piece.</h1>
              <p>Chess-piece avatars keep the lobby bold and readable.</p>
            </div>
            <div className="avatar-grid" aria-label="Chess avatars">
              {avatarOptions.map((option) => (
                <button
                  className="avatar-choice"
                  data-selected={avatar === option}
                  key={option}
                  onClick={() => setAvatar(option)}
                >
                  <ChessAvatarBadge
                    avatar={option}
                    selected={avatar === option}
                    size="md"
                  />
                  <span>{option}</span>
                </button>
              ))}
            </div>
            <div className="phone-actions split">
              <Button variant="secondary" onClick={() => setScreen("name")}>
                Back
              </Button>
              <Button variant="primary" onClick={() => setScreen("role")}>
                Continue
              </Button>
            </div>
          </section>
        ) : null}

        {screen === "role" ? (
          <section className="phone-card">
            <div className="phone-header-row">
              <Badge tone="cream">Join options</Badge>
              <ChessAvatarBadge avatar={avatar} selected size="sm" />
            </div>
            <div className="phone-copy">
              <h1>How are you joining?</h1>
              <p>If more players want host, the room can vote to change it.</p>
            </div>
            <div className="role-stack">
              <button
                className="role-option"
                data-selected={!wantsHost}
                onClick={() => setWantsHost(false)}
              >
                <span>Join as player</span>
                <small>Send messages, vote, and play when games arrive.</small>
              </button>
              <button
                className="role-option"
                data-selected={wantsHost}
                onClick={() => setWantsHost(true)}
              >
                <span>Request host</span>
                <small>Ask for control of game selection and lobby flow.</small>
              </button>
            </div>
            <div className="phone-actions split">
              <Button variant="secondary" onClick={() => setScreen("avatar")}>
                Back
              </Button>
              <Button
                variant="primary"
                icon={<DoorOpen aria-hidden="true" />}
                onClick={finishJoin}
              >
                Join room
              </Button>
            </div>
          </section>
        ) : null}

        {screen === "player" ? (
          <LobbyController
            player={currentPlayer}
            hostName={currentHost?.name ?? "Waiting"}
            feedback={feedback}
            roomCode={roomCode}
            sentMessage={sentMessage}
            setSentMessage={setSentMessage}
            onRequestHost={requestHostFromPhone}
            onSendMessage={sendSelectedMessage}
            voteActive={Boolean(room?.activeHostVote)}
          />
        ) : null}

        {screen === "host" ? (
          <HostController
            player={currentPlayer}
            feedback={feedback}
            onPassHost={passHostFromPhone}
          />
        ) : null}

        {screen === "vote" ? (
          <VoteController
            player={currentPlayer}
            feedback={feedback}
            room={room}
            onVoteYes={() => castPhoneVote("yes")}
            onVoteNo={() => castPhoneVote("no")}
          />
        ) : null}
      </PhoneShell>
    </main>
  );
}

function sendWithSocket(socket: WebSocket, event: ClientEvent) {
  socket.send(JSON.stringify(event));
}

interface LobbyControllerProps {
  player: {
    name: string;
    avatar: ChessAvatar;
  };
  feedback: string;
  hostName: string;
  roomCode: string;
  sentMessage: string;
  setSentMessage: (message: string) => void;
  onRequestHost: () => void;
  onSendMessage: () => void;
  voteActive: boolean;
}

function LobbyController({
  feedback,
  player,
  hostName,
  roomCode,
  sentMessage,
  setSentMessage,
  onRequestHost,
  onSendMessage,
  voteActive
}: LobbyControllerProps) {
  return (
    <section className="phone-card lobby-card">
      <div className="player-strip">
        <ChessAvatarBadge avatar={player.avatar} selected size="sm" />
        <div>
          <strong>{player.name}</strong>
          <span>Room {roomCode}</span>
        </div>
        <StatusPill status="connected">Live</StatusPill>
      </div>

      <div className="host-summary">
        <Badge tone="yellow" icon={<Crown aria-hidden="true" />}>
          {hostName} is host
        </Badge>
        <p>Only the host can choose games. The room can vote to switch.</p>
      </div>

      <div className="quick-message-card">
        <div className="section-label">
          <MessageCircle aria-hidden="true" />
          <span>Quick messages</span>
        </div>
        <div className="quick-grid">
          {quickMessageOptions.slice(0, 4).map((message) => (
            <button
              className="quick-message-button"
              key={message}
              data-selected={sentMessage === message}
              onClick={() => setSentMessage(message)}
            >
              {message}
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          icon={<Send aria-hidden="true" />}
          onClick={onSendMessage}
        >
          Send to TV
        </Button>
      </div>

      <p className="phone-feedback" aria-live="polite">
        {feedback}
      </p>

      <div className="phone-actions">
        <Button
          disabled={voteActive}
          variant="primary"
          icon={<Vote aria-hidden="true" />}
          onClick={onRequestHost}
        >
          Request host
        </Button>
      </div>
    </section>
  );
}

interface HostControllerProps {
  player: {
    name: string;
    avatar: ChessAvatar;
  };
  feedback: string;
  onPassHost: () => void;
}

function HostController({ feedback, player, onPassHost }: HostControllerProps) {
  return (
    <section className="phone-card lobby-card">
      <div className="player-strip">
        <ChessAvatarBadge avatar={player.avatar} selected size="sm" />
        <div>
          <strong>{player.name}</strong>
          <span>Current host</span>
        </div>
        <Badge tone="yellow" icon={<Crown aria-hidden="true" />}>
          Host
        </Badge>
      </div>

      <EmptyGameCard
        title="No games added yet"
        subtitle="This shelf will hold playable game modules after the lobby is live."
        icon={<Gamepad2 aria-hidden="true" />}
      />

      <div className="host-controls">
        <Button variant="primary" disabled icon={<Gamepad2 aria-hidden="true" />}>
          Start game
        </Button>
        <Button variant="secondary" onClick={onPassHost}>
          Pass host
        </Button>
      </div>
      <p className="phone-feedback" aria-live="polite">
        {feedback}
      </p>
    </section>
  );
}

interface VoteControllerProps {
  player: {
    name: string;
    avatar: ChessAvatar;
  };
  feedback: string;
  room: RoomSnapshot | null;
  onVoteYes: () => void;
  onVoteNo: () => void;
}

function VoteController({ feedback, player, room, onVoteYes, onVoteNo }: VoteControllerProps) {
  const activeVote = room?.activeHostVote;

  return (
    <section className="phone-card lobby-card vote-card">
      <div className="player-strip">
        <ChessAvatarBadge avatar={player.avatar} selected size="sm" />
        <div>
          <strong>{player.name}</strong>
          <span>Host vote active</span>
        </div>
      </div>

      {activeVote ? (
        <HostVotePanel vote={activeVote} players={room?.players ?? []} size="phone" />
      ) : (
        <div className="host-summary">
          <Badge tone="yellow">No vote active</Badge>
          <p>Request host to open a room vote.</p>
        </div>
      )}

      <p className="phone-feedback" aria-live="polite">
        {feedback}
      </p>

      <div className="phone-actions split">
        <Button disabled={!activeVote} variant="secondary" onClick={onVoteNo}>
          Vote no
        </Button>
        <Button disabled={!activeVote} variant="primary" onClick={onVoteYes}>
          Vote yes
        </Button>
      </div>
    </section>
  );
}
