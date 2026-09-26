# Team Matcher Code Docs

## App Overview

Team Matcher is a cross-platform sports team management app built with Expo + React Native (frontend) and FastAPI + SQLAlchemy (backend).

Core roles and use cases:

- Coach: create clubs/groups, manage players, publish matches, and process match applications.
- Player: join groups, receive and manage match invitations, and maintain profile details.
- Guardian: review and approve underage player participation.
- Admin: manage platform-level settings and oversight workflows.

Core capabilities:

- Club -> Group -> Player team organization.
- Invite-code based group join and offline player binding.
- Match creation, applying, confirmation, and roster workflows.
- Email verification and password reset flows.
- In-app notifications for key team and match events.

## Project Structure

```text
team-matcher-app/
├── src/
│   ├── api.ts                     # Frontend API wrapper + DTO mapping
│   ├── i18n.tsx                   # Multi-language dictionary and language hooks
│   ├── storage.ts                 # Local persistence + app notification helpers
│   ├── app/                       # Expo Router entry screens
│   ├── screens/                   # Role-based screens (Coach/Player/Guardian/Admin/Login)
│   ├── components/                # Shared UI components
│   ├── hooks/                     # Theme/color-scheme hooks
│   ├── constants/                 # Theme constants
│   └── types.ts                   # Frontend domain types
├── assets/                        # App icons and static assets
├── docs/                          # This documentation set
├── scripts/                       # Utility scripts (e.g., reset-project)
├── main.py                        # FastAPI backend (monolithic route/modules)
├── app.json                       # Expo runtime/build configuration
├── package.json                   # Frontend dependencies and npm scripts
├── .env.example                   # Environment variable template
└── README.md                      # Root quick-start and environment notes
```

This folder contains module-oriented documentation for the current codebase.

- `frontend-modules.md`: frontend architecture, state flow, screens, and shared utilities.
- `backend-main-modules.md`: modular explanation of the monolithic `main.py` backend.
- `new-machine-setup.md`: environment setup checklist for moving the project to a new macOS computer.

Recommended reading order:

1. `frontend-modules.md`
2. `backend-main-modules.md`
3. `new-machine-setup.md`

## Architecture diagram：
<p align="center">
  <img src="assets/b.jpeg" alt="项目横幅" width="350" />
  <img src="assets/function.jpeg" alt="项目横幅" width="350" />
  
</p>
