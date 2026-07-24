import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3001);

const server = createServer((_request, response) => {
  response.setHeader("Content-Type", "application/json");
  response.end(
    JSON.stringify({
      name: "Group Crash server",
      status: "static-milestone",
      note: "Multiplayer is intentionally not implemented in Milestone 1."
    })
  );
});

server.listen(port, () => {
  console.log(`Group Crash server placeholder listening on http://127.0.0.1:${port}`);
});

