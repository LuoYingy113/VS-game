/**
 * 球员仪表盘 (Player Dashboard)
 * 对应 App.jsx 的 PlayerView
 */
import { Calendar, Mail } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { apiFetch, calculateAge, mapTeamGroup, mapUser } from "../api";
import { addMatchToSystemCalendar } from "../calendar";
import { CalendarAddError } from "../calendarTypes";
import { AppModal, C, NavBtn } from "../components/shared";
import { backgroundStyles, buttonStyles, theme } from "../constants/commonStyles";
import { useLanguage } from "../i18n";
import { clearLoggedInUserId, notifI18n, sendAppNotification } from "../storage";
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
  setCurrentUser: React.Dispatch<React.SetStateAction<User | null>>;
  playerProfileOpen: boolean;
  setPlayerProfileOpen: (v: boolean) => void;
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
    setCurrentUser,
    playerProfileOpen,
    setPlayerProfileOpen,
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

  const [tab, setTab] = useState<"invites" | "schedule">("invites");
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [joiningTeam, setJoiningTeam] = useState(false);
  const autoHandledInviteIdsRef = React.useRef<Set<string>>(new Set());

  const myRosters = rosters.filter((r) => r.playerId === currentUser.id);
  const invites = myRosters.filter((r) => r.status === "invited");
  const activeGames = myRosters.filter(
    (r) =>
      r.status === "approved" ||
      r.status === "pending_coach" ||
      r.status === "pending_guardian",
  );
  const upcomingActiveGames = activeGames.filter((r) => {
    const game = games.find((g) => g.id === r.gameId);
    if (!game) return false;
    const gameTs = Date.parse(game.time);
    if (Number.isNaN(gameTs)) return true;
    return gameTs >= Date.now();
  });

  const age = calculateAge(currentUser.dob);

  const joinedTeams = teamGroups.filter((tg) =>
    tg.playerIds.includes(currentUser.id),
  );
  const boundGuardian = currentUser.guardianId
    ? users.find((u) => u.id === currentUser.guardianId) ?? null
    : null;
  const [profileFirstName, setProfileFirstName] = useState(currentUser.firstName ?? "");
  const [profileLastName, setProfileLastName] = useState(currentUser.lastName ?? "");
  const [profileEmail, setProfileEmail] = useState(currentUser.email || "");
  const [profilePhone, setProfilePhone] = useState(currentUser.phone ?? "");
  const [profileJerseyNumber, setProfileJerseyNumber] = useState(
    currentUser.jerseyNumber ?? "",
  );
  const [profileSaving, setProfileSaving] = useState(false);

  useEffect(() => {
    if (!playerProfileOpen) return;
    setProfileFirstName(currentUser.firstName ?? "");
    setProfileLastName(currentUser.lastName ?? "");
    setProfileEmail(currentUser.email || "");
    setProfilePhone(currentUser.phone ?? "");
    setProfileJerseyNumber(currentUser.jerseyNumber ?? "");
  }, [
    playerProfileOpen,
    currentUser.firstName,
    currentUser.lastName,
    currentUser.email,
    currentUser.phone,
    currentUser.jerseyNumber,
  ]);

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
      age < adminSettings.underageLimit && currentUser.guardianId
        ? "pending_guardian"
        : "approved";
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

  // Default invited players to participating by auto-confirming invite status.
  React.useEffect(() => {
    const pendingAutoAccept = myRosters.filter(
      (r) => r.status === "invited" && !autoHandledInviteIdsRef.current.has(r.id),
    );
    if (pendingAutoAccept.length === 0) return;

    pendingAutoAccept.forEach((entry) =>
      autoHandledInviteIdsRef.current.add(entry.id),
    );

    const nextStatus =
      age < adminSettings.underageLimit && currentUser.guardianId
        ? "pending_guardian"
        : "approved";

    pendingAutoAccept.forEach((entry) => {
      void (async () => {
        try {
          await apiFetch(`/rosters/${entry.id}/status`, {
            method: "PUT",
            body: { status: nextStatus },
          });
          setRosters((prev) =>
            prev.map((r) =>
              r.id === entry.id ? { ...r, status: nextStatus as any } : r,
            ),
          );
        } catch {
          // Keep silent to avoid repetitive toasts on background auto-update.
        }
      })();
    });
  }, [
    myRosters,
    age,
    adminSettings.underageLimit,
    currentUser.guardianId,
    setRosters,
  ]);

  const handleSetNotParticipating = (entry: RosterEntry) => {
    Alert.alert(t("setNotParticipatingBtn"), t("setNotParticipatingBtn"), [
      { text: t("calCancel"), style: "cancel" },
      {
        text: t("setNotParticipatingBtn"),
        style: "destructive",
        onPress: async () => {
          try {
            await apiFetch(`/rosters/${entry.id}/status`, {
              method: "PUT",
              body: { status: "not_participating" },
            });
            setRosters((prev) =>
              prev.map((r) =>
                r.id === entry.id ? { ...r, status: "not_participating" } : r,
              ),
            );

            const game = games.find((g) => g.id === entry.gameId);
            const gameLabel = game
              ? `${game.sport} @ ${game.location}`
              : "game";
            const coachIds = new Set<string>(
              teamGroups
                .filter((tg) => tg.playerIds.includes(currentUser.id))
                .map((tg) => tg.coachId),
            );
            if (game) coachIds.add(game.creatorId);
            coachIds.forEach((coachId) =>
              sendAppNotification(
                coachId,
                `⚠️ ${currentUser.name} ${notifI18n("notifNotParticipatingTitle")}`,
                notifI18n("notifBodyNotParticipating", {
                  player: currentUser.name,
                  gameLabel,
                }),
              ),
            );

            showToast(t("setToNotParticipatingToast"));
          } catch (err: any) {
            showToast("Failed: " + err.message);
          }
        },
      },
    ]);
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
              `⚠️ ${currentUser.name} ${notifI18n("notifWithdrawalTitle")}`,
              notifI18n("notifBodyWithdrawal", {
                player: currentUser.name,
                gameLabel,
                reason,
              }),
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

  const handleDeleteAccount = () => {
    Alert.alert(t("deleteAccountTitle"), t("deleteAccountPlayerConfirm"), [
      { text: t("calCancel"), style: "cancel" },
      {
        text: t("deleteAccountBtn"),
        style: "destructive",
        onPress: async () => {
          try {
            await apiFetch(`/users/${currentUser.id}`, { method: "DELETE" });
            showToast(t("accountDeleted"));
            await clearLoggedInUserId();
            setCurrentUser(null);
          } catch (err: any) {
            showToast("Failed: " + err.message);
          }
        },
      },
    ]);
  };

  const handleSaveProfile = async () => {
    const nextFirstName = profileFirstName.trim();
    const nextLastName = profileLastName.trim();
    const nextEmail = profileEmail.trim().toLowerCase();
    if (!nextFirstName && !nextLastName) {
      showToast(t("nameRequired"));
      return;
    }
    if (!nextEmail || !nextEmail.includes("@")) {
      showToast(t("errInvalidEmailAddress"));
      return;
    }
    setProfileSaving(true);
    try {
      const data = await apiFetch(`/users/${currentUser.id}/profile`, {
        method: "PUT",
        body: {
          firstName: nextFirstName || null,
          lastName: nextLastName || null,
          email: nextEmail,
          phone: profilePhone.trim() || null,
          jerseyNumber: profileJerseyNumber.trim() || null,
        },
      });
      setCurrentUser(mapUser(data));
      showToast(t("profileSaved"));
    } catch (err: any) {
      showToast("Failed: " + err.message);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAddGameToCalendar = async (game: Game, displayName: string) => {
    try {
      const result = await addMatchToSystemCalendar({
        title: `${displayName} Match`,
        startIso: game.time,
        location: game.location,
        notes: game.description || game.contactPhone || undefined,
      });
      showToast(result.kind === "download"
        ? t("calendarDownloaded")
        : `${t("calendarAdded")} (${result.calendarTitle})`);
    } catch (err) {
      if (err instanceof CalendarAddError) {
        if (err.code === "permission_denied") {
          showToast(t("calendarPermissionDenied"));
          return;
        }
        if (err.code === "calendar_unavailable") {
          showToast(t("calendarUnavailable"));
          return;
        }
        if (err.code === "invalid_date") {
          showToast(t("calendarInvalidDate"));
          return;
        }
        if (err.code === "event_not_found") {
          showToast(`${t("calendarAddFailed")}: event was not verifiable`);
          return;
        }
      }
      const unknownReason =
        err instanceof Error && err.message ? `: ${err.message}` : "";
      showToast(`${t("calendarAddFailed")}${unknownReason}`);
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

        {/* ===== SCHEDULE TAB ===== */}
        {tab === "schedule" && (
          <View>
            <Text style={s.sectionTitle}>{t("myScheduleLabel")}</Text>
            {upcomingActiveGames.length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>{t("noUpcomingGames")}</Text>
              </View>
            )}
            {upcomingActiveGames.map((ag) => {
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
                      style={[s.btn, { marginTop: 10 }]}
                      onPress={() =>
                        handleAddGameToCalendar(
                          game,
                          displayClub
                            ? displayClub.name
                            : (creatorCoach?.name ?? game.sport),
                        )
                      }
                    >
                      <Text style={s.btnText}>{t("addToCalendarBtn")}</Text>
                    </TouchableOpacity>
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
                  {(ag.status === "approved" ||
                    ag.status === "pending_coach" ||
                    ag.status === "pending_guardian") && (
                    <TouchableOpacity
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        marginTop: 8,
                      }}
                      onPress={() => handleSetNotParticipating(ag)}
                    >
                      <Text
                        style={{
                          color: C.red,
                          fontSize: 13,
                          fontWeight: "500",
                        }}
                      >
                        {t("setNotParticipatingBtn")}
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
              color={tab === "schedule" ? C.blue : C.slate400}
            />
          }
          label={t("myScheduleLabel")}
          active={tab === "schedule"}
          onPress={() => setTab("schedule")}
        />
      </View>

      <AppModal modal={modal} onClose={() => setModal(null)} />
      <Modal
        visible={playerProfileOpen}
        animationType="slide"
        onRequestClose={() => setPlayerProfileOpen(false)}
      >
        <KeyboardAvoidingView
          style={backgroundStyles.screen}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View
            style={{
              paddingTop: insets.top + 8,
              paddingHorizontal: 20,
              paddingBottom: 12,
              backgroundColor: C.white,
              borderBottomWidth: 1,
              borderBottomColor: C.slate200,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <TouchableOpacity
              onPress={() => setPlayerProfileOpen(false)}
              hitSlop={12}
              style={{ marginRight: 12 }}
            >
              <Text style={{ fontSize: 16, color: C.blue }}>{t("profileBack")}</Text>
            </TouchableOpacity>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: theme.text,
                flex: 1,
              }}
            >
              {t("profilePersonalInfo")}
            </Text>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: 60 }}>
            <View style={s.card}>
              <Text style={s.profileLabel}>{t("profileInfoBanner")}</Text>

              <Text style={[s.metaText, { marginTop: 10 }]}>{t("profileFirstName")}</Text>
              <TextInput
                style={s.profileInput}
                value={profileFirstName}
                onChangeText={setProfileFirstName}
                placeholder={t("profileFirstNamePlaceholder")}
                placeholderTextColor={C.slate400}
              />

              <Text style={[s.metaText, { marginTop: 10 }]}>{t("profileLastName")}</Text>
              <TextInput
                style={s.profileInput}
                value={profileLastName}
                onChangeText={setProfileLastName}
                placeholder={t("profileLastNamePlaceholder")}
                placeholderTextColor={C.slate400}
              />

              <Text style={[s.metaText, { marginTop: 10 }]}>{t("labelEmail")}</Text>
              <TextInput
                style={s.profileInput}
                value={profileEmail}
                onChangeText={setProfileEmail}
                placeholder={t("profileEmailPlaceholder")}
                placeholderTextColor={C.slate400}
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <Text style={[s.metaText, { marginTop: 10 }]}>{t("labelPhone")}</Text>
              <TextInput
                style={s.profileInput}
                value={profilePhone}
                onChangeText={setProfilePhone}
                placeholder="+1 555 0000"
                placeholderTextColor={C.slate400}
                keyboardType="phone-pad"
              />

              <Text style={[s.metaText, { marginTop: 10 }]}>{t("labelJerseyNumber")}</Text>
              <TextInput
                style={s.profileInput}
                value={profileJerseyNumber}
                onChangeText={setProfileJerseyNumber}
                placeholder={t("profileJerseyNumberPlaceholder")}
                placeholderTextColor={C.slate400}
              />

              <Text style={[s.metaText, { marginTop: 10 }]}>{t("labelDob")}</Text>
              <Text style={[s.profileValue, { marginTop: 6 }]}>
                {currentUser.dob || t("profileDobPlaceholder")}
              </Text>

              <Text style={s.metaText}>
                {t("ageYearsDisplay").replace("{age}", String(age))}
              </Text>
              {age < adminSettings.underageLimit && (
                <View style={[s.underageBadge, { alignSelf: "flex-start", marginTop: 8 }]}>
                  <Text style={s.underageText}>{t("underageProfileBadge")}</Text>
                </View>
              )}
            </View>

            <View style={s.card}>
              <Text style={s.profileLabel}>{t("profileGuardianLabel")}</Text>
              {boundGuardian ? (
                <>
                  <Text style={[s.profileValue, { marginTop: 8 }]}>{boundGuardian.name}</Text>
                  <Text style={s.metaText}>{boundGuardian.email}</Text>
                </>
              ) : (
                <Text style={[s.hintText, { marginTop: 8 }]}>{t("profileNotLinked")}</Text>
              )}
            </View>

            <View style={s.joinTeamBox}>
              <Text style={s.joinTeamTitle}>{t("profileJoinedTeamsLabel")}</Text>
              {joinedTeams.length === 0 ? (
                <Text style={[s.hintText, { marginTop: 8 }]}>
                  {t("profileNoJoinedTeams")}
                </Text>
              ) : (
                <View style={s.joinedTeamsList}>
                  {joinedTeams.map((group) => {
                    const coach = users.find((u) => u.id === group.coachId);
                    return (
                      <View key={group.id} style={s.joinedTeamRow}>
                        <Text style={s.joinedTeamName}>{group.name}</Text>
                        <Text style={s.joinedTeamCoach}>
                          {t("coachRole")}: {coach?.name ?? "-"}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              <Text style={[s.joinTeamTitle, { marginTop: 16 }]}>
                {t("joinTeamTitle")}
              </Text>
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
            </View>

            <TouchableOpacity
              style={[s.btn, profileSaving && s.btnDisabled]}
              onPress={handleSaveProfile}
              disabled={profileSaving}
            >
              <Text style={s.btnText}>{profileSaving ? t("loading") : t("saveChangesBtn")}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[s.btn, { backgroundColor: C.red }]}
              onPress={handleDeleteAccount}
            >
              <Text style={s.btnText}>{t("deleteAccountBtn")}</Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
    color: theme.text,
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
  joinedTeamsToggle: {
    marginTop: 10,
    alignSelf: "flex-start",
    backgroundColor: C.slate100,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  joinedTeamsToggleText: {
    fontSize: 12,
    color: C.slate700,
    fontWeight: "600",
  },
  joinedTeamsList: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: C.slate200,
    paddingTop: 8,
    gap: 8,
  },
  joinedTeamRow: {
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: C.slate100,
  },
  joinedTeamName: {
    fontSize: 13,
    fontWeight: "700",
    color: theme.text,
  },
  joinedTeamCoach: {
    marginTop: 2,
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
    color: theme.text,
    padding: 0,
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
    color: theme.text,
    marginTop: 2,
  },
  profileInput: {
    borderWidth: 1,
    borderColor: C.slate300,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: theme.text,
    backgroundColor: C.white,
    marginTop: 6,
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
    color: theme.text,
    marginBottom: 16,
  },
  card: {
    backgroundColor: theme.cardBg,
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
    backgroundColor: theme.cardBg,
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
    backgroundColor: theme.primary,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.text,
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
  btn: buttonStyles.btn,
  btnDisabled: buttonStyles.btnDisabledAlt,
  btnText: buttonStyles.btnText,
  textarea: {
    borderWidth: 1,
    borderColor: C.slate300,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: theme.text,
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
    backgroundColor: theme.bottomNavBg,
    borderTopWidth: 1,
    borderColor: C.slate200,
    paddingTop: 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 10,
  },
});
