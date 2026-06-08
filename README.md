# NazoAuth Web

NazoAuth Web is the browser front end for NazoAuth. It provides the account login, OAuth consent, user profile, client access request, credential delivery, and administrator surfaces.

The application is built with React, TypeScript, and Vite. It talks to the NazoAuth backend through same-origin API routes and keeps credentialed requests enabled for session cookies and CSRF-protected writes.

## Local Development

```bash
npm install
npm run dev
```

By default, development requests use `http://127.0.0.1:8000`.

To point the web app at a deployed backend:

```bash
VITE_API_BASE_URL=https://oauth-test.nazo.run npm run dev
```

## Build

```bash
npm run test
```

`npm run test` runs linting and the production build.

## Deployment

Build output is written to `dist/`.

For `accounts-test.nazo.run`, deploy the contents of `dist/` to the static site root and make sure the reverse proxy either:

- forwards backend API routes to the NazoAuth backend, or
- builds with `VITE_API_BASE_URL=https://oauth-test.nazo.run` and allows credentialed CORS from `https://accounts-test.nazo.run`.

## Routes

- `/` account and authorization gateway
- `/auth` login, registration, and account recovery entry
- `/consent` OAuth consent screen
- `/profile` user profile, authorized apps, and client access requests
- `/delivery` one-time client credential delivery
- `/admin` administrator work surface
- `/docs` integration notes
- `/contact` support information
