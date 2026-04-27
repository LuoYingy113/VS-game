/**
 * 教练仪表盘 (Coach Dashboard)
 * 对应 App.jsx 的 CoachView + GameManagementCard
 */
import {
  ArrowRightLeft,
  Calendar,
  Check,
  Key,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Trash2,
  User,
  UserPlus,
  Users,
  UserX,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  apiFetch,
  mapGame,
  mapMatchApp,
  mapRoster,
  mapTeamGroup,
} from "../api";
import { AppModal, C, DatePickerField, NavBtn } from "../components/shared";
import { useLanguage } from "../i18n";
import { sendAppNotification } from "../storage";
import {
  Game,
  MatchApplication,
  ModalConfig,
  RosterEntry,
  TeamGroup,
  User as UserType,
} from "../types";

interface CoachState {
  currentUser: UserType;
  users: UserType[];
  games: Game[];
  setGames: React.Dispatch<React.SetStateAction<Game[]>>;
  matchApplications: MatchApplication[];
  setMatchApplications: React.Dispatch<
    React.SetStateAction<MatchApplication[]>
  >;
  teamGroups: TeamGroup[];
  setTeamGroups: React.Dispatch<React.SetStateAction<TeamGroup[]>>;
  rosters: RosterEntry[];
  setRosters: React.Dispatch<React.SetStateAction<RosterEntry[]>>;
  showToast: (msg: string) => void;
}

export default function CoachScreen({ state }: { state: CoachState }) {
  const {
    currentUser,
    games,
    setGames,
    matchApplications,
    setMatchApplications,
    teamGroups,
    setTeamGroups,
    users,
    rosters,
    setRosters,
    showToast,
  } = state;
  const { t } = useLanguage();

  const [tab, setTab] = useState<"discover" | "my_games" | "team">("discover");
  const [modal, setModal] = useState<ModalConfig | null>(null);

  const myCreatedGames = games.filter((g) => g.creatorId === currentUser.id);
  const acceptedGameIds = matchApplications
    .filter(
      (m) => m.applicantCoachId === currentUser.id && m.status === "accepted",
    )
    .map((m) => m.gameId);
  const gamesIJoined = acceptedGameIds
    .map((id) => games.find((g) => g.id === id))
    .filter(Boolean) as Game[];
  const allMyGames = [...myCreatedGames, ...gamesIJoined];

  // ---- Modals ----
  const openCoachProfileModal = (coach?: UserType) => {
    if (!coach) return;
    setModal({
      title: "Coach Profile",
      content: (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View style={[s.avatarLg, { backgroundColor: "#dbeafe" }]}>
              <Text style={{ fontSize: 22, fontWeight: "bold", color: C.blue }}>
                {coach.name.charAt(0)}
              </Text>
            </View>
            <View>
              <Text style={s.boldLg}>{coach.name}</Text>
              <Text style={s.subText}>{coach.sport} Coach</Text>
            </View>
          </View>
          {coach.bio && (
            <View style={s.infoBox}>
              <Text
                style={{ fontStyle: "italic", color: C.slate600, fontSize: 13 }}
              >
                "{coach.bio}"
              </Text>
            </View>
          )}
          <TouchableOpacity
            style={s.linkRow}
            onPress={() => Linking.openURL(`mailto:${coach.email}`)}
          >
            <Mail size={15} color={C.blue} />
            <Text style={{ color: C.blue, fontWeight: "500", marginLeft: 8 }}>
              {coach.email}
            </Text>
          </TouchableOpacity>
          {coach.phone && (
            <TouchableOpacity
              style={[s.linkRow, { backgroundColor: "#f0fdf4" }]}
              onPress={() => Linking.openURL(`tel:${coach.phone!}`)}
            >
              <Phone size={15} color={C.green} />
              <Text
                style={{ color: C.green, fontWeight: "500", marginLeft: 8 }}
              >
                {coach.phone}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      ),
    });
  };

  const openGenerateCoachCodeModal = () => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [code, setCode] = useState<string | null>(null);
      const [loading, setLoading] = useState(false);
      const [copied, setCopied] = useState(false);
      const generate = async () => {
        setLoading(true);
        try {
          const data = await apiFetch("/coach_invite_codes", {
            method: "POST",
            body: { requesterId: currentUser.id },
          });
          setCode(data.code);
        } catch (err: any) {
          showToast("Error: " + err.message);
        } finally {
          setLoading(false);
        }
      };
      const copy = async () => {
        try {
          const Clipboard = await import("expo-clipboard");
          await Clipboard.setStringAsync(code!);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          showToast(t("copyFail"));
        }
      };
      return (
        <View style={{ gap: 12 }}>
          <Text style={s.hintText}>{t("coachGenCodeHint")}</Text>
          {!code ? (
            <TouchableOpacity
              style={[s.btn, { backgroundColor: C.purple }]}
              onPress={generate}
              disabled={loading}
            >
              <Text style={s.btnText}>
                {loading ? t("coachGenerating") : t("coachGenCode")}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={s.codeBg}>
                <Text style={s.codeSmall}>{t("coachCodeLabel")}</Text>
                <Text style={s.codeLarge}>{code}</Text>
              </View>
              <TouchableOpacity
                style={[
                  s.btn,
                  { backgroundColor: copied ? C.greenLight : C.slate100 },
                ]}
                onPress={copy}
              >
                <Text
                  style={{
                    color: copied ? C.green : C.slate700,
                    fontWeight: "600",
                  }}
                >
                  {copied ? t("copied") : t("copy")}
                </Text>
              </TouchableOpacity>
              <Text style={[s.hintText, { textAlign: "center" }]}>
                {t("adminSingleUse")}
              </Text>
            </View>
          )}
        </View>
      );
    };
    setModal({
      title: t("inviteCoachTitle"),
      content: <ModalContent />,
    });
  };

  const openCreateGameModal = () => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [time, setTime] = useState("");
      const [location, setLocation] = useState("");
      const [ageGroup, setAgeGroup] = useState("");
      const [deadline, setDeadline] = useState("");
      const [description, setDescription] = useState("");
      const [contactPhone, setContactPhone] = useState("");
      const [submitted, setSubmitted] = useState(false);
      const create = async () => {
        if (!time || !location || !ageGroup || !deadline) {
          setSubmitted(true);
          showToast(t("fillRequiredFields"));
          return;
        }
        try {
          const data = await apiFetch("/games", {
            method: "POST",
            body: {
              creatorId: currentUser.id,
              sport: currentUser.sport,
              time,
              location,
              ageGroup,
              deadline,
              description,
              contactPhone: contactPhone || null,
            },
          });
          setGames((prev) => [...prev, mapGame(data)]);
          setModal(null);
          showToast(t("createMatchSuccess"));
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      return (
        <View style={{ gap: 12 }}>
          <DatePickerField
            label={t("matchTimeLabel")}
            value={time}
            onChange={setTime}
            mode="datetime"
            inputStyle={submitted && !time ? s.fieldError : undefined}
          />
          <FieldInput
            label={t("matchLocationLabel")}
            value={location}
            onChangeText={setLocation}
            placeholder="City Stadium"
            error={submitted && !location}
          />
          <FieldInput
            label={t("ageGroupLabel")}
            value={ageGroup}
            onChangeText={setAgeGroup}
            placeholder="U16, Adult…"
            error={submitted && !ageGroup}
          />
          <DatePickerField
            label={t("signupDeadlineLabel")}
            value={deadline}
            onChange={setDeadline}
            mode="date"
            inputStyle={submitted && !deadline ? s.fieldError : undefined}
          />
          <FieldInput
            label={t("detailsContactLabel")}
            value={description}
            onChangeText={setDescription}
            placeholder="Description, rules…"
            multiline
          />
          <FieldInput
            label={t("contactPhoneOptLabel")}
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder="e.g. +1 555-0100"
          />
          <TouchableOpacity style={s.btn} onPress={create}>
            <Text style={s.btnText}>{t("publishMatchBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({
      title: t("createMatchTitle"),
      content: <ModalContent />,
    });
  };

  const openAddGroupModal = () => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [name, setName] = useState("");
      const create = async () => {
        if (!name.trim()) {
          showToast(t("groupNameRequired"));
          return;
        }
        try {
          const data = await apiFetch("/team_groups", {
            method: "POST",
            body: { coachId: currentUser.id, name: name.trim(), playerIds: [] },
          });
          setTeamGroups((prev) => [...prev, mapTeamGroup(data)]);
          setModal(null);
          showToast(t("groupCreated"));
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      return (
        <View style={{ gap: 12 }}>
          <FieldInput
            label={t("groupNameLabel")}
            value={name}
            onChangeText={setName}
            placeholder="U12 Boys"
          />
          <TouchableOpacity style={s.btn} onPress={create}>
            <Text style={s.btnText}>{t("createGroupBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({
      title: t("createGroupTitle"),
      content: <ModalContent />,
    });
  };

  const openEditGroupModal = (group: TeamGroup) => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [name, setName] = useState(group.name);
      const save = async () => {
        if (!name.trim()) {
          showToast(t("nameRequired"));
          return;
        }
        try {
          await apiFetch(`/team_groups/${group.id}`, {
            method: "PUT",
            body: { name },
          });
          setTeamGroups((prev) =>
            prev.map((g) => (g.id === group.id ? { ...g, name } : g)),
          );
          setModal(null);
          showToast(t("groupRenamed"));
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      return (
        <View style={{ gap: 12 }}>
          <FieldInput
            label={t("groupNameLabel")}
            value={name}
            onChangeText={setName}
            placeholder={group.name}
          />
          <TouchableOpacity style={s.btn} onPress={save}>
            <Text style={s.btnText}>{t("saveChangesBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({
      title: t("editGroupTitle"),
      content: <ModalContent />,
    });
  };

  const confirmDeleteGroup = (groupId: string) => {
    setModal({
      title: t("deleteGroupTitle"),
      content: (
        <View style={{ gap: 12 }}>
          <Text style={{ color: C.slate600, fontSize: 13 }}>
            {t("deleteGroupConfirm")}
          </Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.red }]}
            onPress={async () => {
              try {
                await apiFetch(`/team_groups/${groupId}`, { method: "DELETE" });
                setTeamGroups((prev) => prev.filter((g) => g.id !== groupId));
                setModal(null);
                showToast(t("groupDeleted"));
              } catch (err: any) {
                showToast("Failed: " + err.message);
              }
            }}
          >
            <Text style={s.btnText}>{t("yesDeleteBtn")}</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  };

  const openInviteCodeModal = (group: TeamGroup) => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [code, setCode] = useState<string | null>(group.inviteCode);
      const [loading, setLoading] = useState(!group.inviteCode);
      const [copied, setCopied] = useState(false);
      React.useEffect(() => {
        if (!group.inviteCode) {
          apiFetch(`/team_groups/${group.id}/invite_code`)
            .then((data) => {
              setCode(data.code);
              setLoading(false);
            })
            .catch((err) => {
              showToast("Error: " + err.message);
              setLoading(false);
            });
        }
      }, []);
      const copy = async () => {
        try {
          const Clipboard = await import("expo-clipboard");
          await Clipboard.setStringAsync(code!);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          showToast(t("copyFail"));
        }
      };
      if (loading) return <Text style={s.hintText}>{t("loading")}</Text>;
      return (
        <View style={{ gap: 12 }}>
          <Text style={s.hintText}>{t("inviteCodeHint")}</Text>
          <View style={s.codeBg}>
            <Text style={s.codeSmall}>
              {t("inviteCodeGroupLabel").replace("{group}", group.name)}
            </Text>
            <Text style={s.codeLarge}>{code}</Text>
          </View>
          <TouchableOpacity
            style={[
              s.btn,
              { backgroundColor: copied ? C.greenLight : C.slate100 },
            ]}
            onPress={copy}
          >
            <Text
              style={{
                color: copied ? C.green : C.slate700,
                fontWeight: "600",
              }}
            >
              {copied ? t("copied") : t("copy")}
            </Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({
      title: t("inviteCodeTitle").replace("{group}", group.name),
      content: <ModalContent />,
    });
  };

  const openMovePlayerModal = (
    currentGroupId: string,
    playerId: string,
    playerName: string,
  ) => {
    const myGroups = teamGroups.filter((tg) => tg.coachId === currentUser.id);
    const ModalContent = () => {
      const { t } = useLanguage();
      const [selectedId, setSelectedId] = useState(currentGroupId);
      const move = async () => {
        if (selectedId === currentGroupId) {
          setModal(null);
          return;
        }
        try {
          await apiFetch("/team_groups/move_player", {
            method: "POST",
            body: { playerId, fromGroup: currentGroupId, toGroup: selectedId },
          });
          setTeamGroups((prev) =>
            prev.map((g) => {
              if (g.id === currentGroupId)
                return {
                  ...g,
                  playerIds: g.playerIds.filter((id) => id !== playerId),
                };
              if (g.id === selectedId)
                return { ...g, playerIds: [...g.playerIds, playerId] };
              return g;
            }),
          );
          setModal(null);
          showToast(t("playerMoved"));
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      return (
        <View style={{ gap: 12 }}>
          <Text style={s.label}>{t("selectDestGroupLabel")}</Text>
          {myGroups.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[
                s.groupSelectRow,
                selectedId === g.id && s.groupSelectActive,
              ]}
              onPress={() => setSelectedId(g.id)}
            >
              <Text
                style={{ color: selectedId === g.id ? C.blue : C.slate700 }}
              >
                {g.name}
              </Text>
              {selectedId === g.id && <Check size={14} color={C.blue} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.btn} onPress={move}>
            <Text style={s.btnText}>{t("confirmMoveBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({
      title: t("movePlayerTitle").replace("{player}", playerName),
      content: <ModalContent />,
    });
  };

  const confirmRemovePlayer = (
    groupId: string,
    playerId: string,
    playerName: string,
  ) => {
    setModal({
      title: t("removePlayerTitle").replace("{player}", playerName),
      content: (
        <View style={{ gap: 12 }}>
          <Text style={{ color: C.slate600, fontSize: 13 }}>
            {t("removePlayerConfirm")}
          </Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.red }]}
            onPress={async () => {
              try {
                await apiFetch(`/team_groups/${groupId}/remove_player`, {
                  method: "POST",
                  body: { playerId },
                });
                setTeamGroups((prev) =>
                  prev.map((g) =>
                    g.id === groupId
                      ? {
                          ...g,
                          playerIds: g.playerIds.filter(
                            (id) => id !== playerId,
                          ),
                        }
                      : g,
                  ),
                );
                setModal(null);
                showToast(t("playerRemoved"));
              } catch (err: any) {
                showToast("Failed: " + err.message);
              }
            }}
          >
            <Text style={s.btnText}>{t("removePlayerBtn")}</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  };

  const handleApplyToGame = async (gameId: string) => {
    try {
      const data = await apiFetch("/match_applications", {
        method: "POST",
        body: { gameId, applicantCoachId: currentUser.id, status: "pending" },
      });
      setMatchApplications((prev) => [...prev, mapMatchApp(data)]);
      showToast(t("applySent"));
    } catch (err: any) {
      showToast("Failed: " + err.message);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scrollContent}>
        {/* ===== DISCOVER TAB ===== */}
        {tab === "discover" && (
          <View>
            <Text style={s.sectionTitle}>{t("discoverMatches")}</Text>
            {games
              .filter(
                (g) =>
                  g.creatorId !== currentUser.id &&
                  (!currentUser.sport || g.sport === currentUser.sport),
              )
              .map((game) => {
                const creator = users.find((u) => u.id === game.creatorId);
                const hasApplied = matchApplications.some(
                  (m) =>
                    m.gameId === game.id &&
                    m.applicantCoachId === currentUser.id,
                );
                return (
                  <View key={game.id} style={s.card}>
                    <View style={s.cardHeader}>
                      <Text style={s.cardTitle}>
                        {game.sport} - {game.ageGroup}
                      </Text>
                      <View style={s.statusBadge}>
                        <Text style={s.statusText}>
                          {game.status.toUpperCase()}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.metaRow}>
                      <Text>📅 </Text>
                      {new Date(game.time).toLocaleString()}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        Linking.openURL(
                          `https://maps.google.com/?q=${encodeURIComponent(game.location)}`,
                        )
                      }
                    >
                      <Text style={[s.metaRow, { color: C.blue }]}>
                        📍 {game.location}
                      </Text>
                    </TouchableOpacity>
                    {!!game.contactPhone && (
                      <TouchableOpacity
                        onPress={() =>
                          Linking.openURL(`tel:${game.contactPhone!}`)
                        }
                      >
                        <Text style={[s.metaRow, { color: C.green }]}>
                          📞 {game.contactPhone}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={() => openCoachProfileModal(creator)}
                    >
                      <Text style={[s.metaRow, { color: C.blue }]}>
                        👤 {t("createdBy")}: {creator?.name}
                      </Text>
                    </TouchableOpacity>
                    {!!game.description && (
                      <View style={s.infoBox}>
                        <Text style={s.hintText}>{game.description}</Text>
                      </View>
                    )}
                    {game.status === "open" ? (
                      <TouchableOpacity
                        style={[s.btn, hasApplied && s.btnDisabled]}
                        onPress={() => handleApplyToGame(game.id)}
                        disabled={hasApplied}
                      >
                        <Text style={s.btnText}>
                          {hasApplied
                            ? t("applicationPending")
                            : t("applyToPlay")}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={[s.btn, s.btnDisabled]}>
                        <Text style={[s.btnText, { color: C.slate500 }]}>
                          {t("opponentLocked")}
                        </Text>
                      </View>
                    )}
                  </View>
                );
              })}
          </View>
        )}

        {/* ===== MY GAMES TAB ===== */}
        {tab === "my_games" && (
          <View>
            <View style={s.rowBetween}>
              <Text style={s.sectionTitle}>{t("myGamesLabel")}</Text>
              <TouchableOpacity style={s.iconBtn} onPress={openCreateGameModal}>
                <Plus size={20} color={C.blue} />
              </TouchableOpacity>
            </View>
            {allMyGames.map((game) => (
              <GameManagementCard
                key={game.id}
                game={game}
                state={{ ...state, showToast, setModal }}
              />
            ))}
          </View>
        )}

        {/* ===== TEAM TAB ===== */}
        {tab === "team" && (
          <View>
            <View style={s.rowBetween}>
              <Text style={s.sectionTitle}>{t("teamLabel")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[s.tagBtn, { backgroundColor: "#f5f3ff" }]}
                  onPress={openGenerateCoachCodeModal}
                >
                  <UserPlus size={14} color={C.purple} />
                  <Text style={[s.tagBtnText, { color: C.purple }]}>
                    {" "}
                    {t("inviteCoachBtn")}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.tagBtn} onPress={openAddGroupModal}>
                  <Plus size={14} color={C.slate700} />
                  <Text style={s.tagBtnText}> {t("groupBtnLabel")}</Text>
                </TouchableOpacity>
              </View>
            </View>

            {teamGroups.filter((tg) => tg.coachId === currentUser.id).length ===
              0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>{t("noGroupsYet")}</Text>
              </View>
            )}

            {teamGroups
              .filter((tg) => tg.coachId === currentUser.id)
              .map((group) => (
                <View key={group.id} style={s.card}>
                  <View
                    style={[
                      s.rowBetween,
                      {
                        borderBottomWidth: 1,
                        borderColor: C.slate200,
                        paddingBottom: 10,
                        marginBottom: 10,
                      },
                    ]}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                      }}
                    >
                      <Text style={s.cardTitle}>{group.name}</Text>
                      <View style={s.countBadge}>
                        <Text style={s.countBadgeText}>
                          {group.playerIds.length}
                        </Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        style={s.iconBtnSm}
                        onPress={() => openInviteCodeModal(group)}
                      >
                        <Key size={14} color={C.green} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.iconBtnSm}
                        onPress={() => openEditGroupModal(group)}
                      >
                        <Pencil size={14} color={C.blue} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.iconBtnSm}
                        onPress={() => confirmDeleteGroup(group.id)}
                      >
                        <Trash2 size={14} color={C.red} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {group.playerIds.length === 0 ? (
                    <Text style={s.emptyText}>{t("emptyGroup")}</Text>
                  ) : (
                    group.playerIds.map((pid) => {
                      const player = users.find((u) => u.id === pid);
                      return (
                        <View key={pid} style={s.playerRow}>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 10,
                            }}
                          >
                            <View style={s.avatarSm}>
                              <User size={14} color={C.slate400} />
                            </View>
                            <View>
                              <Text
                                style={{ fontWeight: "600", color: C.slate800 }}
                              >
                                {player?.name}
                              </Text>
                              <Text style={s.subText}>{player?.email}</Text>
                            </View>
                          </View>
                          <View style={{ flexDirection: "row", gap: 6 }}>
                            <TouchableOpacity
                              style={s.iconBtnSm}
                              onPress={() =>
                                openMovePlayerModal(
                                  group.id,
                                  pid,
                                  player?.name ?? "",
                                )
                              }
                            >
                              <ArrowRightLeft size={14} color={C.blue} />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={s.iconBtnSm}
                              onPress={() =>
                                confirmRemovePlayer(
                                  group.id,
                                  pid,
                                  player?.name ?? "",
                                )
                              }
                            >
                              <UserX size={14} color={C.red} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>
              ))}
          </View>
        )}
      </ScrollView>

      {/* Bottom nav */}
      <View style={s.bottomNav}>
        <NavBtn
          icon={
            <MapPin
              size={22}
              color={tab === "discover" ? C.blue : C.slate400}
            />
          }
          label={t("discoverMatches")}
          active={tab === "discover"}
          onPress={() => setTab("discover")}
        />
        <NavBtn
          icon={
            <Calendar
              size={22}
              color={tab === "my_games" ? C.blue : C.slate400}
            />
          }
          label={t("myGamesLabel")}
          active={tab === "my_games"}
          onPress={() => setTab("my_games")}
        />
        <NavBtn
          icon={
            <Users size={22} color={tab === "team" ? C.blue : C.slate400} />
          }
          label={t("teamLabel")}
          active={tab === "team"}
          onPress={() => setTab("team")}
        />
      </View>

      <AppModal modal={modal} onClose={() => setModal(null)} />
    </View>
  );
}

// ==========================================
// 比赛管理卡片 (Game Management Card)
// ==========================================
function GameManagementCard({
  game,
  state,
}: {
  game: Game;
  state: CoachState & {
    setModal: React.Dispatch<React.SetStateAction<ModalConfig | null>>;
  };
}) {
  const {
    currentUser,
    matchApplications,
    setMatchApplications,
    setGames,
    rosters,
    setRosters,
    teamGroups,
    users,
    showToast,
    setModal,
  } = state;
  const { t } = useLanguage();

  const homeCoach = users.find((u) => u.id === game.creatorId);
  const awayCoach = game.opposingTeamId
    ? users.find((u) => u.id === game.opposingTeamId)
    : null;
  const volunteerNames = game.volunteers?.length
    ? game.volunteers
        .map((vId) => users.find((u) => u.id === vId)?.name)
        .join(", ")
    : "None";

  const pendingOpponents = matchApplications.filter(
    (m) => m.gameId === game.id && m.status === "pending",
  );
  const gameRoster = rosters.filter((r) => r.gameId === game.id);
  const pendingPlayers = gameRoster.filter((r) => r.status === "pending_coach");
  const approvedPlayers = gameRoster.filter((r) => r.status === "approved");
  const withdrawnPlayers = gameRoster.filter((r) => r.status === "withdrawn");

  const handleAcceptOpponent = async (app: MatchApplication) => {
    try {
      await apiFetch(`/match_applications/${app.id}/status`, {
        method: "PUT",
        body: { status: "accepted" },
      });
      const updatedGame = await apiFetch(`/games/${game.id}`, {
        method: "PUT",
        body: { opposingTeamId: app.applicantCoachId, status: "locked" },
      });
      setMatchApplications((prev) =>
        prev.map((m) => (m.id === app.id ? { ...m, status: "accepted" } : m)),
      );
      setGames((prev) =>
        prev.map((g) => (g.id === game.id ? mapGame(updatedGame) : g)),
      );
      showToast("Opponent accepted! Game locked.");
      const gameLabel = `${game.sport} @ ${game.location}`;
      sendAppNotification(
        app.applicantCoachId,
        "✅ Match Accepted",
        `Your application for "${gameLabel}" was accepted by ${currentUser.name}!`,
      );
    } catch (err: any) {
      showToast("Failed: " + err.message);
    }
  };

  const handleApprovePlayer = async (entry: RosterEntry) => {
    try {
      await apiFetch(`/rosters/${entry.id}/status`, {
        method: "PUT",
        body: { status: "approved" },
      });
      setRosters((prev) =>
        prev.map((r) => (r.id === entry.id ? { ...r, status: "approved" } : r)),
      );
      showToast("Player approved!");
      // Notify the player
      const game = state.games.find((g) => g.id === entry.gameId);
      const gameLabel = game ? `${game.sport} @ ${game.location}` : "a game";
      sendAppNotification(
        entry.playerId,
        "✅ 报名已批准 / Roster Approved",
        `${currentUser.name} approved your spot for "${gameLabel}". You're in!`,
      );
    } catch (err: any) {
      showToast("Failed: " + err.message);
    }
  };

  const openEditGameModal = () => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [time, setTime] = useState(game.time);
      const [location, setLocation] = useState(game.location);
      const [ageGroup, setAgeGroup] = useState(game.ageGroup);
      const [deadline, setDeadline] = useState(game.deadline);
      const [description, setDescription] = useState(game.description);
      const [contactPhone, setContactPhone] = useState(game.contactPhone ?? "");
      const [submitted, setSubmitted] = useState(false);
      const save = async () => {
        if (!time || !location || !ageGroup || !deadline) {
          setSubmitted(true);
          showToast(t("fillRequiredFields"));
          return;
        }
        try {
          const data = await apiFetch(`/games/${game.id}`, {
            method: "PUT",
            body: {
              time,
              location,
              ageGroup,
              deadline,
              description,
              contactPhone: contactPhone || null,
            },
          });
          setGames((prev) =>
            prev.map((g) => (g.id === game.id ? mapGame(data) : g)),
          );
          setModal(null);
          showToast("Match updated!");
          // Notify all rostered players + opposing coach about the update
          const gameLabel = `${game.sport} @ ${location}`;
          const notifBody = `Match details updated by ${currentUser.name}.\n📅 ${time}\n📍 ${location}`;
          const gameRosters = rosters.filter(
            (r) => r.gameId === game.id && r.status !== "withdrawn",
          );
          gameRosters.forEach((r) =>
            sendAppNotification(
              r.playerId,
              `📝 比赛信息更新 / Game Updated`,
              notifBody,
            ),
          );
          if (game.opposingTeamId) {
            sendAppNotification(
              game.opposingTeamId,
              `📝 比赛信息更新 / Game Updated`,
              notifBody,
            );
          }
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      return (
        <View style={{ gap: 12 }}>
          <DatePickerField
            label={t("matchTimeLabel")}
            value={time}
            onChange={setTime}
            mode="datetime"
            inputStyle={submitted && !time ? s.fieldError : undefined}
          />
          <FieldInput
            label={t("matchLocationLabel")}
            value={location}
            onChangeText={setLocation}
            placeholder="City Stadium"
            error={submitted && !location}
          />
          <FieldInput
            label={t("ageGroupLabel")}
            value={ageGroup}
            onChangeText={setAgeGroup}
            placeholder="U16"
            error={submitted && !ageGroup}
          />
          <DatePickerField
            label={t("signupDeadlineLabel")}
            value={deadline}
            onChange={setDeadline}
            mode="date"
            inputStyle={submitted && !deadline ? s.fieldError : undefined}
          />
          <FieldInput
            label={t("detailsContactLabel")}
            value={description}
            onChangeText={setDescription}
            placeholder="Description…"
            multiline
          />
          <FieldInput
            label={t("contactPhoneOptLabel")}
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder="e.g. +1 555-0100"
          />
          <TouchableOpacity style={s.btn} onPress={save}>
            <Text style={s.btnText}>{t("saveChangesBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({
      title: t("editMatchTitle"),
      content: <ModalContent />,
    });
  };

  const openInviteModal = () => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const myGroups = teamGroups.filter((tg) => tg.coachId === currentUser.id);
      const [selectedGroupId, setSelectedGroupId] = useState(
        myGroups[0]?.id ?? "",
      );
      const send = async () => {
        const group = teamGroups.find((tg) => tg.id === selectedGroupId);
        if (!group) return;
        try {
          const payload = group.playerIds
            .filter(
              (pid) =>
                !rosters.some(
                  (r) => r.gameId === game.id && r.playerId === pid,
                ),
            )
            .map((pid) => ({
              gameId: game.id,
              playerId: pid,
              status: "invited",
            }));
          if (payload.length > 0) {
            const data = await apiFetch("/rosters/batch", {
              method: "POST",
              body: payload,
            });
            setRosters((prev) => [...prev, ...(data as any[]).map(mapRoster)]);
            // Notify each invited player
            const gameLabel = `${game.sport} @ ${game.location}`;
            payload.forEach(({ playerId }) =>
              sendAppNotification(
                playerId,
                `🏅 比赛邀请 / Game Invitation`,
                `${currentUser.name} invited you to play "${gameLabel}" on ${new Date(game.time).toLocaleString()}.`,
              ),
            );
          }
          setModal(null);
          showToast(t("invitationsSent"));
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      return (
        <View style={{ gap: 12 }}>
          <Text style={s.label}>{t("selectGroupLabel")}</Text>
          {myGroups.map((g) => (
            <TouchableOpacity
              key={g.id}
              style={[
                s.groupSelectRow,
                selectedGroupId === g.id && s.groupSelectActive,
              ]}
              onPress={() => setSelectedGroupId(g.id)}
            >
              <Text
                style={{
                  color: selectedGroupId === g.id ? C.blue : C.slate700,
                }}
              >
                {g.name}
              </Text>
              {selectedGroupId === g.id && <Check size={14} color={C.blue} />}
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={s.btn} onPress={send}>
            <Text style={s.btnText}>{t("sendInvitationsBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({
      title: t("invitePlayersTitle"),
      content: <ModalContent />,
    });
  };

  return (
    <View style={s.card}>
      {/* Header */}
      <View
        style={[
          s.rowBetween,
          {
            borderBottomWidth: 1,
            borderColor: C.slate200,
            paddingBottom: 10,
            marginBottom: 10,
          },
        ]}
      >
        <Text style={s.cardTitle}>
          {game.sport} ({new Date(game.time).toLocaleDateString()})
        </Text>
        {game.creatorId === currentUser.id && (
          <TouchableOpacity onPress={openEditGameModal}>
            <Pencil size={16} color={C.blue} />
          </TouchableOpacity>
        )}
      </View>

      {/* Info */}
      <View style={s.infoBox}>
        <InfoRow label={t("homeTeamLabel")} value={homeCoach?.name ?? "—"} />
        <InfoRow
          label={t("awayTeamLabel")}
          value={awayCoach?.name ?? "Pending…"}
        />
        <InfoRow
          label={t("timeInfoLabel")}
          value={new Date(game.time).toLocaleString()}
        />
        <View style={s.rowBetween}>
          <Text style={s.infoLabel}>{t("locationInfoLabel")}</Text>
          <TouchableOpacity
            onPress={() =>
              Linking.openURL(
                `https://maps.google.com/?q=${encodeURIComponent(game.location)}`,
              )
            }
          >
            <Text style={[s.infoValue, { color: C.blue }]}>
              {game.location}
            </Text>
          </TouchableOpacity>
        </View>
        {!!game.contactPhone && (
          <View style={s.rowBetween}>
            <Text style={s.infoLabel}>{t("contactPhoneInfoLabel")}</Text>
            <TouchableOpacity
              onPress={() => Linking.openURL(`tel:${game.contactPhone!}`)}
            >
              <Text style={[s.infoValue, { color: C.green }]}>
                {game.contactPhone}
              </Text>
            </TouchableOpacity>
          </View>
        )}
        <InfoRow label={t("ageGroupInfoLabel")} value={game.ageGroup} />
        <InfoRow label={t("deadlineInfoLabel")} value={game.deadline} />
        <View style={s.rowBetween}>
          <Text style={s.infoLabel}>{t("statusInfoLabel")}</Text>
          <View
            style={[
              s.statusBadge,
              game.status !== "open" && { backgroundColor: C.slate200 },
            ]}
          >
            <Text
              style={[
                s.statusText,
                game.status !== "open" && { color: C.slate700 },
              ]}
            >
              {game.status.toUpperCase()}
            </Text>
          </View>
        </View>
        <InfoRow label={t("volunteersInfoLabel")} value={volunteerNames} />
        {!!game.description && (
          <View
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: 1,
              borderColor: C.slate200,
            }}
          >
            <Text style={s.infoLabel}>{t("detailsInfoLabel")}</Text>
            <Text style={s.hintText}>{game.description}</Text>
          </View>
        )}
      </View>

      {/* Pending opponents */}
      {game.creatorId === currentUser.id &&
        game.status === "open" &&
        pendingOpponents.length > 0 && (
          <View style={s.pendingBox}>
            <Text style={[s.label, { color: "#c2410c" }]}>
              {t("pendingOpponentsLabel")}
            </Text>
            {pendingOpponents.map((app) => {
              const opp = users.find((u) => u.id === app.applicantCoachId);
              return (
                <View key={app.id} style={s.pendingRow}>
                  <Text style={{ color: C.blue, fontWeight: "500" }}>
                    {opp?.name}
                  </Text>
                  <TouchableOpacity
                    style={s.acceptBtn}
                    onPress={() => handleAcceptOpponent(app)}
                  >
                    <Text
                      style={{
                        color: C.white,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {t("acceptBtn")}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

      {/* Roster */}
      <View style={{ marginTop: 12 }}>
        <View style={s.rowBetween}>
          <Text style={[s.label, { flexDirection: "row" }]}>
            {t("rosterManagementLabel")}
          </Text>
          <TouchableOpacity onPress={openInviteModal}>
            <Text style={{ color: C.blue, fontSize: 13, fontWeight: "500" }}>
              {t("invitePlayersBtn")}
            </Text>
          </TouchableOpacity>
        </View>

        {pendingPlayers.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.rosterSectionLabel}>
              {t("requiresApprovalLabel")}
            </Text>
            {pendingPlayers.map((p) => {
              const player = users.find((u) => u.id === p.playerId);
              return (
                <View key={p.id} style={s.rosterRow}>
                  <View>
                    <Text style={{ fontWeight: "600", color: C.slate800 }}>
                      {player?.name}
                    </Text>
                    {p.guardianApproved && (
                      <Text style={{ fontSize: 10, color: C.purple }}>
                        {t("guardianApprovedLabel")}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={s.approveBtn}
                    onPress={() => handleApprovePlayer(p)}
                  >
                    <Text
                      style={{
                        color: C.white,
                        fontSize: 12,
                        fontWeight: "600",
                      }}
                    >
                      {t("approveBtn")}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}

        {approvedPlayers.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={s.rosterSectionLabel}>
              {t("approvedCountLabel").replace(
                "{count}",
                String(approvedPlayers.length),
              )}
            </Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 6,
                marginTop: 4,
              }}
            >
              {approvedPlayers.map((p) => (
                <View key={p.id} style={s.approvedChip}>
                  <Text style={{ fontSize: 12, color: C.green }}>
                    {users.find((u) => u.id === p.playerId)?.name}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {withdrawnPlayers.length > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={[s.rosterSectionLabel, { color: C.red }]}>
              {t("withdrawnLabel")}
            </Text>
            {withdrawnPlayers.map((p) => {
              const player = users.find((u) => u.id === p.playerId);
              return (
                <View key={p.id} style={s.withdrawnRow}>
                  <Text style={{ fontSize: 12, color: C.red }}>
                    <Text style={{ fontWeight: "bold" }}>{player?.name}:</Text>{" "}
                    "{p.withdrawReason}"
                  </Text>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

// ---- Simple helpers ----
function FieldInput({
  label,
  value,
  onChangeText,
  placeholder,
  multiline = false,
  error = false,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
  error?: boolean;
}) {
  return (
    <View>
      <Text style={[s.label, error && { color: C.red }]}>{label}</Text>
      <TextInput
        style={[
          s.input,
          multiline && { height: 80, textAlignVertical: "top" },
          error && s.inputError,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={C.slate400}
        multiline={multiline}
      />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.rowBetween}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  scrollContent: { padding: 16, paddingBottom: 100 },
  sectionTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: C.slate800,
    marginBottom: 16,
  },
  card: {
    backgroundColor: C.white,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: C.slate200,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  cardTitle: { fontSize: 16, fontWeight: "bold", color: C.slate800, flex: 1 },
  statusBadge: {
    backgroundColor: "#dcfce7",
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: { fontSize: 10, fontWeight: "bold", color: C.green },
  metaRow: { fontSize: 13, color: C.slate600, marginTop: 4 },
  infoBox: {
    backgroundColor: C.slate50,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: C.slate100,
    gap: 4,
  },
  infoLabel: { fontSize: 12, fontWeight: "600", color: C.slate600 },
  infoValue: {
    fontSize: 12,
    color: C.slate700,
    maxWidth: "60%",
    textAlign: "right",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  hintText: { fontSize: 12, color: C.slate500 },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: C.slate700,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: C.slate300,
    borderRadius: 12,
    padding: 12,
    fontSize: 13,
    color: C.slate800,
    backgroundColor: C.white,
  },
  inputError: {
    borderColor: C.red,
    backgroundColor: "#fff5f5",
  },
  fieldError: {
    borderColor: C.red,
    backgroundColor: "#fff5f5",
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
  btnDisabled: { backgroundColor: C.slate200, shadowOpacity: 0 },
  btnText: { color: C.white, fontWeight: "700", fontSize: 14 },
  bottomNav: {
    flexDirection: "row",
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderColor: C.slate200,
    paddingVertical: 8,
    paddingBottom: Platform.OS === "ios" ? 24 : 8,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 10,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: "#dbeafe",
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnSm: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: C.slate50,
    borderWidth: 1,
    borderColor: C.slate200,
    alignItems: "center",
    justifyContent: "center",
  },
  tagBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.slate100,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  tagBtnText: { fontSize: 12, fontWeight: "600", color: C.slate700 },
  emptyBox: {
    borderWidth: 1,
    borderColor: C.slate300,
    borderStyle: "dashed",
    borderRadius: 14,
    padding: 32,
    alignItems: "center",
    marginBottom: 12,
  },
  emptyText: { fontSize: 13, color: C.slate400, textAlign: "center" },
  countBadge: {
    backgroundColor: C.slate100,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  countBadgeText: { fontSize: 11, color: C.slate500 },
  playerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.slate50,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.slate100,
    marginBottom: 6,
  },
  avatarSm: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarLg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  subText: { fontSize: 11, color: C.slate500 },
  boldLg: { fontSize: 17, fontWeight: "bold", color: C.slate800 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.blueLight,
    padding: 12,
    borderRadius: 12,
  },
  codeBg: {
    backgroundColor: C.slate800,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  codeSmall: { fontSize: 11, color: "#94a3b8", marginBottom: 6 },
  codeLarge: {
    fontSize: 28,
    fontWeight: "bold",
    color: C.white,
    letterSpacing: 4,
    fontFamily:
      Platform.select({ ios: "Courier", android: "monospace" }) ?? "monospace",
  },
  pendingBox: {
    backgroundColor: "#fff7ed",
    padding: 12,
    borderRadius: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#fed7aa",
  },
  pendingRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.white,
    padding: 8,
    borderRadius: 8,
    marginTop: 6,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  acceptBtn: {
    backgroundColor: C.green,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  rosterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: C.slate50,
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.slate200,
  },
  approveBtn: {
    backgroundColor: C.blue,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
  },
  rosterSectionLabel: {
    fontSize: 10,
    fontWeight: "bold",
    color: C.slate400,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  approvedChip: {
    backgroundColor: "#dcfce7",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  withdrawnRow: {
    backgroundColor: C.redLight,
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  groupSelectRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.slate200,
    backgroundColor: C.slate50,
  },
  groupSelectActive: { borderColor: C.blue, backgroundColor: C.blueLight },
  dateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: C.slate300,
    borderRadius: 12,
    padding: 12,
    backgroundColor: C.white,
  },
  dateBtnText: { fontSize: 13, color: C.slate800, fontWeight: "500" },
  spinner: { height: 120, marginTop: -4 },
});
