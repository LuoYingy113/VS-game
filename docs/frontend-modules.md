# Frontend Modular Documentation

## 1. Overview

The frontend is an Expo + React Native application with a single top-level app state container and role-based screens.

Core characteristics:

- `src/app/index.tsx` is the runtime composition root.
- Data is loaded from the backend through `src/api.ts`.
- Shared state is kept in React state at the top level and passed into role screens.
- Notifications and login persistence are handled through `src/storage.ts`.
- Internationalization is centralized in `src/i18n.tsx`.

This architecture is not fully component-isolated yet; it is better described as a centralized state shell with large role screens.

## 2. Module Map

### 2.1 App Shell

Primary file:

- `src/app/index.tsx`

Responsibilities:

- Application bootstrap.
- Initial full-data fetch through `loadAllData()`.
- Restoring the logged-in user from local storage.
- Polling notifications.
- Polling game reminder thresholds.
- Building `sharedState` and routing by role.
- Rendering header, inbox panel, refresh button, logout, and toast.

Important state owned here:

- `currentUser`
- `users`
- `games`
- `teamGroups`
- `matchApplications`
- `rosters`
- `adminSettings`
- `clubs`
- `inbox`
- `unreadCount`
- `coachProfileOpen`

Role routing:

- `AdminScreen`
- `CoachScreen`
- `PlayerScreen`
- `GuardianScreen`
- `LoginScreen` when no user is logged in

### 2.2 API Layer

Primary file:

- `src/api.ts`

Responsibilities:

- Defines `API_BASE_URL`.
- Wraps network requests in `apiFetch()`.
- Handles timeout and retry behavior.
- Converts backend `snake_case` payloads into frontend `camelCase` objects.
- Provides `loadAllData()` for the app shell.

Key exported functions:

- `apiFetch`
- `mapUser`
- `mapGame`
- `mapTeamGroup`
- `mapClub`
- `mapRoster`
- `mapMatchApp`
- `loadAllData`
- `calculateAge`

Design note:

The API module is both transport layer and DTO-mapping layer. That is convenient for this app size, but it means all payload shape assumptions are concentrated here.

### 2.3 Persistence and Notification Bridge

Primary file:

- `src/storage.ts`

Responsibilities:

- Saves and restores logged-in user id.
- Fetches notifications for the current user.
- Marks notifications as read.
- Stores game reminder deduplication keys.
- Sends in-app notifications through backend endpoints.

Key exported functions:

- `sendAppNotification`
- `getNotificationsForUser`
- `markAllRead`
- `getSentGameNotifs`
- `saveSentGameNotifs`
- `saveLoggedInUserId`
- `getLoggedInUserId`
- `clearLoggedInUserId`

### 2.4 Type Contracts

Primary file:

- `src/types.ts`

Responsibilities:

- Defines frontend-wide domain models.
- Makes role screens share the same object vocabulary.

Important interfaces:

- `User`
- `Game`
- `Club`
- `OfflinePlayer`
- `TeamGroup`
- `RosterEntry`
- `MatchApplication`
- `AdminSettings`
- `AppNotification`
- `ModalConfig`

This file acts as the frontend domain schema.

### 2.5 Internationalization

Primary file:

- `src/i18n.tsx`

Responsibilities:

- Holds the translation tables.
- Exposes the language provider.
- Exposes `useLanguage()`.

Languages currently included:

- English
- Chinese
- Greek

Design note:

This file is large because both translation content and language context logic live together.

## 3. Role Screens

### 3.1 Login and Registration

Primary file:

- `src/screens/LoginScreen.tsx`

Responsibilities:

- Sign in flow.
- Email-code verification flow.
- Coach registration.
- Player registration.
- Underage guardian-required branching.

Notable behaviors:

- Checks whether email already exists.
- Supports login verification code flow.
- Supports guardian info for underage players.

### 3.2 Coach Workspace

Primary file:

- `src/screens/CoachScreen.tsx`

This is the largest frontend module and effectively contains multiple submodules in one file.

Internal submodules inside `CoachScreen.tsx`:

#### A. Coach profile management

Key component:

- `CoachProfileScreen`

Responsibilities:

- Update coach phone, location, main club, sports.
- Password reset through email code.

#### B. Discover matches

Responsibilities:

- Browse public games.
- Filter by sport, age, gender.
- Unlock private game by invite code.
- Apply to games using one of the coach's teams.

Key functions:

- discover filters in the main screen body
- `openApplyToGameModal`

#### C. My games

Responsibilities:

- Show created games and accepted-away games.
- Open create-game modal.
- Show pending opponent requests.
- Accept or reject applications.
- Manage roster participation.

Key functions:

- `openCreateGameModal`
- `GameManagementCard`
- `handleAcceptOpponent`
- `handleRejectOpponent`
- `openInviteModal`

#### D. Confirmed games

Responsibilities:

- Reuse `GameManagementCard` to display locked games.
- Show opponent contact details.
- Show club + team names for home/away.

#### E. Team and club management

Responsibilities:

- Create/delete clubs.
- Create teams.
- Create subgroup variants by age/gender.
- Move or remove players.
- Add offline players.
- Edit team details.
- Display invite codes.

Key functions:

- `openManageClubsModal`
- `openAddGroupModal`
- `openAddOfflinePlayerModal`
- `openEditGroupModal`
- `confirmDeleteGroup`
- `openInviteCodeModal`
- `openMovePlayerModal`

#### F. Shared helpers embedded in coach screen

Helper functions near the bottom:

- `sportEmoji`
- `normalizeSportName`
- `parseSports`
- `matchesAgeFilter`
- `genderColor`
- `fmtDate`
- `fmtDateTime`
- `InfoRow`

Design note:

`CoachScreen.tsx` is the main candidate for future refactoring because it currently combines view logic, workflow logic, helper functions, and styling in one file.

### 3.3 Player Workspace

Primary file:

- `src/screens/PlayerScreen.tsx`

Responsibilities:

- View invitations.
- Accept game invitations.
- View schedule.
- Withdraw from games.
- Join additional teams by invite code.

Key workflows:

- `handleJoinTeamByInvite`
- `handleAcceptInvite`
- `handleWithdraw`

### 3.4 Guardian Workspace

Primary file:

- `src/screens/GuardianScreen.tsx`

Responsibilities:

- Approve child participation requests.
- View child schedules.
- Volunteer for games.

Key workflows:

- `handleApprove`
- `toggleVolunteer`

### 3.5 Admin Workspace

Primary file:

- `src/screens/AdminScreen.tsx`

Responsibilities:

- Update system settings.
- Generate coach invite codes.

Key workflows:

- `handleSaveSettings`
- `openGenerateCoachCodeModal`

## 4. Shared UI Components

Primary file:

- `src/components/shared.tsx`

Responsibilities:

- Shared colors.
- Bottom navigation button.
- Toast.
- Modal shell.
- Loading and error screens.
- Language switcher.
- Date picker field.

Key exports:

- `C`
- `NavBtn`
- `Toast`
- `AppModal`
- `LoadingScreen`
- `ErrorScreen`
- `LangSwitcher`
- `DatePickerField`

Other component files under `src/components/` are either Expo starter remnants or small helpers, but `shared.tsx` is the main reusable UI surface used by the current app flow.

## 5. Data Flow

### 5.1 Startup flow

1. `App` loads.
2. `fetchData()` calls `loadAllData()`.
3. State arrays are populated.
4. Logged-in user id is restored from local storage.
5. Matching user object is selected into `currentUser`.
6. Role screen renders.

### 5.2 Mutation flow

Typical mutation path:

1. Screen calls `apiFetch()`.
2. Backend responds with updated object.
3. Response is mapped through `map*()` if needed.
4. Screen updates top-level shared React state.
5. Dependent screens automatically re-render.

### 5.3 Notification flow

1. Backend stores notifications in the database.
2. Frontend polls `/notifications/{userId}` every 3 seconds.
3. `App` updates `inbox` and `unreadCount`.
4. Header badge and coach-tab red dot respond to current notification state.

## 6. Practical Refactor Boundaries

If this frontend is modularized further, the natural split is:

1. `src/modules/auth/`
2. `src/modules/coach/`
3. `src/modules/player/`
4. `src/modules/guardian/`
5. `src/modules/admin/`
6. `src/lib/api/`
7. `src/lib/notifications/`
8. `src/lib/i18n/`

Highest-value first extraction:

1. Break `CoachScreen.tsx` into feature files.
2. Move helper functions out of screens.
3. Move modal content blocks into dedicated components.
4. Introduce small domain services for games, teams, rosters, and notifications.
