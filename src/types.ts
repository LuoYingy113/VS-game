// ==========================================
// 数据类型定义 (Data Types)
// ==========================================

export interface User {
  id: string;
  role: "coach" | "player" | "guardian" | "admin";
  name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  guardianId: string | null;
  bio: string | null;
  sport: string | null;
  status: "active" | "inactive";
  defaultLocation: string | null;
  defaultClubId: string | null;
}

export interface Game {
  id: string;
  creatorId: string;
  sport: string;
  time: string;
  location: string;
  ageGroup: string;
  gender: "male" | "female" | "mixed" | null;
  deadline: string;
  description: string;
  contactPhone: string | null;
  status: "open" | "locked" | "cancelled";
  opposingTeamId: string | null;
  homeGroupId: string | null;
  opposingGroupId: string | null;
  volunteers: string[];
  isPrivate: boolean;
  gameInviteCode: string | null;
}

export interface Club {
  id: string;
  coachId: string;
  name: string;
}

export interface OfflinePlayer {
  id: string;
  name: string;
  bindCode: string | null;
}

export interface TeamGroup {
  id: string;
  coachId: string;
  name: string;
  playerIds: string[];
  offlinePlayers: OfflinePlayer[];
  inviteCode: string | null;
  ageGroup: string | null;
  gender: "male" | "female" | "mixed" | null;
  clubId: string | null;
  sport: string | null;
}

export interface RosterEntry {
  id: string;
  gameId: string;
  playerId: string;
  status:
    | "invited"
    | "pending_guardian"
    | "pending_coach"
    | "approved"
    | "not_participating"
    | "withdrawn";
  guardianApproved: boolean;
  withdrawReason: string | null;
}

export interface MatchApplication {
  id: string;
  gameId: string;
  applicantCoachId: string;
  applicantGroupId: string | null;
  status: "pending" | "accepted" | "rejected";
}

export interface AdminSettings {
  underageLimit: number;
}

export interface AppNotification {
  id: string;
  targetUserId: string;
  title: string;
  body: string;
  read: boolean;
  ts: number;
}

export interface ModalConfig {
  title: string;
  content: React.ReactNode;
}
