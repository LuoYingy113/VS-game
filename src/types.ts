// ==========================================
// 数据类型定义 (Data Types)
// ==========================================

export interface User {
  id: string;
  role: 'coach' | 'player' | 'guardian' | 'admin';
  name: string;
  email: string;
  phone: string | null;
  dob: string | null;
  guardianId: string | null;
  bio: string | null;
  sport: string | null;
  status: 'active' | 'inactive';
}

export interface Game {
  id: string;
  creatorId: string;
  sport: string;
  time: string;
  location: string;
  ageGroup: string;
  deadline: string;
  description: string;
  contactPhone: string | null;
  status: 'open' | 'locked' | 'cancelled';
  opposingTeamId: string | null;
  volunteers: string[];
}

export interface TeamGroup {
  id: string;
  coachId: string;
  name: string;
  playerIds: string[];
  inviteCode: string | null;
}

export interface RosterEntry {
  id: string;
  gameId: string;
  playerId: string;
  status: 'invited' | 'pending_guardian' | 'pending_coach' | 'approved' | 'withdrawn';
  guardianApproved: boolean;
  withdrawReason: string | null;
}

export interface MatchApplication {
  id: string;
  gameId: string;
  applicantCoachId: string;
  status: 'pending' | 'accepted' | 'rejected';
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
