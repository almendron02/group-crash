import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { connect as connectTcp } from "node:net";
import { connect as connectTls } from "node:tls";
import type { Duplex } from "node:stream";
import type { RoomSnapshot } from "@group-crash/protocol";

export interface StoredRoomRecord<ActiveGame = unknown> {
  activeGame: ActiveGame | null;
  expiresAt: number;
  lastMessageAtEntries: Array<[string, number]>;
  reconnectTokenEntries: Array<[string, string]>;
  snapshot: RoomSnapshot;
}

export interface RoomStore<ActiveGame = unknown> {
  delete(roomCode: string): Promise<void>;
  loadAll(): Promise<Array<StoredRoomRecord<ActiveGame>>>;
  save(record: StoredRoomRecord<ActiveGame>): Promise<void>;
}

export function createRoomStore<ActiveGame = unknown>({
  filePath,
  keyPrefix = "group-crash",
  redisUrl
}: {
  filePath?: string;
  keyPrefix?: string;
  redisUrl?: string;
}): RoomStore<ActiveGame> | null {
  if (redisUrl) {
    return createRedisRoomStore<ActiveGame>(redisUrl, keyPrefix);
  }

  if (filePath) {
    return createFileRoomStore<ActiveGame>(filePath);
  }

  return null;
}

function createFileRoomStore<ActiveGame>(filePath: string): RoomStore<ActiveGame> {
  async function readStore() {
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw) as Record<string, StoredRoomRecord<ActiveGame>>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }

      throw error;
    }
  }

  async function writeStore(store: Record<string, StoredRoomRecord<ActiveGame>>) {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, JSON.stringify(store, null, 2), "utf8");
  }

  return {
    async delete(roomCode) {
      const store = await readStore();
      delete store[roomCode];
      await writeStore(store);
    },
    async loadAll() {
      const store = await readStore();
      return Object.values(store);
    },
    async save(record) {
      const store = await readStore();
      store[record.snapshot.roomCode] = record;
      await writeStore(store);
    }
  };
}

function createRedisRoomStore<ActiveGame>(
  redisUrl: string,
  keyPrefix: string
): RoomStore<ActiveGame> {
  const key = (roomCode: string) => `${keyPrefix}:room:${roomCode}`;
  const glob = `${keyPrefix}:room:*`;

  return {
    async delete(roomCode) {
      await sendRedisCommand(redisUrl, ["DEL", key(roomCode)]);
    },
    async loadAll() {
      const keys = await sendRedisCommand(redisUrl, ["KEYS", glob]);

      if (!Array.isArray(keys) || keys.length === 0) {
        return [];
      }

      const records: Array<StoredRoomRecord<ActiveGame>> = [];

      for (const storedKey of keys) {
        if (typeof storedKey !== "string") {
          continue;
        }

        const raw = await sendRedisCommand(redisUrl, ["GET", storedKey]);

        if (typeof raw === "string") {
          records.push(JSON.parse(raw) as StoredRoomRecord<ActiveGame>);
        }
      }

      return records;
    },
    async save(record) {
      await sendRedisCommand(redisUrl, [
        "SET",
        key(record.snapshot.roomCode),
        JSON.stringify(record)
      ]);
    }
  };
}

async function sendRedisCommand(redisUrl: string, args: string[]) {
  const url = new URL(redisUrl);
  const port = Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379));
  const host = url.hostname;
  const socket =
    url.protocol === "rediss:"
      ? connectTls({ host, port, servername: host })
      : connectTcp({ host, port });

  await once(socket, url.protocol === "rediss:" ? "secureConnect" : "connect");

  if (url.password) {
    const authArgs = url.username
      ? ["AUTH", decodeURIComponent(url.username), decodeURIComponent(url.password)]
      : ["AUTH", decodeURIComponent(url.password)];
    socket.write(encodeRedisCommand(authArgs));
    parseRedisReply(await readRedisReply(socket));
  }

  socket.write(encodeRedisCommand(args));
  const response = parseRedisReply(await readRedisReply(socket));
  socket.end();

  return response;
}

function once(socket: Duplex, event: "connect" | "secureConnect") {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      socket.off(event, onConnect);
      socket.off("error", onError);
    };
    const onConnect = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    socket.once(event, onConnect);
    socket.once("error", onError);
  });
}

function encodeRedisCommand(args: string[]) {
  return args
    .map((arg) => {
      const value = Buffer.from(arg);
      return `$${value.byteLength}\r\n${arg}\r\n`;
    })
    .reduce((command, part, index) => {
      if (index === 0) {
        return `*${args.length}\r\n${part}`;
      }

      return `${command}${part}`;
    }, "");
}

async function readRedisReply(socket: Duplex) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const onData = (chunk: Buffer) => {
      chunks.push(chunk);

      try {
        parseRedisReply(Buffer.concat(chunks));
        cleanup();
        resolve(Buffer.concat(chunks));
      } catch (error) {
        if (error instanceof IncompleteRedisReplyError) {
          return;
        }

        cleanup();
        reject(error);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };

    socket.on("data", onData);
    socket.once("error", onError);
  });
}

class IncompleteRedisReplyError extends Error {}

function parseRedisReply(buffer: Buffer): unknown {
  return parseAt(buffer, 0).value;
}

function parseAt(buffer: Buffer, offset: number): { nextOffset: number; value: unknown } {
  if (offset >= buffer.length) {
    throw new IncompleteRedisReplyError();
  }

  const type = String.fromCharCode(buffer[offset]);
  const lineEnd = buffer.indexOf("\r\n", offset);

  if (lineEnd === -1) {
    throw new IncompleteRedisReplyError();
  }

  const line = buffer.subarray(offset + 1, lineEnd).toString("utf8");
  const next = lineEnd + 2;

  if (type === "+") {
    return { nextOffset: next, value: line };
  }

  if (type === "-") {
    throw new Error(`Redis error: ${line}`);
  }

  if (type === ":") {
    return { nextOffset: next, value: Number(line) };
  }

  if (type === "$") {
    const length = Number(line);

    if (length === -1) {
      return { nextOffset: next, value: null };
    }

    if (next + length + 2 > buffer.length) {
      throw new IncompleteRedisReplyError();
    }

    return {
      nextOffset: next + length + 2,
      value: buffer.subarray(next, next + length).toString("utf8")
    };
  }

  if (type === "*") {
    const count = Number(line);
    const values: unknown[] = [];
    let cursor = next;

    for (let index = 0; index < count; index += 1) {
      const item = parseAt(buffer, cursor);
      values.push(item.value);
      cursor = item.nextOffset;
    }

    return { nextOffset: cursor, value: values };
  }

  throw new Error(`Unsupported Redis response type: ${type}`);
}
