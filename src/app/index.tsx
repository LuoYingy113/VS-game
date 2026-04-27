/**
 * Team Matcher — Main App Entry
 * 主应用入口: 状态管理、登录守卫、角色路由、通知轮询
 */
import { Bell, LogOut } from "lucide-react-native";
import React, { useCallback, useEffect, useState } from "react";
import {
    Platform,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

import { loadAllData } from "../api";
import {
    clearLoggedInUserId,
    getLoggedInUserId,
    getNotificationsForUser,
    getSentGameNotifs,
    markAllRead,
    saveLoggedInUserId,
    saveSentGameNotifs,
    sendAppNotification,
} from "../storage";
import {
    AdminSettings,
    AppNotification,
    Game,
    MatchApplication,
    RosterEntry,
    TeamGroup,
    User,
} from "../types";

import {
    C,
    ErrorScreen,
    LangSwitcher,
    LoadingScreen,
    Toast,
} from "../components/shared";
import { LanguageProvider, useLanguage } from "../i18n";
import AdminScreen from "../screens/AdminScreen";
import CoachScreen from "../screens/CoachScreen";
import GuardianScreen from "../screens/GuardianScreen";
import LoginScreen from "../screens/LoginScreen";
import PlayerScreen from "../screens/PlayerScreen";

function InboxPanel({ inbox, onClose }: { inbox: any[]; onClose: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={styles.inboxPanel}>
      <View style={styles.inboxHeader}>
        <Text style={styles.inboxTitle}>{t("notifPanelTitle")}</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={{ color: C.slate400, fontSize: 18 }}>✕</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ maxHeight: 320 }}>
        {inbox.length === 0 ? (
          <Text style={styles.inboxEmpty}>{t("noNotifsText")}</Text>
        ) : (
          inbox.slice(0, 20).map((n) => (
            <View key={n.id} style={styles.inboxItem}>
              <Text style={styles.inboxItemTitle}>{n.title}</Text>
              <Text style={styles.inboxItemBody}>{n.body}</Text>
              <Text style={styles.inboxItemTime}>
                {new Date(n.ts).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [users, setUsers] = useState<User[]>([]);
  const [games, setGames] = useState<Game[]>([]);
  const [teamGroups, setTeamGroups] = useState<TeamGroup[]>([]);
  const [matchApplications, setMatchApplications] = useState<
    MatchApplication[]
  >([]);
  const [rosters, setRosters] = useState<RosterEntry[]>([]);
  const [adminSettings, setAdminSettings] = useState<AdminSettings>({
    underageLimit: 16,
  });

  const [toast, setToast] = useState<string | null>(null);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inbox, setInbox] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // ---- Initial data load (最多自动重试 3 次) ----
  const fetchData = async () => {
    setIsLoading(true);
    setLoadError(null);
    let lastErr = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const data = await loadAllData();
        setUsers(data.users);
        setGames(data.games);
        setTeamGroups(data.teamGroups);
        setMatchApplications(data.matchApplications);
        setRosters(data.rosters);
        setAdminSettings(data.adminSettings);
        setIsLoading(false);
        return;
      } catch (err: any) {
        lastErr = err.message;
        if (attempt < 2) {
          // 等待后重试: 1s, 2s
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }
    setLoadError(lastErr);
    setIsLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ---- Restore logged-in user from storage after data loads ----
  useEffect(() => {
    if (isLoading || loadError) return;
    getLoggedInUserId().then((savedId) => {
      if (savedId && !currentUser) {
        const found = users.find((u) => u.id === savedId);
        if (found) setCurrentUser(found);
      }
    });
  }, [isLoading, users]);

  // ---- Re-fetch all data after login (so newly registered users see fresh state) ----
  const handleLogin = useCallback(async (user: User) => {
    setCurrentUser(user);
    saveLoggedInUserId(user.id);
    try {
      const data = await loadAllData();
      setUsers(data.users);
      setGames(data.games);
      setTeamGroups(data.teamGroups);
      setMatchApplications(data.matchApplications);
      setRosters(data.rosters);
      setAdminSettings(data.adminSettings);
    } catch {
      // ignore — already have data from initial load
    }
  }, []);

  // ---- In-app notification polling (every 3s) ----
  useEffect(() => {
    if (!currentUser) return;
    let active = true;
    const poll = async () => {
      const notifs = await getNotificationsForUser(currentUser.id);
      if (!active) return;
      setInbox(notifs);
      setUnreadCount(notifs.filter((n) => !n.read).length);
    };
    poll();
    const id = setInterval(poll, 3000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [currentUser]);

  // ---- Game time reminder (every 60s) ----
  useEffect(() => {
    if (!currentUser || !games.length) return;
    let active = true;
    const checkTimes = async () => {
      const now = new Date();
      const sent = await getSentGameNotifs();
      let changed = false;
      const thresholds = [
        {
          key: "60",
          minutes: 60,
          label: "Starting in 1 hour / Ξεκινά σε 1 ώρα",
        },
        {
          key: "30",
          minutes: 30,
          label: "Starting in 30 minutes / Ξεκινά σε 30 λεπτά",
        },
        {
          key: "0",
          minutes: 0,
          label: "Match is starting NOW! / Ο αγώνας ξεκινά ΤΩΡα!",
        },
      ];
      const relevant = games.filter((g) => {
        if (g.status === "cancelled") return false;
        if (currentUser.role === "coach")
          return (
            g.creatorId === currentUser.id ||
            matchApplications.some(
              (m) =>
                m.gameId === g.id &&
                m.applicantCoachId === currentUser.id &&
                m.status === "accepted",
            )
          );
        if (currentUser.role === "player")
          return rosters.some(
            (r) =>
              r.gameId === g.id &&
              r.playerId === currentUser.id &&
              r.status === "approved",
          );
        if (currentUser.role === "guardian")
          return rosters.some(
            (r) => r.gameId === g.id && r.guardianApproved === true,
          );
        return false;
      });
      for (const game of relevant) {
        const gameTime = new Date(game.time);
        const diffMin = (gameTime.getTime() - now.getTime()) / 60000;
        for (const { key, minutes, label } of thresholds) {
          const nk = `${game.id}-${key}`;
          if (
            !sent.has(nk) &&
            diffMin <= minutes + 1 &&
            diffMin >= minutes - 1
          ) {
            await sendAppNotification(
              currentUser.id,
              `⚽ ${game.sport} 比赛提醒 / Match Reminder / Υπενθύμιση Αγώνα`,
              `${label}\n📍 ${game.location}\n🕐 ${gameTime.toLocaleString()}`,
            );
            sent.add(nk);
            changed = true;
          }
        }
      }
      if (changed && active) await saveSentGameNotifs(sent);
    };
    checkTimes();
    const id = setInterval(checkTimes, 60000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [currentUser, games, matchApplications, rosters]);

  const sharedState = {
    currentUser: currentUser!,
    users,
    setUsers,
    games,
    setGames,
    teamGroups,
    setTeamGroups,
    matchApplications,
    setMatchApplications,
    rosters,
    setRosters,
    adminSettings,
    setAdminSettings,
    showToast,
    sendAppNotification,
  };

  if (isLoading)
    return (
      <LanguageProvider>
        <LoadingScreen />
      </LanguageProvider>
    );
  if (loadError)
    return (
      <LanguageProvider>
        <ErrorScreen error={loadError} onRetry={fetchData} />
      </LanguageProvider>
    );
  if (!currentUser)
    return (
      <LanguageProvider>
        <LoginScreen onLogin={handleLogin} />
      </LanguageProvider>
    );

  return (
    <LanguageProvider>
      <SafeAreaView style={styles.safeArea}>
        <StatusBar barStyle="dark-content" backgroundColor={C.white} />

        {/* ---- Header ---- */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerName}>{currentUser.name}</Text>
            <Text style={styles.headerRole}>
              {currentUser.role.toUpperCase()}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <LangSwitcher />
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={async () => {
                if (!inboxOpen) await markAllRead(currentUser.id);
                setInboxOpen((v) => !v);
              }}
            >
              {/* @ts-ignore */}
              <Bell size={20} color={C.slate400} />
              {unreadCount > 0 && (
                <View style={styles.notifBadge}>
                  <Text style={styles.notifBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.headerBtn}
              onPress={() => {
                setCurrentUser(null);
                clearLoggedInUserId();
              }}
            >
              {/* @ts-ignore */}
              <LogOut size={20} color={C.slate400} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ---- Notification Inbox ---- */}
        {inboxOpen && (
          <InboxPanel inbox={inbox} onClose={() => setInboxOpen(false)} />
        )}

        {/* ---- Role-based screen ---- */}
        <View style={{ flex: 1 }}>
          {currentUser.role === "coach" && (
            <CoachScreen state={sharedState as any} />
          )}
          {currentUser.role === "player" && (
            <PlayerScreen state={sharedState as any} />
          )}
          {currentUser.role === "guardian" && (
            <GuardianScreen state={sharedState as any} />
          )}
          {currentUser.role === "admin" && (
            <AdminScreen state={sharedState as any} />
          )}
        </View>

        <Toast message={toast} />
      </SafeAreaView>
    </LanguageProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: C.slate50,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
  },
  header: {
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderColor: C.slate200,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    zIndex: 10,
  },
  headerName: { fontSize: 17, fontWeight: "bold", color: C.slate800 },
  headerRole: {
    fontSize: 10,
    fontWeight: "700",
    color: C.slate500,
    backgroundColor: C.slate100,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 2,
    overflow: "hidden",
  },
  headerBtn: { padding: 8, position: "relative" },
  notifBadge: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: C.red,
    alignItems: "center",
    justifyContent: "center",
  },
  notifBadgeText: { fontSize: 10, color: C.white, fontWeight: "bold" },
  inboxPanel: {
    position: "absolute",
    top: 70,
    right: 8,
    width: 300,
    backgroundColor: C.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.slate200,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
    zIndex: 100,
    overflow: "hidden",
  },
  inboxHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderColor: C.slate200,
  },
  inboxTitle: { fontSize: 14, fontWeight: "bold", color: C.slate800 },
  inboxEmpty: {
    fontSize: 13,
    color: C.slate400,
    textAlign: "center",
    padding: 20,
  },
  inboxItem: { padding: 12, borderBottomWidth: 1, borderColor: C.slate100 },
  inboxItemTitle: { fontSize: 13, fontWeight: "600", color: C.slate800 },
  inboxItemBody: { fontSize: 12, color: C.slate500, marginTop: 2 },
  inboxItemTime: { fontSize: 10, color: C.slate300, marginTop: 4 },
});
