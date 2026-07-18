/**
 * 球员仪表盘 (Player Dashboard)
 * 对应 App.jsx 的 PlayerView
 */
import { Calendar, Mail, Trophy } from "lucide-react-native";
import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch, calculateAge, mapTeamGroup } from "../api";
import { AppModal, C, NavBtn } from "../components/shared";
import { useLanguage } from "../i18n";
import { sendAppNotification } from "../storage";
import {
    AdminSettings,
    Club,
    Game,
    ModalConfig,
    RosterEntry,
    TeamGroup,
    User,
} from "../types";

interface PlayerState {
  currentUser: User;
  games: Game[];
  rosters: RosterEntry[];
  setRosters: React.Dispatch<React.SetStateAction<RosterEntry[]>>;
  adminSettings: AdminSettings;
  users: User[];
  teamGroups: TeamGroup[];
  setTeamGroups: React.Dispatch<React.SetStateAction<TeamGroup[]>>;
  clubs: Club[];
  showToast: (msg: string) => void;
}

export default function PlayerScreen({ state }: { state: PlayerState }) {
  const {
    currentUser,
    games,
    rosters,
    setRosters,
    adminSettings,
    users,
    teamGroups,
    setTeamGroups,
    clubs,
    showToast,
  } = state;
  const { t } = useLanguage();

  const [tab, setTab] = useState<"invites" | "my_games" | "confirmed">(
    "invites",
  );
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [joiningTeam, setJoiningTeam] = useState(false);

  const myRosters = rosters.filter((r) => r.playerId === currentUser.id);
  const invites = myRosters.filter((r) => r.status === "invited");
  const activeGames = myRosters.filter(
    (r) =>
      r.status === "approved" ||
      r.status === "pending_coach" ||
      r.status === "pending_guardian",
  );

  const age = calculateAge(currentUser.dob);

  const joinedTeams = teamGroups.filter((tg) =>
    tg.playerIds.includes(currentUser.id),
  );

  const handleJoinTeamByInvite = async () => {
    const code = joinInviteCode.trim().toUpperCase();
    if (!code) {
      showToast(t("joinTeamCodeRequired"));
      return;
    }
    setJoiningTeam(true);
    try {
      const data = await apiFetch("/team_groups/join_by_invite", {
        method: "POST",
        body: { playerId: currentUser.id, inviteCode: code },
      });
      const group = mapTeamGroup(data);
      setTeamGroups((prev) => {
        const idx = prev.findIndex((g) => g.id === group.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = group;
          return next;
        }
        return [...prev, group];
      });
      setJoinInviteCode("");
      showToast(t("joinedTeamSuccess").replace("{team}", group.name));
    } catch (err: any) {
      showToast("Failed: " + err.message);
    } finally {
      setJoiningTeam(false);
    }
  };

  const handleAcceptInvite = async (entry: RosterEntry) => {
    const newStatus =
      age < adminSettings.underageLimit ? "pending_guardian" : "approved";
    try {
      await apiFetch(`/rosters/${entry.id}/status`, {
        method: "PUT",
        body: { status: newStatus },
      });
      setRosters((prev) =>
        prev.map((r) =>
          r.id === entry.id ? { ...r, status: newStatus as any } : r,
        ),
      );
      showToast(
        newStatus === "pending_guardian"
          ? t("guardianSentToast").replace("{age}", String(age))
          : t("appliedWaitingToast"),
      );
    } catch (err: any) {
      showToast("Failed: " + err.message);
    }
  };

  const handleWithdraw = (entry: RosterEntry) => {
    const WithdrawContent = () => {
      const { t } = useLanguage();
      const [reason, setReason] = useState("");
      const submit = async () => {
        if (!reason.trim()) {
          showToast(t("reasonRequired"));
          return;
        }
        try {
          await apiFetch(`/rosters/${entry.id}/status`, {
            method: "PUT",
            body: { status: "withdrawn", withdraw_reason: reason },
          });
          setRosters((prev) =>
            prev.map((r) =>
              r.id === entry.id
                ? { ...r, status: "withdrawn", withdrawReason: reason }
                : r,
            ),
          );

          // 通知教练
          const game = games.find((g) => g.id === entry.gameId);
          const gameLabel = game ? `${game.sport} @ ${game.location}` : "game";
          const coachIds = new Set<string>(
            teamGroups
              .filter((tg) => tg.playerIds.includes(currentUser.id))
              .map((tg) => tg.coachId),
          );
          if (game) coachIds.add(game.creatorId);
          coachIds.forEach((coachId) =>
            sendAppNotification(
              coachId,
              `⚠️ ${currentUser.name} 请假 / Withdrawal`,
              `${currentUser.name} withdrew from "${gameLabel}". Reason: ${reason}`,
            ),
          );

          setModal(null);
          showToast(t("withdrawalSubmitted"));
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      return (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 13, color: C.slate600 }}>
            {t("withdrawReasonPrompt")}
          </Text>
          <TextInput
            style={[s.textarea]}
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Sick, twisted ankle…"
            placeholderTextColor={C.slate400}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.red }]}
            onPress={submit}
          >
            <Text style={s.btnText}>{t("submitWithdrawalBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({ title: t("withdrawTitle"), content: <WithdrawContent /> });
  };

  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.scrollContent}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
      >
        {/* Profile banner */}
        <View style={s.profileBanner}>
          <View>
            <Text style={s.profileLabel}>{t("profileInfoBanner")}</Text>
            <Text style={s.profileValue}>
              {t("ageYearsDisplay").replace("{age}", String(age))}
            </Text>
          </View>
          {age < adminSettings.underageLimit && (
            <View style={s.underageBadge}>
              <Text style={s.underageText}>{t("underageProfileBadge")}</Text>
            </View>
          )}
        </View>

        <View style={s.joinTeamBox}>
          <Text style={s.joinTeamTitle}>{t("joinTeamTitle")}</Text>
          <Text style={s.joinTeamHint}>{t("joinTeamHint")}</Text>
          <View style={[s.searchRow, { marginTop: 8, marginBottom: 8 }]}>
            <TextInput
              style={s.searchInput}
              value={joinInviteCode}
              onChangeText={setJoinInviteCode}
              placeholder={t("joinTeamCodePlaceholder")}
              placeholderTextColor={C.slate400}
              autoCapitalize="characters"
            />
          </View>
          <TouchableOpacity
            style={[s.btn, joiningTeam && s.btnDisabled]}
            onPress={handleJoinTeamByInvite}
            disabled={joiningTeam}
          >
            <Text style={s.btnText}>
              {joiningTeam ? t("loading") : t("joinTeamBtn")}
            </Text>
          </TouchableOpacity>
          <Text style={s.joinedTeamsText}>
            {t("joinedTeamsCount").replace(
              "{count}",
              String(joinedTeams.length),
            )}
          </Text>
        </View>

        {/* ===== INVITES TAB ===== */}
        {tab === "invites" && (
          <View>
            <Text style={s.sectionTitle}>{t("gameInvitationsLabel")}</Text>
            {invites.length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>{t("noPendingInvites")}</Text>
              </View>
            )}
            {invites.map((inv) => {
              const game = games.find((g) => g.id === inv.gameId);
              if (!game) return null;
              const homeGroup = teamGroups.find(
                (tg) => tg.id === game.homeGroupId,
              );
              const homeGroupClub = homeGroup?.clubId
                ? clubs.find((c) => c.id === homeGroup.clubId)
                : null;
              const creatorCoach = users.find((u) => u.id === game.creatorId);
              const creatorClub = creatorCoach?.defaultClubId
                ? clubs.find((c) => c.id === creatorCoach.defaultClubId)
                : null;
              const displayClub = homeGroupClub ?? creatorClub;
              return (
                <View key={inv.id} style={s.inviteCard}>
                  <View style={s.inviteStripe} />
                  <Text style={s.cardTitle}>
                    {displayClub
                      ? displayClub.name
                      : (creatorCoach?.name ?? game.sport)}{" "}
                    Match
                  </Text>
                  <Text style={s.metaText}>
                    📅 {new Date(game.time).toLocaleString()}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      Linking.openURL(
                        `https://maps.google.com/?q=${encodeURIComponent(game.location)}`,
                      )
                    }
                  >
                    <Text style={[s.metaText, { color: "#2563eb" }]}>
                      📍 {game.location}
                    </Text>
                  </TouchableOpacity>
                  {!!game.contactPhone && (
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(`tel:${game.contactPhone!}`)
                      }
                    >
                      <Text style={[s.metaText, { color: "#16a34a" }]}>
                        📞 {game.contactPhone}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {!!game.description && (
                    <View style={s.descBox}>
                      <Text style={s.hintText}>{game.description}</Text>
                    </View>
                  )}
                  <TouchableOpacity
                    style={[s.btn, { marginTop: 10 }]}
                    onPress={() => handleAcceptInvite(inv)}
                  >
                    <Text style={s.btnText}>{t("acceptInvitationBtn")}</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {/* ===== MY SCHEDULE TAB ===== */}
        {tab === "my_games" && (
          <View>
            <Text style={s.sectionTitle}>{t("myScheduleLabel")}</Text>
            {activeGames.length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>{t("noUpcomingGames")}</Text>
              </View>
            )}
            {activeGames.map((ag) => {
              const game = games.find((g) => g.id === ag.gameId);
              if (!game) return null;
              const homeGroup = teamGroups.find(
                (tg) => tg.id === game.homeGroupId,
              );
              const homeGroupClub = homeGroup?.clubId
                ? clubs.find((c) => c.id === homeGroup.clubId)
                : null;
              const creatorCoach = users.find((u) => u.id === game.creatorId);
              const creatorClub = creatorCoach?.defaultClubId
                ? clubs.find((c) => c.id === creatorCoach.defaultClubId)
                : null;
              const displayClub = homeGroupClub ?? creatorClub;
              let badge: React.ReactNode;
              if (ag.status === "pending_guardian")
                badge = (
                  <Text
                    style={[
                      s.pill,
                      { backgroundColor: "#f5f3ff", color: C.purple },
                    ]}
                  >
                    {t("awaitingGuardianStatus")}
                  </Text>
                );
              else if (ag.status === "pending_coach")
                badge = (
                  <Text
                    style={[
                      s.pill,
                      { backgroundColor: "#fefce8", color: C.yellow },
                    ]}
                  >
                    {t("awaitingCoachStatus")}
                  </Text>
                );
              else if (ag.status === "approved")
                badge = (
                  <Text
                    style={[
                      s.pill,
                      { backgroundColor: "#dcfce7", color: C.green },
                    ]}
                  >
                    {t("approvedStatus")}
                  </Text>
                );
              return (
                <View key={ag.id} style={s.card}>
                  <View style={s.rowBetween}>
                    <Text style={s.cardTitle}>
                      {displayClub
                        ? displayClub.name
                        : (creatorCoach?.name ?? game.sport)}{" "}
                      Match
                    </Text>
                    {badge}
                  </View>
                  <Text style={s.metaText}>
                    {new Date(game.time).toLocaleDateString()}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      Linking.openURL(
                        `https://maps.google.com/?q=${encodeURIComponent(game.location)}`,
                      )
                    }
                  >
                    <Text style={[s.metaText, { color: "#2563eb" }]}>
                      📍 {game.location}
                    </Text>
                  </TouchableOpacity>
                  {!!game.contactPhone && (
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(`tel:${game.contactPhone!}`)
                      }
                    >
                      <Text style={[s.metaText, { color: "#16a34a" }]}>
                        📞 {game.contactPhone}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {!!game.description && (
                    <View style={s.descBox}>
                      <Text style={s.hintText}>{game.description}</Text>
                    </View>
                  )}
                  {ag.status === "approved" && (
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 8,
                      }}
                      onPress={() => handleWithdraw(ag)}
                    >
                      <Text
                        style={{
                          color: C.red,
                          fontSize: 13,
                          fontWeight: "500",
                        }}
                      >
                        {t("withdrawFromGameLink")}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ===== CONFIRMED TAB ===== */}
        {tab === "confirmed" && (
          <View>
            <Text style={s.sectionTitle}>{t("confirmedGamesLabel")}</Text>
            {myRosters.filter((r) => {
              const g = games.find((gm) => gm.id === r.gameId);
              return r.status === "approved" && g?.status === "locked";
            }).length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>{t("noConfirmedGames")}</Text>
              </View>
            )}
            {myRosters
              .filter((r) => {
                const g = games.find((gm) => gm.id === r.gameId);
                return r.status === "approved" && g?.status === "locked";
              })
              .map((r) => {
                const game = games.find((g) => g.id === r.gameId);
                if (!game) return null;
                const homeCoach = users.find((u) => u.id === game.creatorId);
                const awayCoach = game.opposingTeamId
                  ? users.find((u) => u.id === game.opposingTeamId)
                  : null;
                return (
                  <View
                    key={r.id}
                    style={[
                      s.card,
                      { borderLeftWidth: 4, borderLeftColor: C.green },
                    ]}
                  >
                    <Text style={s.cardTitle}>
                      {game.sport} — {game.ageGroup}
                    </Text>
                    <Text style={s.metaText}>
                      📅{" "}
                      {new Date(game.time).toLocaleString("en-GB", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(
                          `https://maps.google.com/?q=${encodeURIComponent(game.location)}`,
                        )
                      }
                    >
                      <Text style={[s.metaText, { color: "#2563eb" }]}>
                        📍 {game.location}
                      </Text>
                    </TouchableOpacity>
                    <View
                      style={{ flexDirection: "row", gap: 8, marginTop: 6 }}
                    >
                      <Text style={[s.metaText, { fontWeight: "600" }]}>
                        🏠 {homeCoach?.name ?? "—"}
                      </Text>
                      <Text style={s.metaText}>vs</Text>
                      <Text style={[s.metaText, { fontWeight: "600" }]}>
                        ✈️ {awayCoach?.name ?? "—"}
                      </Text>
                    </View>
                    {!!game.contactPhone && (
                      <TouchableOpacity
                        onPress={() =>
                          Linking.openURL(`tel:${game.contactPhone!}`)
                        }
                      >
                        <Text style={[s.metaText, { color: "#16a34a" }]}>
                          📞 {game.contactPhone}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                );
              })}
          </View>
        )}
      </ScrollView>

      {/* Bottom nav */}
      <View
        style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}
      >
        <NavBtn
          icon={
            <Mail size={22} color={tab === "invites" ? C.blue : C.slate400} />
          }
          label={t("gameInvitationsLabel")}
          active={tab === "invites"}
          onPress={() => setTab("invites")}
          badge={invites.length}
        />
        <NavBtn
          icon={
            <Calendar
              size={22}
              color={tab === "my_games" ? C.blue : C.slate400}
            />
          }
          label={t("myScheduleLabel")}
          active={tab === "my_games"}
          onPress={() => setTab("my_games")}
        />
        <NavBtn
          icon={
            <Trophy
              size={22}
              color={tab === "confirmed" ? C.blue : C.slate400}
            />
          }
          label={t("confirmedGamesLabel")}
          active={tab === "confirmed"}
          onPress={() => setTab("confirmed")}
        />
      </View>

      <AppModal modal={modal} onClose={() => setModal(null)} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 100 },
  joinTeamBox: {
    backgroundColor: C.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.slate200,
    padding: 12,
    marginBottom: 12,
  },
  joinTeamTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: C.slate800,
  },
  joinTeamHint: {
    fontSize: 12,
    color: C.slate500,
    marginTop: 4,
  },
  joinedTeamsText: {
    marginTop: 8,
    fontSize: 12,
    color: C.slate600,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.slate800,
    padding: 0,
  },
  profileBanner: {
    backgroundColor: C.slate100,
    borderRadius: 14,
    padding: 14,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  profileLabel: {
    fontSize: 10,
    color: C.slate500,
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  profileValue: {
    fontSize: 14,
    fontWeight: "600",
    color: C.slate800,
    marginTop: 2,
  },
  underageBadge: {
    backgroundColor: "#fefce8",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  underageText: { fontSize: 11, color: C.yellow, fontWeight: "600" },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: C.slate800,
    marginBottom: 16,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.slate300,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  inviteCard: {
    backgroundColor: C.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.slate300,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    position: "relative",
  },
  inviteStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: C.blue,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: C.slate800,
    marginBottom: 4,
  },
  metaText: { fontSize: 13, color: C.slate600, marginTop: 2 },
  descBox: {
    backgroundColor: C.slate50,
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
    borderWidth: 1,
    borderColor: C.slate100,
  },
  hintText: { fontSize: 12, color: C.slate500 },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  pill: {
    fontSize: 11,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    overflow: "hidden",
  },
  btn: {
    backgroundColor: C.blue,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    shadowColor: C.blue,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  btnDisabled: { backgroundColor: C.slate300, shadowOpacity: 0, elevation: 0 },
  btnText: { color: C.white, fontWeight: "700", fontSize: 14 },
  textarea: {
    borderWidth: 1,
    borderColor: C.slate300,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: C.slate800,
    backgroundColor: C.white,
    height: 96,
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: C.slate300,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 40,
    alignItems: "center",
  },
  emptyText: { fontSize: 13, color: C.slate400, textAlign: "center" },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderColor: C.slate200,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 10,
  },
});
