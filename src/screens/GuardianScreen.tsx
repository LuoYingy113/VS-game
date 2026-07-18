/**
 * 监护人仪表盘 (Guardian Dashboard)
 * 对应 App.jsx 的 GuardianView
 */
import { Calendar, Check } from "lucide-react-native";
import React, { useState } from "react";
import {
    KeyboardAvoidingView,
    Linking,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch, mapGame } from "../api";
import { C, NavBtn } from "../components/shared";
import { useLanguage } from "../i18n";
import { sendAppNotification } from "../storage";
import { Club, Game, RosterEntry, TeamGroup, User } from "../types";

interface GuardianState {
  currentUser: User;
  games: Game[];
  setGames: React.Dispatch<React.SetStateAction<Game[]>>;
  rosters: RosterEntry[];
  setRosters: React.Dispatch<React.SetStateAction<RosterEntry[]>>;
  users: User[];
  teamGroups: TeamGroup[];
  clubs: Club[];
  showToast: (msg: string) => void;
}

export default function GuardianScreen({ state }: { state: GuardianState }) {
  const {
    currentUser,
    games,
    setGames,
    rosters,
    setRosters,
    users,
    teamGroups,
    clubs,
    showToast,
  } = state;
  const { t } = useLanguage();
  const [tab, setTab] = useState<"approvals" | "schedule">("approvals");

  const myChildren = users.filter((u) => u.guardianId === currentUser.id);
  const pendingApprovals = rosters.filter(
    (r) =>
      r.status === "pending_guardian" &&
      myChildren.some((c) => c.id === r.playerId),
  );
  const childrenRosters = rosters.filter(
    (r) =>
      (r.status === "approved" || r.status === "pending_coach") &&
      myChildren.some((c) => c.id === r.playerId),
  );
  const uniqueGameIds = [...new Set(childrenRosters.map((r) => r.gameId))];
  const activeGames = uniqueGameIds
    .map((id) => games.find((g) => g.id === id))
    .filter(Boolean) as Game[];

  const handleApprove = async (entry: RosterEntry) => {
    try {
      await apiFetch(`/rosters/${entry.id}/status`, {
        method: "PUT",
        body: { status: "pending_coach", guardian_approved: true },
      });
      setRosters((prev) =>
        prev.map((r) =>
          r.id === entry.id
            ? { ...r, status: "pending_coach", guardianApproved: true }
            : r,
        ),
      );
      showToast(t("guardianApprovedMsg"));
      // Notify the coach(es) who manage this player
      const game = games.find((g) => g.id === entry.gameId);
      const child = users.find((u) => u.id === entry.playerId);
      const gameLabel = game ? `${game.sport} @ ${game.location}` : "a game";
      const coachId = game?.creatorId;
      if (coachId) {
        sendAppNotification(
          coachId,
          "🛡 家长已批准 / Guardian Approved / Εγκρίθηκε από Κηδεμόνα",
          `${currentUser.name} approved ${child?.name ?? "a player"} for "${gameLabel}". Awaiting your final approval.`,
        );
      }
    } catch (err: any) {
      showToast("Failed: " + err.message);
    }
  };

  const toggleVolunteer = async (gameId: string) => {
    const isVolunteering = games
      .find((g) => g.id === gameId)
      ?.volunteers?.includes(currentUser.id);
    try {
      const updatedGame = await apiFetch(`/games/${gameId}/volunteers`, {
        method: "PUT",
        body: {
          volunteerId: currentUser.id,
          action: isVolunteering ? "remove" : "add",
        },
      });
      setGames((prev) =>
        prev.map((g) => (g.id === gameId ? mapGame(updatedGame) : g)),
      );
      showToast(isVolunteering ? t("volunteerCancelled") : t("volunteeredOk"));
    } catch (err: any) {
      showToast("Failed: " + err.message);
    }
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
        {/* Hero banner */}
        <View style={s.hero}>
          <Text style={s.heroTitle}>{t("guardianPortalTitle")}</Text>
          <Text style={s.heroSubtitle}>{t("guardianPortalSubtitle")}</Text>
          <Text style={s.heroShield}>🛡</Text>
        </View>

        {/* ===== APPROVALS TAB ===== */}
        {tab === "approvals" && (
          <View>
            <Text style={s.sectionTitle}>
              {t("pendingApprovalsTitle").replace(
                "{count}",
                String(pendingApprovals.length),
              )}
            </Text>
            {pendingApprovals.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>{t("noPendingApprovals")}</Text>
              </View>
            ) : (
              pendingApprovals.map((req) => {
                const game = games.find((g) => g.id === req.gameId);
                const child = users.find((u) => u.id === req.playerId);
                return (
                  <View key={req.id} style={s.approvalCard}>
                    <View style={s.childRow}>
                      <View style={s.childAvatar}>
                        <Text style={s.childAvatarText}>
                          {child?.name.charAt(0) ?? "?"}
                        </Text>
                      </View>
                      <Text style={s.childName}>
                        {t("wantsToPlay").replace("{child}", child?.name ?? "")}
                      </Text>
                    </View>
                    <View style={s.gameInfoBox}>
                      <Text style={s.infoRow}>
                        <Text style={s.infoLbl}>{t("sportInfoLabel")}: </Text>
                        {game?.sport}
                      </Text>
                      <Text style={s.infoRow}>
                        <Text style={s.infoLbl}>{t("timeGameLabel")}: </Text>
                        {game ? new Date(game.time).toLocaleString() : ""}
                      </Text>
                      <TouchableOpacity
                        disabled={!game?.location}
                        onPress={() =>
                          game &&
                          Linking.openURL(
                            `https://maps.google.com/?q=${encodeURIComponent(game.location)}`,
                          )
                        }
                      >
                        <Text style={s.infoRow}>
                          <Text style={s.infoLbl}>
                            {t("locationGameLabel")}:{" "}
                          </Text>
                          <Text style={{ color: "#2563eb" }}>
                            {game?.location}
                          </Text>
                        </Text>
                      </TouchableOpacity>
                      {!!game?.contactPhone && (
                        <TouchableOpacity
                          onPress={() =>
                            Linking.openURL(`tel:${game!.contactPhone!}`)
                          }
                        >
                          <Text style={s.infoRow}>
                            <Text style={s.infoLbl}>
                              {t("phoneGameLabel")}:{" "}
                            </Text>
                            <Text style={{ color: "#16a34a" }}>
                              {game.contactPhone}
                            </Text>
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <TouchableOpacity
                      style={s.approveBtn}
                      onPress={() => handleApprove(req)}
                    >
                      <Check size={18} color={C.white} />
                      <Text style={s.approveBtnText}>
                        {t("consentApproveBtn")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}

        {/* ===== SCHEDULE TAB ===== */}
        {tab === "schedule" && (
          <View>
            <Text style={s.sectionTitle}>{t("childrenScheduleTitle")}</Text>
            {activeGames.length === 0 ? (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>{t("noChildGames")}</Text>
              </View>
            ) : (
              activeGames.map((game) => {
                const isVolunteering = game.volunteers?.includes(
                  currentUser.id,
                );
                const volunteerNames = game.volunteers?.length
                  ? game.volunteers
                      .map((vId) => users.find((u) => u.id === vId)?.name)
                      .join(", ")
                  : "None";
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
                  <View key={game.id} style={s.card}>
                    <View style={s.rowBetween}>
                      <Text style={s.cardTitle}>
                        {displayClub
                          ? displayClub.name
                          : (creatorCoach?.name ?? game.sport)}{" "}
                        Match
                      </Text>
                      <Text style={s.pill}>{game.status.toUpperCase()}</Text>
                    </View>
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
                    <View style={s.volunteerBox}>
                      <Text style={s.volunteerLabel}>
                        {t("currentVolunteersLabel")}
                      </Text>
                      <Text style={s.volunteerNames}>{volunteerNames}</Text>
                    </View>
                    <TouchableOpacity
                      style={[
                        s.volunteerBtn,
                        isVolunteering && s.volunteerBtnCancel,
                      ]}
                      onPress={() => toggleVolunteer(game.id)}
                    >
                      <Text
                        style={[
                          s.volunteerBtnText,
                          isVolunteering && { color: C.red },
                        ]}
                      >
                        {isVolunteering
                          ? t("cancelVolunteerBtn")
                          : t("volunteerBtn")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* Bottom nav */}
      <View
        style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}
      >
        <NavBtn
          icon={
            <Check
              size={22}
              color={tab === "approvals" ? C.blue : C.slate400}
            />
          }
          label={t("approvalsTabLabel")}
          active={tab === "approvals"}
          onPress={() => setTab("approvals")}
          badge={pendingApprovals.length}
        />
        <NavBtn
          icon={
            <Calendar
              size={22}
              color={tab === "schedule" ? C.blue : C.slate400}
            />
          }
          label={t("scheduleTabLabel")}
          active={tab === "schedule"}
          onPress={() => setTab("schedule")}
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 100 },
  hero: {
    backgroundColor: C.purple,
    borderRadius: 20,
    padding: 24,
    marginBottom: 20,
    overflow: "hidden",
    position: "relative",
    shadowColor: C.purple,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 6,
  },
  heroTitle: { fontSize: 24, fontWeight: "bold", color: C.white },
  heroSubtitle: { fontSize: 13, color: "#e9d5ff", marginTop: 4 },
  heroShield: {
    position: "absolute",
    right: -10,
    bottom: -10,
    fontSize: 80,
    opacity: 0.2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.slate800,
    marginBottom: 12,
  },
  emptyBox: {
    borderWidth: 1,
    borderColor: C.slate300,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 40,
    alignItems: "center",
  },
  emptyText: { fontSize: 13, color: C.slate400 },
  approvalCard: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: "#f3e8ff",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  childRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
  childAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f5f3ff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  childAvatarText: { fontSize: 16, fontWeight: "bold", color: C.purple },
  childName: { fontSize: 15, fontWeight: "bold", color: C.slate800 },
  gameInfoBox: {
    backgroundColor: C.slate50,
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    gap: 4,
  },
  infoRow: { fontSize: 13, color: C.slate700 },
  infoLbl: { fontWeight: "700" },
  approveBtn: {
    backgroundColor: C.purple,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    shadowColor: C.purple,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  approveBtnText: { color: C.white, fontWeight: "bold", fontSize: 15 },
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
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  cardTitle: { fontSize: 15, fontWeight: "bold", color: C.slate800 },
  pill: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.slate700,
    backgroundColor: C.slate100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  metaText: { fontSize: 13, color: C.slate600, marginTop: 2 },
  volunteerBox: {
    backgroundColor: "#f5f3ff",
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: "#ede9fe",
    marginTop: 10,
    marginBottom: 10,
  },
  volunteerLabel: {
    fontSize: 11,
    fontWeight: "700",
    color: C.purple,
    marginBottom: 2,
  },
  volunteerNames: { fontSize: 12, color: "#7c3aed" },
  volunteerBtn: {
    backgroundColor: C.purple,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    shadowColor: C.purple,
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  volunteerBtnCancel: { backgroundColor: "#fee2e2" },
  volunteerBtnText: { color: C.white, fontWeight: "600", fontSize: 13 },
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
