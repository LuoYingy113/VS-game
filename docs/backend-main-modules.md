# Backend `main.py` Modular Documentation

## 1. Overview

The backend is a FastAPI application implemented primarily in a single file: `main.py`.

Although the file is monolithic physically, it is already logically organized into modules using section markers and grouped Pydantic models.

Core responsibilities:

- API routing.
- request/response model definitions.
- lightweight business rules.
- email and verification workflows.
- notification generation.
- schema migration helpers.
- demo seed data.

## 2. High-Level Module Map Inside `main.py`

### 2.1 Infrastructure and Email Utilities

Top-of-file responsibilities:

- SMTP configuration.
- raw email send helper.
- verification email sending.
- admin registration notification email.
- password changed email.
- email-code sending.

Key functions:

- `_send_email`
- `send_verification_email`
- `send_admin_registration_notification`
- `send_password_changed_email`
- `send_code_email`
- `_send_code_email_safe`

Purpose:

This module abstracts outbound email side effects away from route handlers, although it still lives in the same file.

### 2.2 Background Lifecycle Tasks

Responsibilities:

- Delete expired games after they are more than one day old.
- Notify affected coaches before deletion.
- Register lifespan hooks.

Key functions:

- `_cleanup_expired_games`
- `lifespan`

Behavior summary:

- Runs on a loop.
- Finds expired games.
- Creates notifications.
- Deletes related match applications and rosters.
- Deletes the expired game.

### 2.3 Startup Migration and Seed Module

Responsibilities:

- Apply idempotent schema changes to existing tables.
- Populate default demo data if database is empty.

Key functions:

- `run_migrations`
- `seed_database`

Design note:

This backend uses application-driven migrations rather than a dedicated migration system such as Alembic.

## 3. Pydantic Contract Layer

The middle section of `main.py` defines request and response models that act as the backend's API contract.

### 3.1 User and Profile Models

- `UserCreate`
- `UserResponse`
- `CoachProfileUpdate`
- `ChangePasswordRequest`

### 3.2 Game Models

- `GameCreate`
- `GameUpdate`
- `GameResponse`

### 3.3 Team and Club Models

- `TeamGroupCreate`
- `TeamGroupUpdate`
- `OfflinePlayerCreate`
- `OfflinePlayerResponse`
- `TeamGroupResponse`
- `ClubCreate`
- `ClubResponse`
- `PlayerAction`
- `JoinTeamByInviteRequest`
- `MovePlayerRequest`

### 3.4 Match Application Models

- `MatchApplicationCreate`
- `MatchApplicationStatusUpdate`
- `MatchApplicationResponse`

### 3.5 Roster and Settings Models

- `RosterCreate`
- `RosterStatusUpdate`
- `RosterResponse`
- `VolunteerAction`
- `SettingsUpdate`
- `SettingsResponse`

### 3.6 Notification Models

- `NotificationCreate`
- `NotificationResponse`

These classes separate transport format from SQLAlchemy models and are the clearest modular boundary in the file.

## 4. Feature Modules by Route Section

## 4.1 Auth Module

Section marker:

- `# --- Auth ---`

Responsibilities:

- Email/password login.
- Email verification landing page.
- Resend verification mail.
- Send email verification codes.
- Send login verification codes.
- Send password reset codes.
- Verify login email code.

Key endpoints:

- `POST /api/login`
- `GET /api/verify_email`
- `POST /api/resend_verification`
- `POST /api/send_email_code`
- `POST /api/send_login_verify_code`
- `POST /api/send_password_reset_code`
- `POST /api/verify_email_code`

Business rules handled here:

- Blocks unverified login.
- Stores in-memory email codes.
- Validates code-based authentication flows.

## 4.2 Invite Code Module

Section markers:

- `# --- Invite Codes (legacy one-time codes, kept for backward compatibility) ---`
- `# --- Coach Invite Codes ---`

Responsibilities:

- Create and read legacy invite codes.
- Create coach registration invite codes.

Key endpoints:

- `POST /api/invite_codes`
- `GET /api/invite_codes`
- `POST /api/coach_invite_codes`
- `GET /api/coach_invite_codes`

## 4.3 Registration Module

Section markers:

- `# --- Coach Self-Registration ---`
- `# --- Player Self-Registration ---`

Responsibilities:

- Register coach accounts.
- Register player accounts.
- Handle underage guardian requirements.
- Notify the registered email address about new-account creation.

Key functions and endpoints:

- `register_coach`
- `_calc_age`
- `register_player`
- `POST /api/register_coach`
- `POST /api/register`

## 4.4 User Module

Section marker:

- `# --- Users ---`

Responsibilities:

- Email existence checks.
- Read users.
- Create users directly.
- Update coach profile.
- Change password with email code verification.

Key endpoints:

- `GET /api/check_email`
- `GET /api/users`
- `POST /api/users`
- `PUT /api/users/{user_id}/profile`
- `POST /api/users/{user_id}/change_password`

## 4.5 Game Module

Section marker:

- `# --- Games ---`

Responsibilities:

- List games.
- Fetch private game by invite code.
- Create games.
- Update games.
- Delete games.
- Update volunteer list.

Key endpoints:

- `GET /api/games`
- `GET /api/games/by_invite/{code}`
- `POST /api/games`
- `PUT /api/games/{game_id}`
- `DELETE /api/games/{game_id}`
- `PUT /api/games/{game_id}/volunteers`

Business rules handled here:

- Private game invite-code lookup.
- Game-level volunteer membership updates.

## 4.6 Team Group Module

Section marker:

- `# --- Team Groups ---`

Responsibilities:

- List team groups.
- Create and edit groups.
- Enforce duplicate top-level team-name rule per coach.
- Move players between groups.
- Join groups by invite code.
- Manage offline players.
- Generate and fetch persistent group invite code.

Key endpoints:

- `GET /api/team_groups`
- `POST /api/team_groups`
- `POST /api/team_groups/move_player`
- `POST /api/team_groups/join_by_invite`
- `GET /api/team_groups/{group_id}/invite_code`
- `PUT /api/team_groups/{group_id}`
- `DELETE /api/team_groups/{group_id}`
- `POST /api/team_groups/{group_id}/players`
- `POST /api/team_groups/{group_id}/remove_player`
- `POST /api/team_groups/{group_id}/offline_players`
- `DELETE /api/team_groups/{group_id}/offline_players/{player_id}`

## 4.7 Club Module

Section marker:

- `# --- Clubs ---`

Responsibilities:

- List clubs.
- Create clubs.
- Delete clubs.
- Unlink teams from clubs before deleting a club.

Key endpoints:

- `GET /api/clubs`
- `POST /api/clubs`
- `DELETE /api/clubs/{club_id}`

## 4.8 Match Application Module

Section marker:

- `# --- Match Applications ---`

Responsibilities:

- List all applications.
- Create applications.
- Notify game owner on new application.
- Accept or reject applications.
- Delete application on rejection.
- When accepted, lock the game opponent and auto-invite roster players.

Key endpoints:

- `GET /api/match_applications`
- `POST /api/match_applications`
- `PUT /api/match_applications/{app_id}/status`
- `DELETE /api/match_applications/{app_id}`

Important business logic:

- Prevent duplicate applications from the same coach for the same game.
- On create, notify the game owner.
- On accept, assign `opposing_group_id` on the game.
- On accept, create roster entries and notifications for relevant players.

## 4.9 Roster Module

Section marker:

- `# --- Rosters ---`

Responsibilities:

- Read rosters.
- Batch-create roster invitations.
- Update player participation status.

Key endpoints:

- `GET /api/rosters`
- `POST /api/rosters/batch`
- `PUT /api/rosters/{roster_id}/status`

Important business rules:

- Supports `invited`, `pending_guardian`, `pending_coach`, `approved`, `not_participating`, and `withdrawn`.
- Withdrawn players are protected against invalid status movement.

## 4.10 Settings Module

Section marker:

- `# --- Settings ---`

Responsibilities:

- Read and update global settings.
- Currently focused on underage threshold configuration.

Key endpoints:

- `GET /api/settings`
- `PUT /api/settings`

## 4.11 Notification Module

Section marker:

- `# --- Notifications ---`

Responsibilities:

- Create notifications.
- Read notifications by user.
- Mark all notifications as read.

Key endpoints:

- `POST /api/notifications`
- `GET /api/notifications/{user_id}`
- `PUT /api/notifications/{user_id}/read_all`

This module is what the frontend polls to drive inbox and red-dot state.

## 4.12 Root Module

Section marker:

- `# --- Root ---`

Responsibilities:

- Health-style root response.

Key endpoint:

- `GET /`

## 5. Cross-Cutting Concerns

### 5.1 Notification Generation

Notifications are created from multiple modules:

- expired-game cleanup
- match application creation
- match application acceptance
- roster or reminder workflows triggered elsewhere

This is a cross-cutting concern rather than a single isolated service.

### 5.2 Email Verification and Security Flows

Email-related security logic is spread across:

- registration verification
- login verification code
- password reset code
- password change confirmation email

The common storage mechanism is `_email_codes` in memory.

### 5.3 Data Integrity Rules

Examples already embedded in route handlers:

- no duplicate top-level team names under one coach
- one application per coach per game
- only player accounts can join teams by invite code
- withdrawn roster state is protected

## 6. Runtime Flow Summary

### 6.1 Typical frontend bootstrap interaction

1. Frontend calls multiple list endpoints through `loadAllData()`.
2. Backend returns raw SQLAlchemy-backed response models.
3. Frontend maps them into camelCase objects.

### 6.2 Match application flow

1. Coach submits `POST /api/match_applications`.
2. Backend inserts application.
3. Backend creates notification for game owner.
4. Frontend notification poll receives unread notification.
5. Game owner sees inbox badge and coach-tab red dot.
6. On accept, backend updates application status, assigns opponent group, creates rosters, and notifies players.

## 7. Suggested Future Refactor Boundaries

If `main.py` is split physically, the cleanest modules are:

1. `api/auth.py`
2. `api/users.py`
3. `api/games.py`
4. `api/team_groups.py`
5. `api/clubs.py`
6. `api/match_applications.py`
7. `api/rosters.py`
8. `api/settings.py`
9. `api/notifications.py`
10. `services/email_service.py`
11. `services/notification_service.py`
12. `services/migration_service.py`
13. `schemas/*.py` for Pydantic models

Highest-value first split:

1. Move Pydantic schemas out of `main.py`.
2. Extract email helpers and notification helpers.
3. Split route groups by domain.
4. Move business rules such as application acceptance and roster generation into service functions.
