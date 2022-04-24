require("dotenv").config();
const path = require("path");
const server = require("fastify")();
const axios = require("axios");

server.register(require("fastify-static"), {
  root: path.join(__dirname, "public"),
  prefix: "/public/",
});

server.get("/oauth/github/login/callback", async (request, reply) => {
  const { code } = request.query;

  const exchangeURL = new URL("login/oauth/access_token", "https://github.com");
  exchangeURL.searchParams.set("client_id", process.env.CLIENT_ID);
  exchangeURL.searchParams.set("client_secret", process.env.CLIENT_SECRET);
  exchangeURL.searchParams.set("code", code);

  const response = await axios.post(exchangeURL.toString(), null, {
    headers: {
      Accept: "application/json",
    },
  });

  const { access_token } = response.data;

  const redirectionURL = new URL("popup", "http://localhost:3000");
  redirectionURL.searchParams.set("access_token", access_token);

  reply.status(302).header("Location", redirectionURL).send();
});

server.get("/new", (request, reply) => {
  return reply.sendFile("new.html");
});

server.get("/popup", (request, reply) => {
  return reply.sendFile("popup.html");
});

server.get("/", (request, reply) => {
  return reply.sendFile("index.html");
});

server.listen(3000, () => console.info("http://localhost:3000"));
