# Deployment Readiness

OpenDots is designed to run reliably in containerized environments. This guide documents the startup procedures, requirements, and limitations for 24/7 production operation.

## Startup Procedure

The application utilizes Node.js 24 and builds the client using Vite, serving it through a Hono backend.

### Production Commands

The production application is built and executed using the following commands:

- **Build**: `npm run build`
- **Application Server**: `npm run start` (Executes `node --env-file-if-exists=.env dist/server/server/index.js`)
- **Browser Worker** (Optional): `npm run browser:start` (Executes `node --env-file-if-exists=.env dist/server/browser/index.js`)

In the provided Docker environments, the images run these raw commands without npm:

- App: `node dist/server/server/index.js`
- Browser: `node dist/server/browser/index.js`

## Health Checks

The application server provides a lightweight health check endpoint at `/health` that returns HTTP 200 with `{ "status": "ok" }`. This should be used for load balancer probes, Docker healthchecks, and Kubernetes liveness/readiness probes.

## Environment Variables

OpenDots is heavily configuration-driven. The core environment variables required for basic operation include:

- `OWNER_TOKEN`: Must be at least 24 characters when `HOST` is exposed outside of loopback (e.g. `0.0.0.0` inside a container). If missing or too short, the server will intentionally crash on startup to prevent unauthorized external access.
- `HOST`: Defaults to `127.0.0.1`. The Docker configuration forces this to `0.0.0.0`.
- `PORT`: Defaults to `4310`.
- `DATABASE_PATH`: Path to the SQLite database (default: `data/opendots.sqlite`). Ensure this points to a persistent volume (e.g., `/data/opendots.sqlite`).
- `APP_ORIGIN`: The public URL the app is reachable at (e.g. `https://opendots.example.com`).

A full list of configuration parameters, including LLM and intelligence API keys, can be found in `.env.example`.

## Docker Configuration

The repository includes a multi-stage `Dockerfile` and associated compose files:

- `compose.yml`: Standard deployment of the app and optional browser worker.
- `compose.computers.yml`: Local control plane for persistent OpenBot computers.
- `compose.computers-app.yml`: Network overlay for running the app alongside the computer supervisor.

### Persistent Volumes

If using Docker, ensure that `/data` is mounted to a persistent volume to preserve `opendots.sqlite`. The default `compose.yml` mounts `opendots-data:/data`.

## Known Limitations

For 24/7 production operation, please consider the following architectural limitations:

1. **SQLite Concurrency:** OpenDots uses a local SQLite database for state management. While performant for personal use, it is not designed to scale horizontally across multiple application replicas. **Do not run more than one instance of the app container** against the same database volume.
2. **In-Memory Job Execution:** Scheduled tasks are driven by an in-memory runner process. If the application server crashes or is restarted, scheduled ticks will resume when the server comes back online, but tasks currently executing at the exact moment of failure may be interrupted and marked as failed.
3. **Persistent Computers (OpenBot):** The computer supervisor dynamically creates sibling containers on the host. Managing these requires access to the Docker socket. In a clustered orchestration environment (like Kubernetes), this requires specific host bindings or a specialized OpenBot supervisor implementation.

For fully isolated, multi-user, horizontally scalable deployments, considerable modifications to the state and task scheduling layers would be required. OpenDots is intended as a single-owner personal agent system.
