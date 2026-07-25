import type { GameContext, GroupCrashGame } from "@group-crash/game-sdk";

export type ImposterPhase = "discussion" | "voting" | "results";
export type ImposterRole = "crew" | "imposter";
export type ImposterWinner = "crew" | "imposter";

export interface ImposterPrompt {
  category: string;
  secretWord: string;
}

export interface ImposterGameState {
  category: string;
  createdAt: number;
  imposterPlayerId: string;
  phase: ImposterPhase;
  playerIds: string[];
  results: ImposterResults | null;
  round: number;
  secretWord: string;
  votesByPlayerId: Record<string, string>;
}

export interface ImposterResults {
  imposterPlayerId: string;
  mostVotedPlayerIds: string[];
  secretWord: string;
  voteCounts: Array<{ playerId: string; votes: number }>;
  winner: ImposterWinner;
}

export type ImposterAction =
  | { type: "start_voting" }
  | { type: "cast_vote"; playerId: string; targetPlayerId: string }
  | { type: "return_lobby" };

export const imposterPrompts: ImposterPrompt[] = [
  { category: "Food", secretWord: "Pizza" },
  { category: "Place", secretWord: "Beach" },
  { category: "Object", secretWord: "Umbrella" },
  { category: "Animal", secretWord: "Penguin" },
  { category: "Movie Genre", secretWord: "Comedy" },
  { category: "Sport", secretWord: "Basketball" }
];

export const imposterCrashGame: GroupCrashGame<ImposterGameState, ImposterAction> = {
  manifest: {
    id: "imposter-crash",
    name: "Imposter Crash",
    tagline: "Find the hidden player",
    description:
      "A social deduction game where crew players know the secret word and one imposter only sees the category.",
    minPlayers: 3,
    maxPlayers: 8,
    status: "playable"
  },
  createInitialState(context: GameContext) {
    return createImposterGameState({
      playerIds: context.playerIds,
      now: Date.now()
    });
  },
  handlePlayerAction(state, action) {
    const next = applyImposterAction(state, action);
    return { state: next, events: [] };
  },
  getTvView(state) {
    return state;
  },
  getPlayerView(state, playerId) {
    return createImposterPrivateView(state, playerId);
  }
};

export const imposterCrashManifest = imposterCrashGame.manifest;

export function createImposterGameState({
  now = Date.now(),
  playerIds
}: {
  now?: number;
  playerIds: string[];
}): ImposterGameState {
  if (playerIds.length < imposterCrashManifest.minPlayers) {
    throw new Error("Imposter Crash requires at least three players.");
  }

  const imposterPlayerId = pickOne(playerIds);
  const prompt = pickOne(imposterPrompts);

  return {
    category: prompt.category,
    createdAt: now,
    imposterPlayerId,
    phase: "discussion",
    playerIds: [...playerIds],
    results: null,
    round: 1,
    secretWord: prompt.secretWord,
    votesByPlayerId: {}
  };
}

export function applyImposterAction(
  state: ImposterGameState,
  action: ImposterAction
): ImposterGameState {
  if (action.type === "start_voting") {
    return state.phase === "discussion"
      ? { ...cloneImposterState(state), phase: "voting", votesByPlayerId: {} }
      : cloneImposterState(state);
  }

  if (action.type === "return_lobby") {
    return cloneImposterState(state);
  }

  const next = cloneImposterState(state);

  if (
    next.phase !== "voting" ||
    !next.playerIds.includes(action.playerId) ||
    !next.playerIds.includes(action.targetPlayerId)
  ) {
    return next;
  }

  next.votesByPlayerId[action.playerId] = action.targetPlayerId;

  if (Object.keys(next.votesByPlayerId).length >= next.playerIds.length) {
    next.phase = "results";
    next.results = resolveImposterResults(next);
  }

  return next;
}

export function createImposterPublicView(state: ImposterGameState) {
  return {
    gameId: imposterCrashManifest.id,
    name: imposterCrashManifest.name,
    phase: state.phase,
    category: state.category,
    playerIds: [...state.playerIds],
    results: state.results,
    round: state.round,
    voteProgress: state.playerIds.map((playerId) => ({
      playerId,
      hasVoted: Boolean(state.votesByPlayerId[playerId])
    })),
    votesCast: Object.keys(state.votesByPlayerId).length,
    votesNeeded: state.playerIds.length
  };
}

export function createImposterPrivateView(
  state: ImposterGameState,
  playerId: string
) {
  const role: ImposterRole =
    playerId === state.imposterPlayerId ? "imposter" : "crew";

  return {
    gameId: imposterCrashManifest.id,
    playerId,
    phase: state.phase,
    role,
    category: state.category,
    secretWord: role === "crew" ? state.secretWord : null,
    canVote: state.phase === "voting" && state.playerIds.includes(playerId),
    votedForPlayerId: state.votesByPlayerId[playerId] ?? null,
    results: state.results
  };
}

function resolveImposterResults(state: ImposterGameState): ImposterResults {
  const voteCounts = state.playerIds.map((playerId) => ({
    playerId,
    votes: Object.values(state.votesByPlayerId).filter((vote) => vote === playerId)
      .length
  }));
  const highestVoteCount = Math.max(...voteCounts.map((count) => count.votes));
  const mostVotedPlayerIds = voteCounts
    .filter((count) => count.votes === highestVoteCount)
    .map((count) => count.playerId);
  const crewCaughtImposter =
    mostVotedPlayerIds.length === 1 &&
    mostVotedPlayerIds[0] === state.imposterPlayerId;

  return {
    imposterPlayerId: state.imposterPlayerId,
    mostVotedPlayerIds,
    secretWord: state.secretWord,
    voteCounts,
    winner: crewCaughtImposter ? "crew" : "imposter"
  };
}

function cloneImposterState(state: ImposterGameState): ImposterGameState {
  return {
    ...state,
    playerIds: [...state.playerIds],
    results: state.results
      ? {
          ...state.results,
          mostVotedPlayerIds: [...state.results.mostVotedPlayerIds],
          voteCounts: state.results.voteCounts.map((count) => ({ ...count }))
        }
      : null,
    votesByPlayerId: { ...state.votesByPlayerId }
  };
}

function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
