## What can we build

An interface that gives a GitHub-authenticated user (or any user's organization) the ability to see which of his repositories have a given GitHub App installed.

![Vercel's Import Git Repository component](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/2g4vbnzbk7pme9l8f7bq.png)

> [Vercel](https://vercel.com/new)'s Import Git Repository component

***

## Premise

I found two different ways to achieve the goal. 
1. **Standalone provider (GitHub App)**
2. [Dual providers](#related-posts) (OAuth App, GitHub App).

If you know of other modalities, please [contact me (twitter)](https://twitter.com/did0f).

_In this post we are implementing the first modality._

***

## Index

1. [Create GitHub App](#create-github-app)
2. [GitHub OAuth](#github-oauth)
3. [Query the GitHub REST API](#query-github-rest-api)

***

### Create GitHub App <a name="create-github-app"></a>

In order for us to find the list of repos that have the [GitHub App](https://docs.github.com/en/developers/apps/getting-started-with-apps/about-apps) installed, we must first [create one](https://docs.github.com/en/developers/apps/building-github-apps/creating-a-github-app).

For the purposes of this post, we just need to know that to authenticate a user through GitHub, you need to register your own OAuth app; however, [every GitHub App has an OAuth inside it](https://docs.github.com/en/developers/apps/getting-started-with-apps/differences-between-github-apps-and-oauth-apps).

That's why I (_arbitrarily_) call this method **standalone** - we only use a single GitHub App.

![Register GitHub App configuration](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/247esy6i63l5p9sikmt7.png)

- **Homepage URL**: _http://localhost:3000_
- **Callback URL**: Where the provider should send back the user once the authentication flow is completed. You can pick any route, I'm using _/oauth/github/login/callback_
- **Setup URL**: Where the provider should send back the user once the GitHub has been installed/uninstalled/permission-changed. You can pick any route, I'm using _/new_.

![Contents read-only permission](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/6riuxroiwya3gsbtdzio.png)
Configure the app so that it has the right to read the content. Otherwise, it won't be able to be installed on specific repos.
 
> You'll also find a **Webhook** section. For the purposes of this post we don't care, so to continue you can just mark it as inactive.

Finally create the GitHub App. It has been assigned an App ID, a _Client ID_ and it's possible to generate a _Client Secret_ - All the stuff we need, but in a little while.

***

### GitHub OAuth <a name="github-oauth"></a>

[Authenticating a user with GitHub](https://docs.github.com/en/developers/apps/building-oauth-apps/authorizing-oauth-apps) is straight forward.

> If something isn't clear kindly [refer to the code](https://github.com/didof/github-app-standalone).

First, the frontend presents a CTA which points to a route on the server.

```html
<a id="oauth-github">Authenticate via GitHub</a>
<script>
    const CLIENT_ID = "Iv1.395930440f268143";

    const url = new URL("/login/oauth/authorize", "https://github.com");
    url.searchParams.set("client_id", CLIENT_ID);

    document.getElementById("oauth-github")
      .setAttribute("href", url);
</script>
```

> Note: To remain concise, I'm only reporting `client_id` since it's required; however in a production context be sure to review the official documentation, especially regarding `scope` and `state`.

Make it pretty, add the GitHub icon to it - the user presses it and is taken to the following page:

![GitHub authentication screen](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/v2zxh0n1r9e4j74u3vl5.png)

Now, when the green **Authorize <app-name>** button is pressed, the user is redirected to **Callback URL** set during GitHub App creation.

Let's make sure that the server is able to listen to `/oauth/github/login/callback`. Watch out for this key step: GitHub redirects and adds a query param, a `code` needed to authenticate the user.

```js
server.get("/oauth/github/login/callback", async (request, reply) => {
  const { code } = request.query;

  // ...
});
```

`code` is supposed to be exchanged with an `access_token`, which will be stored in the client and associated with requests to the GitHub REST API.

Now, before moving on, please go back to your GitHub App Configuration page and _Generate a new Client Secret_. Than `dotenv` it.

```js
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
```

> For the sake of brevity, the example does not report **error handling**. It is left to the common sense of the reader.

Thus, the token is delivered to the client whom ultimately is redirected to some `/welcome` route. But - here's the hero - also receives the `access_token` as query param.

```js
const { access_token } = response.data;

const redirectionURL = new URL("new", "http://localhost:3000");
redirectionURL.searchParams.set("access_token", access_token);

reply.status(302).header("Location", redirectionURL).send();
```

Extract it on the client:

```html
<!-- new.html, sent when GET /new -->
<script>
  const access_token = new URL(window.location).searchParams.get(
    "access_token"
  );

  localStorage.setItem("access_token", access_token);
</script>
```

You can store it any Web Storage, in-memory, really depends on how your interface is to be used. Although an _HttpOnly_ and _Secure_ cookie would help mitigate **XSS attacks**.

The client of the authenticated user can finally associate the `access_token` when it legitimately queries the [GitHub REST API](https://docs.github.com/en/rest). Almost there.

> Enhancement: popup instead of redirection
  Usually other OAuth _in the wild_ do not hard redirect the current page. Suppose to be working on a SPA, think how sad it is to find out that this flow empties your in-memory store. Easy to solve, the redirection will still happen but in a [spawned popup (post)](#related-posts) that, before dissolving will pass the _access_token_ back to main tab.

***

### Query the GitHub REST API <a name="query-github-rest-api"></a>

The data we need is returned from two endpoints.
1. [/user/installations](https://docs.github.com/en/rest/apps/installations#list-app-installations-accessible-to-the-user-access-token)
2. [/user/installations/{installation_id}/repositories](https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-user-access-token)

The latter is called with information received from the former.

> Setting to `application/vnd.github.v3+json` is recommended by the official docs. It's the _GitHub API custom media type_.

```js
const githubAPI = axios.create({
  baseURL: "https://api.github.com",
  headers: {
    Accept: "application/vnd.github.v3+json",
  },
});

const authorizationConf = {
  headers: {
    authorization: `token ${access_token}`,
  },
};

(async () => {
  const installationResponse = await githubAPI.get(
    "user/installations",
    authorizationConf
  );
})();
```

We receive back a list containing... wait, it's empty. That's  because the GitHub App has not yet been installed anywhere.

Let's make it easy to install:

```html
<a
 href="https://github.com/apps/<github-app-name>/installations/new"
>
  Change permissions
</a>
```

That once is clicked shows the following screen:

![GitHub App change permission screen](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/i2jsyepcalbp0fdqm2ti.png)

Either pick you personal account or one of your organizations. Or both. Install it somewhere.

![Repository access screen](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/pfy279ksujfqb9yj161k.png)

Now `/user/installations` returns a list of installations. One for each account (personal account || organization) that has at least one repo with the github app installed in it.

Each item has the property `id`. That's the `installation_id` required for the next endpoint.

```js
const promises = installationsResponse.data.installations.map(
  (installation) => {
    return githubAPI.get(
      `user/installations/${installation.id}/repositories`,
      authorizationConf
    );
  }
);

// parallel
const responses = await axios.all(promises);

const repositories = responses.map((response) => {
  return response.data.repositories;
});
```

And there you have all the `repositories` of the **authenticated user** or one of his organizations that have the **GitHub App installed**.

***

## Epilogue

To recap, you now can:
- redirect users to install your GitHub App
- show them a dropdown containing all the organization in addition the the personal account
- know which repositories to show

I'll leave it up to you to have all the fun of implementing the UI with your favorite framework. If you need to look at the full tour, in the [companion repo](https://github.com/didof/github-app-standalone/) I used technologies that anyone knows.

***

### Related Posts <a name="related-posts"></a>

- GitHub App - Practical Kick-Starter (Dual provider)
- OAuth popup Guide
