import type { GameContext, GroupCrashGame } from "@group-crash/game-sdk";

export type SketchPhase = "drawing" | "guessing" | "results";
export type SketchRole = "drawer" | "guesser";
export type SketchWinner = "drawer" | "guessers";

export interface SketchPrompt {
  category: string;
  prompt: string;
}

export interface SketchPoint {
  x: number;
  y: number;
}

export interface SketchStrokeInput {
  color: string;
  points: SketchPoint[];
  size: number;
}

export interface SketchStroke extends SketchStrokeInput {
  createdAt: number;
  id: string;
  playerId: string;
}

export interface SketchGuess {
  createdAt: number;
  isCorrect: boolean;
  playerId: string;
  text: string;
}

export interface PublicSketchGuess {
  createdAt: number;
  isCorrect: boolean;
  playerId: string;
  text: string | null;
}

export interface SketchResults {
  correctPlayerIds: string[];
  guesses: PublicSketchGuess[];
  prompt: string;
  winner: SketchWinner;
}

export interface SketchGameState {
  category: string;
  createdAt: number;
  drawerPlayerId: string;
  guessesByPlayerId: Record<string, SketchGuess>;
  phase: SketchPhase;
  playerIds: string[];
  prompt: string;
  results: SketchResults | null;
  round: number;
  strokes: SketchStroke[];
}

export type SketchAction =
  | { type: "add_stroke"; playerId: string; stroke: SketchStrokeInput }
  | { type: "start_guessing" }
  | { type: "submit_guess"; playerId: string; guess: string }
  | { type: "show_results" }
  | { type: "return_lobby" };

export const sketchPrompts: SketchPrompt[] = [
  { category: "Cosmic snack", prompt: "Moon pizza" },
  { category: "Tiny chaos", prompt: "Angry robot" },
  { category: "Fantasy move", prompt: "Wizard skateboard" },
  { category: "Castle problem", prompt: "Tiny castle" },
  { category: "Party object", prompt: "Disco sword" },
  { category: "Weather mood", prompt: "Happy thundercloud" },
  { category: "Kitchen trouble", prompt: "Exploding taco" },
  { category: "Space pet", prompt: "Astronaut cat" }
];

export const sketchCrashGame: GroupCrashGame<SketchGameState, SketchAction> = {
  manifest: {
    id: "sketch-crash",
    name: "Sketch Crash",
    tagline: "Draw fast, guess faster",
    description:
      "A drawing party game where one phone becomes the sketch pad and everyone else guesses from their controllers.",
    minPlayers: 2,
    maxPlayers: 8,
    status: "playable"
  },
  createInitialState(context: GameContext) {
    return createSketchGameState({
      now: Date.now(),
      playerIds: context.playerIds
    });
  },
  handlePlayerAction(state, action) {
    return { state: applySketchAction(state, action), events: [] };
  },
  getTvView(state) {
    return createSketchPublicView(state);
  },
  getPlayerView(state, playerId) {
    return createSketchPrivateView(state, playerId);
  }
};

export const sketchCrashManifest = sketchCrashGame.manifest;

export function createSketchGameState({
  now = Date.now(),
  playerIds
}: {
  now?: number;
  playerIds: string[];
}): SketchGameState {
  if (playerIds.length < sketchCrashManifest.minPlayers) {
    throw new Error("Sketch Crash requires at least two players.");
  }

  const drawerPlayerId = pickOne(playerIds);
  const prompt = pickOne(sketchPrompts);

  return {
    category: prompt.category,
    createdAt: now,
    drawerPlayerId,
    guessesByPlayerId: {},
    phase: "drawing",
    playerIds: [...playerIds],
    prompt: prompt.prompt,
    results: null,
    round: 1,
    strokes: []
  };
}

export function applySketchAction(
  state: SketchGameState,
  action: SketchAction
): SketchGameState {
  if (action.type === "return_lobby") {
    return cloneSketchState(state);
  }

  if (action.type === "start_guessing") {
    return state.phase === "drawing"
      ? { ...cloneSketchState(state), phase: "guessing" }
      : cloneSketchState(state);
  }

  if (action.type === "show_results") {
    return state.phase === "guessing"
      ? resolveSketchState(state)
      : cloneSketchState(state);
  }

  if (action.type === "add_stroke") {
    const next = cloneSketchState(state);

    if (next.phase !== "drawing" || action.playerId !== next.drawerPlayerId) {
      return next;
    }

    next.strokes = [
      ...next.strokes,
      {
        color: sanitizeStrokeColor(action.stroke.color),
        createdAt: Date.now(),
        id: `stroke-${next.strokes.length + 1}`,
        playerId: action.playerId,
        points: action.stroke.points
          .slice(0, 80)
          .map((point) => ({
            x: clampUnit(point.x),
            y: clampUnit(point.y)
          })),
        size: clampStrokeSize(action.stroke.size)
      }
    ].slice(-180);

    return next;
  }

  const next = cloneSketchState(state);

  if (
    next.phase !== "guessing" ||
    action.playerId === next.drawerPlayerId ||
    !next.playerIds.includes(action.playerId)
  ) {
    return next;
  }

  const guess = sanitizeGuess(action.guess);

  if (!guess) {
    return next;
  }

  next.guessesByPlayerId[action.playerId] = {
    createdAt: Date.now(),
    isCorrect: normalizeGuess(guess) === normalizeGuess(next.prompt),
    playerId: action.playerId,
    text: guess
  };

  if (Object.keys(next.guessesByPlayerId).length >= next.playerIds.length - 1) {
    return resolveSketchState(next);
  }

  return next;
}

export function createSketchPublicView(state: SketchGameState) {
  const guesses = Object.values(state.guessesByPlayerId)
    .sort((left, right) => left.createdAt - right.createdAt)
    .map((guess) => ({
      createdAt: guess.createdAt,
      isCorrect: state.phase === "results" ? guess.isCorrect : false,
      playerId: guess.playerId,
      text: state.phase === "results" ? guess.text : null
    }));

  return {
    gameId: sketchCrashManifest.id,
    name: sketchCrashManifest.name,
    phase: state.phase,
    category: state.category,
    playerIds: [...state.playerIds],
    results: state.results,
    round: state.round,
    voteProgress: [],
    votesCast: guesses.length,
    votesNeeded: state.playerIds.length - 1,
    drawerPlayerId: state.drawerPlayerId,
    drawingPromptHint: `${state.prompt.length} letters`,
    guesses,
    guessesSubmitted: guesses.length,
    guessesNeeded: state.playerIds.length - 1,
    strokes: state.strokes.map(cloneStroke)
  };
}

export function createSketchPrivateView(
  state: SketchGameState,
  playerId: string
) {
  const isDrawer = playerId === state.drawerPlayerId;
  const role: SketchRole = isDrawer ? "drawer" : "guesser";
  const submittedGuess = state.guessesByPlayerId[playerId]?.text ?? null;

  return {
    gameId: sketchCrashManifest.id,
    playerId,
    phase: state.phase,
    role,
    category: state.category,
    secretWord: isDrawer ? state.prompt : null,
    canVote: false,
    votedForPlayerId: null,
    results: state.results,
    canDraw: state.phase === "drawing" && isDrawer,
    canGuess: state.phase === "guessing" && !isDrawer && !submittedGuess,
    prompt: isDrawer ? state.prompt : null,
    submittedGuess,
    strokes: state.strokes.map(cloneStroke)
  };
}

function resolveSketchState(state: SketchGameState): SketchGameState {
  const next = cloneSketchState(state);
  const guesses = Object.values(next.guessesByPlayerId).sort(
    (left, right) => left.createdAt - right.createdAt
  );
  const correctPlayerIds = guesses
    .filter((guess) => guess.isCorrect)
    .map((guess) => guess.playerId);

  next.phase = "results";
  next.results = {
    correctPlayerIds,
    guesses: guesses.map((guess) => ({
      createdAt: guess.createdAt,
      isCorrect: guess.isCorrect,
      playerId: guess.playerId,
      text: guess.text
    })),
    prompt: next.prompt,
    winner: correctPlayerIds.length > 0 ? "guessers" : "drawer"
  };

  return next;
}

function cloneSketchState(state: SketchGameState): SketchGameState {
  return {
    ...state,
    guessesByPlayerId: Object.fromEntries(
      Object.entries(state.guessesByPlayerId).map(([playerId, guess]) => [
        playerId,
        { ...guess }
      ])
    ),
    playerIds: [...state.playerIds],
    results: state.results
      ? {
          ...state.results,
          correctPlayerIds: [...state.results.correctPlayerIds],
          guesses: state.results.guesses.map((guess) => ({ ...guess }))
        }
      : null,
    strokes: state.strokes.map(cloneStroke)
  };
}

function cloneStroke(stroke: SketchStroke): SketchStroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({ ...point }))
  };
}

function sanitizeGuess(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length >= 1 && trimmed.length <= 40 ? trimmed : null;
}

function normalizeGuess(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sanitizeStrokeColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value) ? value : "#291313";
}

function clampStrokeSize(value: number) {
  if (!Number.isFinite(value)) {
    return 7;
  }

  return Math.min(18, Math.max(3, Math.round(value)));
}

function clampUnit(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}
