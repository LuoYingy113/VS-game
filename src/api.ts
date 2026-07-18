import {
    AdminSettings,
    Club,
    Game,
    MatchApplication,
    OfflinePlayer,
    RosterEntry,
    TeamGroup,
    User,
} from "./types";

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
export const mapUser = (u: any): User => ({
  id: u.id,
  role: u.role,
  name: u.name,
  email: u.email,
  phone: u.phone || null,
  dob: u.dob || null,
  guardianId: u.guardian_id || null,
  bio: u.bio || null,
  sport: u.sport || null,
  status: u.status || "active",
  defaultLocation: u.default_location || null,
  defaultClubId: u.default_club_id || null,
});

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
});

export const mapRoster = (r: any): RosterEntry => ({
  id: r.id,
  gameId: r.game_id,
  playerId: r.player_id,
  status: r.status,
  guardianApproved: r.guardian_approved || false,
  withdrawReason: r.withdraw_reason || null,
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
