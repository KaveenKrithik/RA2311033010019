# Campus Notifications Microservice

This repository contains the backend work for the campus notifications evaluation. The main goal is to fetch live notification data, rank it by priority, and return the top 10 unread items in a predictable format.

## What is included

- `logging_middleware/` for the reusable logging helper required by the evaluation
- `notification_app_be/` for the Express service that serves the priority inbox
- `notification_system_design.md` for the Stage 1 to Stage 6 design write-up
- `screenshots/insomniac.png` for the API output captured from Insomnia

## How the app works

The notification service runs with Express. When `GET /notifications/priority` is called, the app:

1. Sends a request to the external notification API.
2. Reads the returned notification list.
3. Assigns a weight to each notification type:
	- Placement = highest priority
	- Result = medium priority
	- Event = lowest priority
4. Sorts notifications by weight first and by timestamp second.
5. Returns only the top 10 items.

The service uses the custom logging middleware for request and response tracking. It does not use `console.log` for application logging.

## Project structure

```text
AFFORDMED/
├── logging_middleware/
├── notification_app_be/
├── notification_system_design.md
└── screenshots/
```

## Run locally

From the repository root:

```bash
cd notification_app_be
npm install
npm start
```

The app starts on port `3000` by default.

## Test in Insomnia

Create a `GET` request to:

```text
http://localhost:3000/notifications/priority
```

No request body is needed for this endpoint. The response should contain a `status` field and a `data` array with up to 10 notifications.

## Output

![Insomnia output](screenshots/insomniac.png)
