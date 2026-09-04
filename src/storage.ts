import { apiFetch } from "./api";
import { AppNotification } from "./types";

// ==========================================
// 通知工具 — 基于服务端 API (server-backed)
// ==========================================

/**
 * Build a deferred i18n notification string.
 * Format: `i18n:KEY|param1=encodedValue1|param2=encodedValue2`
 * Rendered at display time by `renderNotifText` in index.tsx so it
 * automatically updates when the user switches language.
 */
export function notifI18n(
  key: string,
  params?: Record<string, string>,
): string {
  const parts = [`i18n:${key}`];
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      if (value != null) {
        parts.push(`${name}=${encodeURIComponent(String(value))}`);
      }
    }
  }
  return parts.join("|");
}

export const sendAppNotification = async (
  targetUserId: string,
  title: string,
  body: string,
): Promise<void> => {
  try {
    await apiFetch("/notifications", {
      method: "POST",
      body: { targetUserId, title, body },
    });
  } catch (e) {
    console.warn("sendAppNotification error", e);
  }
};

export const getNotificationsForUser = async (
  userId: string,
): Promise<AppNotification[]> => {
  try {
    const data = await apiFetch(`/notifications/${userId}`);
    return (data as any[]).map((n) => ({
      id: n.id,
      targetUserId: n.target_user_id,
      title: n.title,
      body: n.body,
      read: n.read,
      ts: new Date(n.ts).getTime(),
    }));
  } catch {
    return [];
  }
};

export const markAllRead = async (userId: string): Promise<void> => {
  try {
    await apiFetch(`/notifications/${userId}/read_all`, { method: "PUT" });
  } catch (e) {
    console.warn("markAllRead error", e);
  }
};

// ==========================================
// 游戏提醒发送记录 (本地去重, AsyncStorage)
// ==========================================
import AsyncStorage from "@react-native-async-storage/async-storage";

const SENT_GAME_NOTIFS_KEY = "sentGameNotifs";

export const getSentGameNotifs = async (): Promise<Set<string>> => {
  try {
    const raw = await AsyncStorage.getItem(SENT_GAME_NOTIFS_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch {
    return new Set();
  }
};

export const saveSentGameNotifs = async (sent: Set<string>): Promise<void> => {
  try {
    await AsyncStorage.setItem(SENT_GAME_NOTIFS_KEY, JSON.stringify([...sent]));
  } catch (e) {
    console.warn("saveSentGameNotifs error", e);
  }
};

// ==========================================
// 持久化登录 (Persistent Login)
// ==========================================
const LOGGED_IN_USER_KEY = "loggedInUserId";
const COACH_GAME_HISTORY_NOTES_PREFIX = "coachGameHistoryNotes:";
const COACH_GAME_HISTORY_RESULTS_PREFIX = "coachGameHistoryResults:";
const COACH_CANCELLATION_COUNT_PREFIX = "coachCancellationCount:";

type CoachHistoryPayload = {
  notes: Record<string, string>;
  results: Record<string, "win" | "lose">;
};

export const saveLoggedInUserId = async (userId: string): Promise<void> => {
  try {
    await AsyncStorage.setItem(LOGGED_IN_USER_KEY, userId);
  } catch (e) {
    console.warn("saveLoggedInUserId error", e);
  }
};

export const getLoggedInUserId = async (): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(LOGGED_IN_USER_KEY);
  } catch {
    return null;
  }
};

export const clearLoggedInUserId = async (): Promise<void> => {
  try {
    await AsyncStorage.removeItem(LOGGED_IN_USER_KEY);
  } catch (e) {
    console.warn("clearLoggedInUserId error", e);
  }
};

export const getCoachGameHistoryNotes = async (
  coachId: string,
): Promise<Record<string, string>> => {
  const payload = await getCoachGameHistory(coachId);
  return payload.notes;
};

export const saveCoachGameHistoryNotes = async (
  coachId: string,
  notes: Record<string, string>,
): Promise<void> => {
  const existing = await getCoachGameHistory(coachId);
  await saveCoachGameHistory(coachId, notes, existing.results);
};

export const getCoachGameHistoryResults = async (
  coachId: string,
): Promise<Record<string, "win" | "lose">> => {
  const payload = await getCoachGameHistory(coachId);
  return payload.results;
};

export const saveCoachGameHistoryResults = async (
  coachId: string,
  results: Record<string, "win" | "lose">,
): Promise<void> => {
  const existing = await getCoachGameHistory(coachId);
  await saveCoachGameHistory(coachId, existing.notes, results);
};

export const getCoachGameHistory = async (
  coachId: string,
): Promise<CoachHistoryPayload> => {
  try {
    const data = await apiFetch(
      `/coach_game_history?coachId=${encodeURIComponent(coachId)}`,
    );
    const apiNotes =
      data?.notes && typeof data.notes === "object" ? data.notes : {};
    const apiResults =
      data?.results && typeof data.results === "object" ? data.results : {};

    const normalizedNotes: Record<string, string> = {};
    Object.entries(apiNotes).forEach(([gameId, note]) => {
      const id = String(gameId || "").trim();
      const text = String(note || "").trim();
      if (id && text) normalizedNotes[id] = text;
    });

    const normalizedResults: Record<string, "win" | "lose"> = {};
    Object.entries(apiResults).forEach(([gameId, value]) => {
      if (value === "win" || value === "lose") {
        normalizedResults[gameId] = value;
      }
    });

    await Promise.all([
      AsyncStorage.setItem(
        `${COACH_GAME_HISTORY_NOTES_PREFIX}${coachId}`,
        JSON.stringify(normalizedNotes),
      ),
      AsyncStorage.setItem(
        `${COACH_GAME_HISTORY_RESULTS_PREFIX}${coachId}`,
        JSON.stringify(normalizedResults),
      ),
    ]);

    return { notes: normalizedNotes, results: normalizedResults };
  } catch (e) {
    console.warn("getCoachGameHistory remote fetch failed, use local cache", e);
    try {
      const [rawNotes, rawResults] = await Promise.all([
        AsyncStorage.getItem(`${COACH_GAME_HISTORY_NOTES_PREFIX}${coachId}`),
        AsyncStorage.getItem(`${COACH_GAME_HISTORY_RESULTS_PREFIX}${coachId}`),
      ]);
      const parsedNotes = rawNotes ? JSON.parse(rawNotes) : {};
      const parsedResults = rawResults ? JSON.parse(rawResults) : {};
      const notes =
        parsedNotes && typeof parsedNotes === "object" ? parsedNotes : {};
      const results: Record<string, "win" | "lose"> = {};
      if (parsedResults && typeof parsedResults === "object") {
        Object.entries(parsedResults).forEach(([gameId, value]) => {
          if (value === "win" || value === "lose") {
            results[gameId] = value;
          }
        });
      }
      return { notes, results };
    } catch (localErr) {
      console.warn("getCoachGameHistory local fallback failed", localErr);
      return { notes: {}, results: {} };
    }
  }
};

export const saveCoachGameHistory = async (
  coachId: string,
  notes: Record<string, string>,
  results: Record<string, "win" | "lose">,
): Promise<void> => {
  const normalizedNotes: Record<string, string> = {};
  Object.entries(notes || {}).forEach(([gameId, note]) => {
    const id = String(gameId || "").trim();
    const text = String(note || "").trim();
    if (id && text) normalizedNotes[id] = text;
  });

  const normalizedResults: Record<string, "win" | "lose"> = {};
  Object.entries(results || {}).forEach(([gameId, value]) => {
    if (value === "win" || value === "lose") {
      normalizedResults[gameId] = value;
    }
  });

  try {
    await apiFetch("/coach_game_history", {
      method: "PUT",
      body: {
        coachId,
        notes: normalizedNotes,
        results: normalizedResults,
      },
    });
  } catch (e) {
    console.warn("saveCoachGameHistory remote sync failed", e);
  }

  try {
    await Promise.all([
      AsyncStorage.setItem(
        `${COACH_GAME_HISTORY_NOTES_PREFIX}${coachId}`,
        JSON.stringify(normalizedNotes),
      ),
      AsyncStorage.setItem(
        `${COACH_GAME_HISTORY_RESULTS_PREFIX}${coachId}`,
        JSON.stringify(normalizedResults),
      ),
    ]);
  } catch (e) {
    console.warn("saveCoachGameHistory local cache failed", e);
  }
};

export const getCoachCancellationCount = async (
  coachId: string,
): Promise<number> => {
  try {
    const raw = await AsyncStorage.getItem(
      `${COACH_CANCELLATION_COUNT_PREFIX}${coachId}`,
    );
    const parsed = Number(raw ?? "0");
    return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : 0;
  } catch (e) {
    console.warn("getCoachCancellationCount error", e);
    return 0;
  }
};

export const incrementCoachCancellationCount = async (
  coachId: string,
): Promise<number> => {
  const nextCount = (await getCoachCancellationCount(coachId)) + 1;
  try {
    await AsyncStorage.setItem(
      `${COACH_CANCELLATION_COUNT_PREFIX}${coachId}`,
      String(nextCount),
    );
  } catch (e) {
    console.warn("incrementCoachCancellationCount error", e);
  }
  return nextCount;
};
