import {
  AdminSettings,
  AppRole,
  Club,
  CoachPlayerNote,
  Game,
  MatchApplication,
  OfflinePlayer,
  RosterEntry,
  TeamGroup,
  User,
} from "./types";

const KNOWN_ROLES: AppRole[] = ["coach", "player", "guardian", "admin"];

const MAX_SURNAME_LEN = 9;

export const formatUserDisplayName = (u: any): string => {
  const rawFirst = (u?.first_name ?? u?.firstName ?? "").toString().trim();
  const rawLast = (u?.last_name ?? u?.lastName ?? "").toString().trim();
  const fallbackName = (u?.name ?? "").toString().trim();

  let first = rawFirst;
  let last = rawLast;

  if (!last && first) {
    const parts = first.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = parts[0];
      last = parts.slice(1).join(" ");
    }
  }

  if (!last && fallbackName) {
    const parts = fallbackName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      first = first || parts[0];
      last = parts.slice(1).join(" ");
    }
  }

  if (last) {
    const clippedLast =
      last.length > MAX_SURNAME_LEN
        ? `${last.slice(0, MAX_SURNAME_LEN)}...`
        : last;
    const initial = first ? `${first.charAt(0).toUpperCase()}.` : "";
    return initial ? `${clippedLast} ${initial}` : clippedLast;
  }

  return first || fallbackName;
};

function parseUserRoles(rawRole: unknown): AppRole[] {
  const rawTokens = Array.isArray(rawRole)
    ? rawRole.map((v) => String(v))
    : String(rawRole || "")
        .split(/[\s,，;|/]+/)
        .map((v) => v.trim())
        .filter(Boolean);
  const roles = rawTokens
    .map((token) => token.toLowerCase())
    .filter((token): token is AppRole =>
      KNOWN_ROLES.includes(token as AppRole),
    );
  return Array.from(new Set(roles));
}

// ==========================================
// 后端 API 配置（来自 .env: EXPO_PUBLIC_API_BASE_URL）
// ==========================================
const RAW_API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
export const API_BASE_URL = (
  RAW_API_BASE_URL || "https://135.125.134.199.sslip.io/api"
).replace(/\/$/, "");

// ==========================================
// API 请求封装 (带超时 + 自动重试)
// ==========================================
const TIMEOUT_MS = 8000; // 单次请求超时
const MAX_RETRIES = 2; // 失败后最多重试次数 (首次 + 2次 = 3次)

export const apiFetch = async (
  path: string,
  options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {},
  _attempt = 0,
): Promise<any> => {
  const { body, ...restOptions } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      ...restOptions,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ detail: `HTTP ${res.status}` }));
      throw new Error(err.detail || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
  } catch (err: any) {
    clearTimeout(timer);
    // 只对网络/超时错误重试，4xx 业务错误不重试
    const isNetworkError =
      err.name === "AbortError" || err.message === "Network request failed";
    if (isNetworkError && _attempt < MAX_RETRIES) {
      // 指数退避: 1s, 2s
      await new Promise((r) => setTimeout(r, 1000 * (_attempt + 1)));
      return apiFetch(path, options, _attempt + 1);
    }
    if (err.name === "AbortError")
      throw new Error("Request timed out — check server connection");
    throw err;
  }
};

// ==========================================
// 数据映射 (snake_case → camelCase)
// ==========================================
export const mapUser = (u: any): User => {
  const rolesFromRole = parseUserRoles(u.role);
  const rolesFromAvailable = parseUserRoles(u.available_roles ?? u.availableRoles);
  const availableRoles = Array.from(
    new Set([...rolesFromAvailable, ...rolesFromRole]),
  );
  const firstName = (u.first_name ?? u.firstName ?? "").toString().trim();
  const lastName = (u.last_name ?? u.lastName ?? "").toString().trim();
  const displayName = formatUserDisplayName(u);
  return {
    id: u.id,
    role: availableRoles[0] || "player",
    availableRoles: availableRoles.length > 0 ? availableRoles : ["player"],
    name: displayName,
    firstName: firstName || null,
    lastName: lastName || null,
    email: u.email,
    phone: u.phone || null,
    dob: u.dob || null,
    guardianId: u.guardian_id || null,
    bio: u.bio || null,
    sport: u.sport || null,
    status: u.status || "active",
    defaultLocation: u.default_location || null,
    defaultClubId: u.default_club_id || null,
    gamesPlayedCount: Number(u.games_played_count ?? 0) || 0,
    jerseyNumber: u.jersey_number ?? u.jerseyNumber ?? null,
  };
};

export const mapGame = (g: any): Game => ({
  id: g.id,
  creatorId: g.creator_id,
  sport: g.sport,
  time: g.time,
  location: g.location,
  ageGroup: g.age_group,
  gender: g.gender || null,
  deadline: g.deadline || "",
  description: g.description || "",
  contactPhone: g.contact_phone || null,
  status: g.status,
  opposingTeamId: g.opposing_team_id || null,
  homeGroupId: g.home_group_id || null,
  opposingGroupId: g.opposing_group_id || null,
  volunteers: g.volunteers || [],
  isPrivate: g.is_private ?? false,
  gameInviteCode: g.game_invite_code || null,
  occurrenceCounted: g.occurrence_counted ?? false,
  strictAgeMatch: g.strict_age_match ?? false,
});

export const mapTeamGroup = (tg: any): TeamGroup => ({
  id: tg.id,
  coachId: tg.coach_id,
  name: tg.team_name,
  playerIds: tg.player_ids || [],
  offlinePlayers: (tg.offline_players || []).map(
    (p: any): OfflinePlayer => ({
      id: p.id,
      name: p.name,
      bindCode: p.bind_code || null,
    }),
  ),
  inviteCode: tg.invite_code || null,
  ageGroup: tg.age_group || null,
  gender: tg.gender || null,
  clubId: tg.club_id || null,
  sport: tg.sport || null,
});

export const mapClub = (c: any): Club => ({
  id: c.id,
  coachId: c.coach_id,
  name: c.name,
  defaultLocation: c.default_location || null,
});

export const mapRoster = (r: any): RosterEntry => ({
  id: r.id,
  gameId: r.game_id,
  playerId: r.player_id,
  status: r.status,
  guardianApproved: r.guardian_approved || false,
  withdrawReason: r.withdraw_reason || null,
});

export const mapCoachPlayerNote = (n: any): CoachPlayerNote => ({
  id: n.id || `${n.coach_id}:${n.player_id}`,
  coachId: n.coach_id,
  playerId: n.player_id,
  nickname: n.nickname || "",
});

export const mapMatchApp = (a: any): MatchApplication => ({
  id: a.id,
  gameId: a.game_id,
  applicantCoachId: a.applicant_coach_id,
  applicantGroupId: a.applicant_group_id || null,
  status: a.status,
});

// ==========================================
// 加载全部初始数据
// ==========================================
export const loadAllData = async () => {
  const [
    usersData,
    gamesData,
    groupsData,
    applicationsData,
    rostersData,
    settingsData,
    clubsData,
  ] = await Promise.all([
    apiFetch("/users"),
    apiFetch("/games"),
    apiFetch("/team_groups"),
    apiFetch("/match_applications"),
    apiFetch("/rosters"),
    apiFetch("/settings"),
    apiFetch("/clubs"),
  ]);
  return {
    users: (usersData as any[]).map(mapUser),
    games: (gamesData as any[]).map(mapGame),
    teamGroups: (groupsData as any[]).map(mapTeamGroup),
    matchApplications: (applicationsData as any[]).map(mapMatchApp),
    rosters: (rostersData as any[]).map(mapRoster),
    adminSettings: {
      underageLimit: (settingsData as any).underage_limit,
    } as AdminSettings,
    clubs: (clubsData as any[]).map(mapClub),
  };
};

export const getGameOccurrenceConfirmations = async (
  coachId: string,
): Promise<Record<string, boolean>> => {
  const data = await apiFetch(
    `/game_occurrence_confirmations?coachId=${encodeURIComponent(coachId)}`,
  );
  const map: Record<string, boolean> = {};
  (data as any[]).forEach((item) => {
    if (item?.game_id) {
      map[item.game_id] = Boolean(item.confirmed);
    }
  });
  return map;
};

export const getGameOccurrenceConfirmationSnapshot = async (
  coachId: string,
): Promise<{
  submittedByMe: Record<string, boolean>;
  confirmedByMe: Record<string, boolean>;
  peerSubmittedByGame: Record<string, boolean>;
  gameCountedByGame: Record<string, boolean>;
}> => {
  const data = await apiFetch(
    `/game_occurrence_confirmations?coachId=${encodeURIComponent(coachId)}`,
  );
  const submittedByMe: Record<string, boolean> = {};
  const confirmedByMe: Record<string, boolean> = {};
  const peerSubmittedByGame: Record<string, boolean> = {};
  const gameCountedByGame: Record<string, boolean> = {};
  (data as any[]).forEach((item) => {
    if (!item?.game_id) return;
    submittedByMe[item.game_id] = true;
    confirmedByMe[item.game_id] = Boolean(item.confirmed);
    peerSubmittedByGame[item.game_id] = Boolean(item.peer_submitted);
    gameCountedByGame[item.game_id] = Boolean(item.game_counted);
  });
  return {
    submittedByMe,
    confirmedByMe,
    peerSubmittedByGame,
    gameCountedByGame,
  };
};

export const setGameOccurrenceConfirmation = async (
  gameId: string,
  coachId: string,
  confirmed: boolean,
): Promise<{
  confirmation: { gameId: string; coachId: string; confirmed: boolean };
  gameCounted: boolean;
  creatorGamesPlayedCount: number;
  opposingCoachGamesPlayedCount: number | null;
}> => {
  const data = await apiFetch(`/games/${gameId}/occurrence_confirmation`, {
    method: "POST",
    body: { coachId, confirmed },
  });
  return {
    confirmation: {
      gameId: data.confirmation.game_id,
      coachId: data.confirmation.coach_id,
      confirmed: data.confirmation.confirmed,
    },
    gameCounted: Boolean(data.game_counted),
    creatorGamesPlayedCount: Number(data.creator_games_played_count ?? 0) || 0,
    opposingCoachGamesPlayedCount:
      data.opposing_coach_games_played_count === null ||
      data.opposing_coach_games_played_count === undefined
        ? null
        : Number(data.opposing_coach_games_played_count) || 0,
  };
};

export const getCoachPlayerNotes = async (
  coachId: string,
): Promise<CoachPlayerNote[]> => {
  const data = await apiFetch(
    `/coach_player_notes?coachId=${encodeURIComponent(coachId)}`,
  );
  return (data as any[]).map(mapCoachPlayerNote);
};

export const saveCoachPlayerNote = async (
  coachId: string,
  playerId: string,
  nickname: string,
): Promise<CoachPlayerNote | null> => {
  const data = await apiFetch("/coach_player_notes", {
    method: "PUT",
    body: { coachId, playerId, nickname },
  });
  return data?.nickname ? mapCoachPlayerNote(data) : null;
};

// ==========================================
// 年龄计算工具
// ==========================================
export const calculateAge = (dob: string | null): number => {
  if (!dob) return 0;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
};
