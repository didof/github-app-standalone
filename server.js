const path = require("path");
const server = require("fastify")();

server.register(require("fastify-static"), {
  root: path.join(__dirname, "public"),
  prefix: "/public/",
});

server.get("/", (request, reply) => {
  return reply.sendFile("index.html");
});

server.listen(3000, () => console.info("http://localhost:3000"));
