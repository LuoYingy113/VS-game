import { apiFetch } from "./api";
import { AppNotification } from "./types";

// ==========================================
// 通知工具 — 基于服务端 API (server-backed)
// ==========================================

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
