import { useMemo, useState } from "react";
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
  castLocalHostVote,
  castNextLocalHostVote,
  createLocalLobbyRoom,
  passLocalHost,
  quickMessageOptions,
  requestLocalHost,
  sendLocalMessage,
  updateLocalPlayerProfile,
  type ChessAvatar
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

const currentPlayerId = "maya";

export function App() {
  const [screen, setScreen] = useState<Screen>("name");
  const [room, setRoom] = useState(() => createLocalLobbyRoom());
  const [playerName, setPlayerName] = useState("Maya");
  const [avatar, setAvatar] = useState<ChessAvatar>("queen");
  const [wantsHost, setWantsHost] = useState(false);
  const [sentMessage, setSentMessage] = useState("Ready!");
  const [feedback, setFeedback] = useState("Local lobby controls ready.");

  const currentHost = room.players.find((player) => player.isHost);

  const currentPlayer = useMemo(
    () =>
      room.players.find((player) => player.id === currentPlayerId) ?? {
        id: currentPlayerId,
        name: playerName.trim() || "Maya",
        avatar,
        connectionStatus: "connected" as const,
        isHost: screen === "host",
        wantsHost,
        joinedAt: Date.now()
      },
    [avatar, playerName, room.players, screen, wantsHost]
  );

  function applyLocalAction(result: {
    notice: string;
    room: typeof room;
    status: "success" | "blocked";
  }) {
    setRoom(result.room);
    setFeedback(result.notice);
    return result.room;
  }

  function finishJoin() {
    let nextRoom = applyLocalAction(
      updateLocalPlayerProfile(room, currentPlayerId, {
        avatar,
        name: playerName
      })
    );

    if (wantsHost) {
      nextRoom = applyLocalAction(requestLocalHost(nextRoom, currentPlayerId));
    }

    const nextPlayer = nextRoom.players.find((player) => player.id === currentPlayerId);

    if (nextPlayer?.isHost) {
      setScreen("host");
      return;
    }

    setScreen(nextRoom.activeHostVote ? "vote" : "player");
  }

  function sendSelectedMessage() {
    applyLocalAction(sendLocalMessage(room, currentPlayerId, sentMessage));
  }

  function requestHostFromPhone() {
    const nextRoom = applyLocalAction(requestLocalHost(room, currentPlayerId));
    const nextPlayer = nextRoom.players.find((player) => player.id === currentPlayerId);

    if (nextPlayer?.isHost) {
      setScreen("host");
      return;
    }

    setScreen(nextRoom.activeHostVote ? "vote" : "player");
  }

  function castPhoneVote(vote: "yes" | "no") {
    const activeVote = room.activeHostVote;

    if (!activeVote) {
      setFeedback("No host vote is active.");
      setScreen("player");
      return;
    }

    const playerAlreadyVoted =
      activeVote.yesPlayerIds.includes(currentPlayerId) ||
      activeVote.noPlayerIds.includes(currentPlayerId);
    const result = playerAlreadyVoted
      ? castNextLocalHostVote(room, vote)
      : castLocalHostVote(room, currentPlayerId, vote);
    const nextRoom = applyLocalAction(result);
    const nextPlayer = nextRoom.players.find((player) => player.id === currentPlayerId);

    if (nextPlayer?.isHost) {
      setScreen("host");
      return;
    }

    setScreen(nextRoom.activeHostVote ? "vote" : "player");
  }

  function passHostFromPhone() {
    const nextRoom = applyLocalAction(passLocalHost(room));
    const nextPlayer = nextRoom.players.find((player) => player.id === currentPlayerId);
    setScreen(nextPlayer?.isHost ? "host" : "player");
  }

  return (
    <main className="controller-stage">
      <PhoneShell>
        {screen === "name" ? (
          <section className="phone-card join-card">
            <LogoMark size="phone" />
            <Badge tone="yellow">Room K7P4</Badge>
            <div className="phone-copy">
              <h1>Step into the crash.</h1>
              <p>Pick the name the TV will show when you join the lobby.</p>
            </div>
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
            <Button
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
              <StatusPill status="connected">K7P4</StatusPill>
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
            hostName={currentHost?.name ?? "Alex"}
            feedback={feedback}
            sentMessage={sentMessage}
            setSentMessage={setSentMessage}
            onRequestHost={requestHostFromPhone}
            onSendMessage={sendSelectedMessage}
            voteActive={Boolean(room.activeHostVote)}
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

interface LobbyControllerProps {
  player: {
    name: string;
    avatar: ChessAvatar;
  };
  hostName: string;
  feedback: string;
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
          <span>Room K7P4</span>
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
  room: ReturnType<typeof createLocalLobbyRoom>;
  onVoteYes: () => void;
  onVoteNo: () => void;
}

function VoteController({ feedback, player, room, onVoteYes, onVoteNo }: VoteControllerProps) {
  const activeVote = room.activeHostVote;

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
        <HostVotePanel vote={activeVote} players={room.players} size="phone" />
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
