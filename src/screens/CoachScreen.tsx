/**
 * 教练仪表盘 (Coach Dashboard)
 * 对应 App.jsx 的 CoachView + GameManagementCard
 */
import * as Clipboard from "expo-clipboard";
import {
  ArrowRightLeft,
  Calendar,
  Check,
  ChevronDown,
  ChevronRight,
  Key,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Trophy,
  User,
  UserPlus,
  Users,
  UserX,
} from "lucide-react-native";
import React, { useState } from "react";
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
import {
  apiFetch,
  mapClub,
  mapGame,
  mapMatchApp,
  mapRoster,
  mapTeamGroup,
} from "../api";
import { AppModal, C, DatePickerField, NavBtn } from "../components/shared";
import { useLanguage } from "../i18n";
import { sendAppNotification } from "../storage";
import {
  Club,
  Game,
  MatchApplication,
  ModalConfig,
  RosterEntry,
  TeamGroup,
  User as UserType,
} from "../types";

interface CoachState {
  currentUser: UserType;
  setCurrentUser: React.Dispatch<React.SetStateAction<UserType | null>>;
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
  coachProfileOpen: boolean;
  setCoachProfileOpen: (v: boolean) => void;
  hasUnreadMatchApplicationNotif?: boolean;
}

interface CoachProfileScreenProps {
  visible: boolean;
  onClose: () => void;
  currentUser: UserType;
  clubs: Club[];
  showToast: (msg: string) => void;
  setCurrentUser: (updater: any) => void;
}

function CoachProfileScreen({
  visible,
  onClose,
  currentUser,
  clubs,
  showToast,
  setCurrentUser,
}: CoachProfileScreenProps) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const [phone, setPhone] = React.useState(currentUser.phone ?? "");
  const [location, setLocation] = React.useState(
    currentUser.defaultLocation ?? "",
  );
  const [sport, setSport] = React.useState(currentUser.sport ?? "");
  const [sportOpen, setSportOpen] = React.useState(false);
  // Multi-select sports
  const [selectedSports, setSelectedSports] = React.useState<string[]>(
    parseSports(currentUser.sport),
  );
  const toggleSport = (s: string) =>
    setSelectedSports((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    );
  const [clubId, setClubId] = React.useState<string | null>(
    currentUser.defaultClubId ?? null,
  );
  const [clubOpen, setClubOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [emailCode, setEmailCode] = React.useState("");
  const [codeSending, setCodeSending] = React.useState(false);
  const [codeSent, setCodeSent] = React.useState(false);
  const [newPwd, setNewPwd] = React.useState("");
  const [confirmPwd, setConfirmPwd] = React.useState("");
  const [showNewPwd, setShowNewPwd] = React.useState(false);
  const [pwdError, setPwdError] = React.useState("");
  const [pwdSaving, setPwdSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const data = await apiFetch(`/users/${currentUser.id}/profile`, {
        method: "PUT",
        body: {
          phone: phone.trim() || null,
          defaultLocation: location.trim() || null,
          defaultClubId: clubId || null,
          sport: selectedSports.join(",") || null,
        },
      });
      setCurrentUser((prev: any) => ({
        ...prev,
        phone: data.phone || null,
        defaultLocation: data.default_location || null,
        defaultClubId: data.default_club_id || null,
        sport: data.sport || null,
      }));
      showToast(t("profileSaved"));
    } catch (err: any) {
      showToast(t("profileSaveFailed") + ": " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const sendPasswordCode = async () => {
    setPwdError("");
    setCodeSending(true);
    try {
      await apiFetch("/send_password_reset_code", {
        method: "POST",
        body: { email: currentUser.email },
      });
      setCodeSent(true);
      showToast(t("codeSentHint"));
    } catch (err: any) {
      setPwdError(err.message || t("profilePwdFailed"));
    } finally {
      setCodeSending(false);
    }
  };

  const changePassword = async () => {
    setPwdError("");
    if (!emailCode.trim()) {
      setPwdError(t("errCodeRequired"));
      return;
    }
    if (!newPwd || !confirmPwd) {
      setPwdError(t("profilePwdFillAll"));
      return;
    }
    if (newPwd !== confirmPwd) {
      setPwdError(t("errPwdMismatch"));
      return;
    }
    if (newPwd.length < 6) {
      setPwdError(t("errPwdTooShort"));
      return;
    }
    if (/[ <>'"]/.test(newPwd)) {
      setPwdError(t("errPwdInvalid"));
      return;
    }
    setPwdSaving(true);
    try {
      await apiFetch(`/users/${currentUser.id}/change_password`, {
        method: "POST",
        body: { emailCode: emailCode.trim(), newPassword: newPwd },
      });
      setEmailCode("");
      setNewPwd("");
      setConfirmPwd("");
      setCodeSent(false);
      showToast(t("profilePwdUpdated"));
    } catch (err: any) {
      setPwdError(err.message || t("profilePwdFailed"));
    } finally {
      setPwdSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.slate50 }}
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
            onPress={onClose}
            hitSlop={12}
            style={{ marginRight: 12 }}
          >
            <Text style={{ fontSize: 16, color: C.blue }}>
              {t("profileBack")}
            </Text>
          </TouchableOpacity>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: C.slate800,
              flex: 1,
            }}
          >
            {t("profilePersonalInfo")}
          </Text>
        </View>
        <ScrollView
          contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 60 }}
          keyboardShouldPersistTaps="handled"
        >
          <Text
            style={{
              fontSize: 12,
              color: C.slate500,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: "600",
            }}
          >
            {t("profileBasicInfo")}
          </Text>
          <View>
            <Text style={s.fieldLabel}>{t("labelFullName")}</Text>
            <View
              style={[
                s.searchRow,
                { marginBottom: 0, backgroundColor: C.slate100 },
              ]}
            >
              <User size={15} color={C.slate400} />
              <Text
                style={[s.searchInput, { color: C.slate500, paddingTop: 0 }]}
              >
                {currentUser.name}
              </Text>
            </View>
          </View>
          <View>
            <Text style={s.fieldLabel}>{t("labelEmail")}</Text>
            <View
              style={[
                s.searchRow,
                { marginBottom: 0, backgroundColor: C.slate100 },
              ]}
            >
              <Mail size={15} color={C.slate400} />
              <Text
                style={[s.searchInput, { color: C.slate500, paddingTop: 0 }]}
              >
                {currentUser.email}
              </Text>
            </View>
          </View>
          <View>
            <Text style={s.fieldLabel}>{t("labelPhone")}</Text>
            <View style={[s.searchRow, { marginBottom: 0 }]}>
              <Phone size={15} color={C.slate400} />
              <TextInput
                style={s.searchInput}
                placeholder="+86 138 0000 0000"
                placeholderTextColor={C.slate400}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
              />
            </View>
          </View>
          <View>
            <Text style={s.fieldLabel}>{t("profileFieldLocation")}</Text>
            <View style={[s.searchRow, { marginBottom: 0 }]}>
              <MapPin size={15} color={C.slate400} />
              <TextInput
                style={s.searchInput}
                placeholder="e.g. City Sports Center"
                placeholderTextColor={C.slate400}
                value={location}
                onChangeText={setLocation}
              />
            </View>
          </View>
          {/* Sport multi-select */}
          <View>
            <Text style={s.fieldLabel}>{t("sportInfoLabel")}</Text>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 8,
                marginTop: 4,
              }}
            >
              {ALL_SPORTS.map((opt) => {
                const active = selectedSports.includes(opt);
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[s.genderBtn, active && s.genderBtnActive]}
                    onPress={() => toggleSport(opt)}
                  >
                    <Text
                      style={[s.genderBtnText, active && s.genderBtnTextActive]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          {clubs.length > 0 && (
            <View>
              <Text style={s.fieldLabel}>{t("profileMainClub")}</Text>
              <TouchableOpacity
                style={s.dropdownTrigger}
                onPress={() => setClubOpen((v) => !v)}
              >
                <Text
                  style={clubId ? s.dropdownValueText : s.dropdownPlaceholder}
                >
                  {clubs.find((c) => c.id === clubId)?.name ?? t("clubNotSet")}
                </Text>
                <Text style={{ color: C.slate400 }}>
                  {clubOpen ? "▲" : "▼"}
                </Text>
              </TouchableOpacity>
              {clubOpen && (
                <View style={s.dropdownList}>
                  <TouchableOpacity
                    style={[s.dropdownItem, !clubId && s.dropdownItemActive]}
                    onPress={() => {
                      setClubId(null);
                      setClubOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        s.dropdownItemText,
                        !clubId && s.dropdownItemTextActive,
                      ]}
                    >
                      不设置
                    </Text>
                  </TouchableOpacity>
                  {clubs.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        s.dropdownItem,
                        clubId === c.id && s.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setClubId(c.id);
                        setClubOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          s.dropdownItemText,
                          clubId === c.id && s.dropdownItemTextActive,
                        ]}
                      >
                        🏆 {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
          <TouchableOpacity
            style={[s.btn, saving && s.btnDisabled]}
            onPress={save}
            disabled={saving}
          >
            <Text style={s.btnText}>
              {saving ? t("profilePwdUpdating") : t("save")}
            </Text>
          </TouchableOpacity>
          <View
            style={{
              marginTop: 12,
              borderTopWidth: 1,
              borderTopColor: C.slate200,
              paddingTop: 16,
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: C.slate500,
                textTransform: "uppercase",
                letterSpacing: 0.5,
                fontWeight: "600",
                marginBottom: 12,
              }}
            >
              {t("profileChangePwd")}
            </Text>
            <Text
              style={{
                fontSize: 12,
                color: C.slate500,
                marginBottom: 4,
              }}
            >
              {t("profilePwdCodeHint").replace("{email}", currentUser.email)}
            </Text>
            <View style={{ gap: 12 }}>
              <View>
                <Text style={s.fieldLabel}>{t("labelEmailCode")}</Text>
                <View style={[s.searchRow, { marginBottom: 0 }]}>
                  <Mail size={15} color={C.slate400} />
                  <TextInput
                    style={[s.searchInput, { flex: 1 }]}
                    placeholder="123456"
                    placeholderTextColor={C.slate400}
                    value={emailCode}
                    onChangeText={setEmailCode}
                    keyboardType="number-pad"
                  />
                  <TouchableOpacity
                    onPress={sendPasswordCode}
                    disabled={codeSending}
                    hitSlop={8}
                  >
                    <Text style={{ fontSize: 12, color: C.blue }}>
                      {codeSending
                        ? t("loading")
                        : codeSent
                          ? "✓ " + t("btnSendCode")
                          : t("btnSendCode")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View>
                <Text style={s.fieldLabel}>{t("profileNewPwd")}</Text>
                <View style={[s.searchRow, { marginBottom: 0 }]}>
                  <Key size={15} color={C.slate400} />
                  <TextInput
                    style={[s.searchInput, { flex: 1 }]}
                    placeholder={t("pwdHint")}
                    placeholderTextColor={C.slate400}
                    value={newPwd}
                    onChangeText={setNewPwd}
                    secureTextEntry={!showNewPwd}
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPwd((v) => !v)}
                    hitSlop={8}
                  >
                    <Text style={{ fontSize: 12, color: C.blue }}>
                      {showNewPwd ? t("pwdHide") : t("pwdShow")}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View>
                <Text style={s.fieldLabel}>{t("profileConfirmNewPwd")}</Text>
                <View style={[s.searchRow, { marginBottom: 0 }]}>
                  <Key size={15} color={C.slate400} />
                  <TextInput
                    style={s.searchInput}
                    placeholder={t("profilePwdConfirmPh")}
                    placeholderTextColor={C.slate400}
                    value={confirmPwd}
                    onChangeText={setConfirmPwd}
                    secureTextEntry
                  />
                </View>
              </View>
              {!!pwdError && (
                <Text style={{ fontSize: 13, color: "#ef4444" }}>
                  ⚠ {pwdError}
                </Text>
              )}
              <TouchableOpacity
                style={[
                  s.btn,
                  { backgroundColor: C.slate700 },
                  pwdSaving && s.btnDisabled,
                ]}
                onPress={changePassword}
                disabled={pwdSaving}
              >
                <Text style={s.btnText}>
                  {pwdSaving
                    ? t("profilePwdUpdating")
                    : t("profilePwdUpdateBtn")}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function CoachScreen({ state }: { state: CoachState }) {
  const {
    currentUser,
    setCurrentUser,
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
    coachProfileOpen,
    setCoachProfileOpen,
    hasUnreadMatchApplicationNotif,
  } = state;
  const { t } = useLanguage();

  const [tab, setTab] = useState<
    "discover" | "my_games" | "confirmed" | "team"
  >("confirmed");
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [filterSport, setFilterSport] = useState<string[]>(
    currentUser.sport ? [currentUser.sport] : [],
  );
  const [filterAgeGroup, setFilterAgeGroup] = useState<string[]>([]);
  const [filterGender, setFilterGender] = useState<string[]>([]);
  const [teamFilterAgeGroup, setTeamFilterAgeGroup] = useState<string[]>([]);
  const [teamFilterGender, setTeamFilterGender] = useState<string[]>([]);
  const [discoverSearch, setDiscoverSearch] = useState("");
  const [inviteCodeInput, setInviteCodeInput] = useState("");
  const [inviteCodeLooking, setInviteCodeLooking] = useState(false);
  const [unlockedPrivateGameIds, setUnlockedPrivateGameIds] = useState<
    Set<string>
  >(new Set());
  const [clubs, setClubs] = useState<Club[]>([]);
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedClubIds, setExpandedClubIds] = useState<Set<string>>(
    new Set(),
  );
  const [expandedDiscoverIds, setExpandedDiscoverIds] = useState<Set<string>>(
    new Set(),
  );

  // Reset sport filter + auto-select age/gender from coach's teams every time discover tab opens
  React.useEffect(() => {
    if (tab === "discover") {
      if (currentUser.sport) {
        setFilterSport(parseSports(currentUser.sport));
      }
      const myTeams = teamGroups.filter((tg) => tg.coachId === currentUser.id);
      const myAgeGroups = myTeams.flatMap((tg) => parseAgeGroups(tg.ageGroup));
      const uniqueAges = Array.from(new Set(myAgeGroups));
      if (uniqueAges.length > 0) {
        setFilterAgeGroup(uniqueAges);
      }
      const myGenders = myTeams
        .filter((tg) => tg.gender)
        .map((tg) => tg.gender as string);
      const uniqueGenders = Array.from(new Set(myGenders));
      if (uniqueGenders.length > 0) {
        setFilterGender(uniqueGenders as ("male" | "female" | "mixed")[]);
      }
    }
  }, [tab]);

  const toggleDiscoverExpand = (id: string) =>
    setExpandedDiscoverIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleGroupExpand = (id: string) =>
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleClubExpand = (id: string) =>
    setExpandedClubIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  React.useEffect(() => {
    apiFetch(`/clubs`)
      .then((data: any[]) => setClubs(data.map(mapClub)))
      .catch(() => {});
  }, [currentUser.id]);

  // Clubs belonging to the current coach only (for UI pickers / team tab)
  const myClubs = clubs.filter((c) => c.coachId === currentUser.id);

  // ---- Profile modal is opened/closed via coachProfileOpen prop directly ----

  const toggleFilter = (
    set: React.Dispatch<React.SetStateAction<string[]>>,
    val: string,
  ) =>
    set((prev) =>
      prev.includes(val) ? prev.filter((x) => x !== val) : [...prev, val],
    );

  const myCreatedGames = games.filter((g) => g.creatorId === currentUser.id);
  const hasIncomingPendingApplications =
    hasUnreadMatchApplicationNotif ||
    matchApplications.some((m) => {
      if (m.status !== "pending") return false;
      const targetGame = games.find((g) => g.id === m.gameId);
      return targetGame?.creatorId === currentUser.id;
    });
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
      const myGroups = teamGroups.filter((tg) => tg.coachId === currentUser.id);
      const initialClubId = currentUser.defaultClubId ?? myClubs[0]?.id ?? null;
      const [filterClubId, setFilterClubId] = useState<string | null>(
        myClubs.length > 0 ? initialClubId : null,
      );
      const [clubOpen, setClubOpen] = useState(false);

      const filteredGroups =
        filterClubId === null
          ? myGroups
          : myGroups.filter((g) => g.clubId === filterClubId);

      const initialGroup = filteredGroups[0] ?? myGroups[0];
      const [homeGroupId, setHomeGroupId] = useState(initialGroup?.id ?? "");
      const [homeGroupOpen, setHomeGroupOpen] = useState(false);
      const coachSports = parseSports(currentUser.sport);
      const sportOptions = coachSports.length > 0 ? coachSports : ALL_SPORTS;
      const defaultSport = sportOptions[0] ?? "";
      const [sport, setSport] = useState(
        normalizeSportName(initialGroup?.sport) || defaultSport,
      );
      const [sportOpen, setSportOpen] = useState(false);
      const [time, setTime] = useState("");
      const [location, setLocation] = useState(
        currentUser.defaultLocation ?? "",
      );
      const [ageGroup, setAgeGroup] = useState(
        parseAgeGroups(initialGroup?.ageGroup)[0] ?? "",
      );
      const [ageGroupOpen, setAgeGroupOpen] = useState(false);
      const [gender, setGender] = useState<"male" | "female" | "mixed" | "">(
        (initialGroup?.gender ?? "male") as "male" | "female" | "mixed" | "",
      );
      const [description, setDescription] = useState("");
      const [contactPhone, setContactPhone] = useState(currentUser.phone ?? "");
      const [isPrivate, setIsPrivate] = useState(false);
      const [visibilityOpen, setVisibilityOpen] = useState(false);
      const [submitted, setSubmitted] = useState(false);

      const selectedHomeGroup = myGroups.find((g) => g.id === homeGroupId);
      const ageGroupLocked =
        parseAgeGroups(selectedHomeGroup?.ageGroup).length === 1;
      const genderLocked = !!selectedHomeGroup?.gender;
      const sportLocked = !!selectedHomeGroup?.sport;

      const formatGroupMeta = (g: (typeof myGroups)[0]) => {
        const genderText = g.gender
          ? t(
              `gender${g.gender.charAt(0).toUpperCase() + g.gender.slice(1)}` as any,
            )
          : "—";
        return `${formatAgeGroupLabel(g.ageGroup) || "—"} · ${genderText}`;
      };

      const selectHomeGroup = (id: string) => {
        setHomeGroupId(id);
        setHomeGroupOpen(false);
        const grp = myGroups.find((g) => g.id === id);
        if (grp) {
          const ages = parseAgeGroups(grp.ageGroup);
          setAgeGroup(ages[0] ?? "");
          if (grp.gender) setGender(grp.gender);
          if (grp.sport) setSport(normalizeSportName(grp.sport));
          else setSport(defaultSport);
        }
      };

      React.useEffect(() => {
        const grp = myGroups.find((g) => g.id === homeGroupId);
        if (!grp) return;
        const ages = parseAgeGroups(grp.ageGroup);
        setAgeGroup(ages[0] ?? "");
        if (grp.gender) setGender(grp.gender);
        if (grp.sport) setSport(normalizeSportName(grp.sport));
        else setSport(defaultSport);
      }, [homeGroupId]);

      React.useEffect(() => {
        if (ageGroupLocked) setAgeGroupOpen(false);
      }, [ageGroupLocked]);

      React.useEffect(() => {
        if (sportLocked) setSportOpen(false);
      }, [sportLocked]);

      const create = async () => {
        if (
          !sport ||
          !time ||
          !location ||
          !ageGroup ||
          !homeGroupId ||
          !contactPhone
        ) {
          setSubmitted(true);
          showToast(t("fillRequiredFields"));
          return;
        }
        try {
          const data = await apiFetch("/games", {
            method: "POST",
            body: {
              creatorId: currentUser.id,
              sport,
              time,
              location,
              ageGroup,
              gender: gender || null,
              description,
              contactPhone: contactPhone || null,
              homeGroupId: homeGroupId || null,
              isPrivate,
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
          {/* Club picker — very first */}
          {myClubs.length > 0 && (
            <View>
              <Text style={s.fieldLabel}>{t("labelClubAssign")}</Text>
              <TouchableOpacity
                style={s.dropdownTrigger}
                onPress={() => setClubOpen((v) => !v)}
              >
                <Text
                  style={
                    filterClubId ? s.dropdownValueText : s.dropdownPlaceholder
                  }
                >
                  {filterClubId
                    ? (myClubs.find((c) => c.id === filterClubId)?.name ?? "—")
                    : t("filterAll")}
                </Text>
                <Text style={{ color: C.slate400 }}>
                  {clubOpen ? "▲" : "▼"}
                </Text>
              </TouchableOpacity>
              {clubOpen && (
                <View style={s.dropdownList}>
                  <TouchableOpacity
                    style={[
                      s.dropdownItem,
                      filterClubId === null && s.dropdownItemActive,
                    ]}
                    onPress={() => {
                      setFilterClubId(null);
                      setClubOpen(false);
                      setHomeGroupId("");
                    }}
                  >
                    <Text
                      style={[
                        s.dropdownItemText,
                        filterClubId === null && s.dropdownItemTextActive,
                      ]}
                    >
                      {t("filterAll")}
                    </Text>
                  </TouchableOpacity>
                  {myClubs.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        s.dropdownItem,
                        filterClubId === c.id && s.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setFilterClubId(c.id);
                        setClubOpen(false);
                        // reset home group if it doesn't belong to new club
                        const still = myGroups.find(
                          (g) => g.id === homeGroupId && g.clubId === c.id,
                        );
                        if (!still) {
                          const first = myGroups.find((g) => g.clubId === c.id);
                          setHomeGroupId(first?.id ?? "");
                        }
                      }}
                    >
                      <Text
                        style={[
                          s.dropdownItemText,
                          filterClubId === c.id && s.dropdownItemTextActive,
                        ]}
                      >
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
          {/* Home team picker — first */}
          <View>
            <Text style={s.fieldLabel}>{t("selectHomeTeamLabel")} *</Text>
            {filteredGroups.length === 0 ? (
              <Text style={[s.hintText, submitted && s.inputError]}>
                {t("noGroupsCreateFirst")}
              </Text>
            ) : (
              <>
                <TouchableOpacity
                  style={[
                    s.dropdownTrigger,
                    submitted && !homeGroupId && s.inputError,
                  ]}
                  onPress={() => setHomeGroupOpen((v) => !v)}
                >
                  {(() => {
                    const selectedGroup = filteredGroups.find(
                      (g) => g.id === homeGroupId,
                    );
                    if (!selectedGroup) {
                      return <Text style={s.dropdownPlaceholder}>—</Text>;
                    }
                    return (
                      <View style={{ flex: 1 }}>
                        <Text style={s.dropdownValueText}>
                          {selectedGroup.name}
                        </Text>
                        <Text
                          style={{
                            fontSize: 11,
                            color: C.slate500,
                            marginTop: 1,
                          }}
                        >
                          {formatGroupMeta(selectedGroup)}
                        </Text>
                      </View>
                    );
                  })()}
                  <Text style={{ color: C.slate400 }}>
                    {homeGroupOpen ? "▲" : "▼"}
                  </Text>
                </TouchableOpacity>
                {homeGroupOpen && (
                  <View style={s.dropdownList}>
                    {filteredGroups.map((g) => (
                      <TouchableOpacity
                        key={g.id}
                        style={[
                          s.dropdownItem,
                          homeGroupId === g.id && s.dropdownItemActive,
                        ]}
                        onPress={() => selectHomeGroup(g.id)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text
                            style={[
                              s.dropdownItemText,
                              homeGroupId === g.id && s.dropdownItemTextActive,
                            ]}
                          >
                            {g.name}
                          </Text>
                          <Text
                            style={{
                              fontSize: 11,
                              color: homeGroupId === g.id ? C.blue : C.slate500,
                              marginTop: 1,
                            }}
                          >
                            {formatGroupMeta(g)}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
          {/* Sport collapsible picker */}
          <View>
            <Text style={s.fieldLabel}>{t("sportInfoLabel")} *</Text>
            <TouchableOpacity
              style={[
                s.dropdownTrigger,
                submitted && !sport && s.inputError,
                sportLocked && { opacity: 0.7 },
              ]}
              onPress={() => !sportLocked && setSportOpen((v) => !v)}
              disabled={sportLocked}
            >
              <Text style={sport ? s.dropdownValueText : s.dropdownPlaceholder}>
                {sport || "Football / Basketball…"}
              </Text>
              <Text style={{ color: C.slate400 }}>
                {sportLocked ? "🔒" : sportOpen ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>
            {sportOpen && (
              <View style={s.dropdownList}>
                {sportOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      s.dropdownItem,
                      sport === opt && s.dropdownItemActive,
                    ]}
                    onPress={() => {
                      setSport(opt);
                      setSportOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        s.dropdownItemText,
                        sport === opt && s.dropdownItemTextActive,
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
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
          {/* Age group collapsible picker */}
          <View>
            <Text style={s.fieldLabel}>{t("ageGroupLabel")} *</Text>
            <TouchableOpacity
              style={[
                s.dropdownTrigger,
                submitted && !ageGroup && s.inputError,
                ageGroupLocked && { opacity: 0.7 },
              ]}
              onPress={() => !ageGroupLocked && setAgeGroupOpen((v) => !v)}
              disabled={ageGroupLocked}
            >
              <Text
                style={ageGroup ? s.dropdownValueText : s.dropdownPlaceholder}
              >
                {ageGroup || "U10 – U21"}
              </Text>
              <Text style={{ color: C.slate400 }}>
                {ageGroupLocked ? "🔒" : ageGroupOpen ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>
            {ageGroupOpen && (
              <View style={s.dropdownList}>
                {[
                  "U10",
                  "U11",
                  "U12",
                  "U13",
                  "U14",
                  "U15",
                  "U16",
                  "U17",
                  "U18",
                  "U19",
                  "U20",
                  "U21",
                  "Others",
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      s.dropdownItem,
                      ageGroup === opt && s.dropdownItemActive,
                    ]}
                    onPress={() => {
                      setAgeGroup(opt);
                      setAgeGroupOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        s.dropdownItemText,
                        ageGroup === opt && s.dropdownItemTextActive,
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {/* Gender picker */}
          <View>
            <Text style={s.fieldLabel}>{t("genderLabel")}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {(["male", "female", "mixed"] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    s.genderBtn,
                    gender === opt && s.genderBtnActive,
                    genderLocked && { opacity: gender === opt ? 1 : 0.65 },
                  ]}
                  onPress={() => !genderLocked && setGender(opt)}
                  disabled={genderLocked}
                >
                  <Text
                    style={[
                      s.genderBtnText,
                      gender === opt && s.genderBtnTextActive,
                    ]}
                  >
                    {t(
                      `gender${opt.charAt(0).toUpperCase() + opt.slice(1)}` as any,
                    )}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <FieldInput
            label={t("detailsContactLabel")}
            value={description}
            onChangeText={setDescription}
            placeholder={t("createMatchDescPh")}
            multiline
          />
          <FieldInput
            label={t("contactPhoneOptLabel")}
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder="e.g. +1 555-0100"
          />
          {/* Visibility picker */}
          <View>
            <Text style={s.fieldLabel}>可见范围</Text>
            <TouchableOpacity
              style={s.dropdownTrigger}
              onPress={() => setVisibilityOpen((v) => !v)}
            >
              <Text style={s.dropdownValueText}>
                {isPrivate ? "🔒 仅邀请码可见" : "🌐 公开"}
              </Text>
              <Text style={{ color: C.slate400 }}>
                {visibilityOpen ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>
            {visibilityOpen && (
              <View style={s.dropdownList}>
                <TouchableOpacity
                  style={[s.dropdownItem, !isPrivate && s.dropdownItemActive]}
                  onPress={() => {
                    setIsPrivate(false);
                    setVisibilityOpen(false);
                  }}
                >
                  <Text
                    style={[
                      s.dropdownItemText,
                      !isPrivate && s.dropdownItemTextActive,
                    ]}
                  >
                    🌐 公开——所有教练可在发现页看到
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.dropdownItem, isPrivate && s.dropdownItemActive]}
                  onPress={() => {
                    setIsPrivate(true);
                    setVisibilityOpen(false);
                  }}
                >
                  <Text
                    style={[
                      s.dropdownItemText,
                      isPrivate && s.dropdownItemTextActive,
                    ]}
                  >
                    🔒 仅邀请码可见——创建后生成邀请码
                  </Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <TouchableOpacity
            style={[s.btn, (!homeGroupId || !contactPhone) && s.btnDisabled]}
            onPress={create}
            disabled={!homeGroupId || !contactPhone}
          >
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

  const openManageClubsModal = () => {
    const ModalContent = () => {
      const [clubName, setClubName] = React.useState("");
      const [localClubs, setLocalClubs] = React.useState<Club[]>(myClubs);
      const createClub = async () => {
        if (!clubName.trim()) return;
        try {
          const data = await apiFetch("/clubs", {
            method: "POST",
            body: { coachId: currentUser.id, name: clubName.trim() },
          });
          const newClub = mapClub(data);
          setLocalClubs((prev) => [...prev, newClub]);
          setClubs((prev) => [...prev, newClub]);
          setClubName("");
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      const deleteClub = async (clubId: string) => {
        try {
          await apiFetch(`/clubs/${clubId}`, { method: "DELETE" });
          setLocalClubs((prev) => prev.filter((c) => c.id !== clubId));
          setClubs((prev) => prev.filter((c) => c.id !== clubId));
          // Unlink any team groups that belonged to this club
          setTeamGroups((prev) =>
            prev.map((tg) =>
              tg.clubId === clubId ? { ...tg, clubId: null } : tg,
            ),
          );
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      const confirmDeleteClub = (club: Club) => {
        Alert.alert(
          "删除 Club",
          `确定要删除 ${club.name} 吗？`,
          [
            { text: "取消", style: "cancel" },
            {
              text: "删除",
              style: "destructive",
              onPress: () => {
                void deleteClub(club.id);
              },
            },
          ],
        );
      };
      return (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 13, color: C.slate600 }}>
            {t("manageClubsDesc")}
          </Text>
          {localClubs.length === 0 ? (
            <View style={s.emptyBox}>
              <Text style={s.emptyText}>{t("noClubs")}</Text>
            </View>
          ) : (
            localClubs.map((club) => (
              <View
                key={club.id}
                style={[s.rowBetween, s.infoBox, { paddingVertical: 10 }]}
              >
                <Text
                  style={{ fontWeight: "600", color: C.slate800, fontSize: 14 }}
                >
                  🏆 {club.name}
                </Text>
                <TouchableOpacity onPress={() => confirmDeleteClub(club)}>
                  <Trash2 size={16} color={C.red} />
                </TouchableOpacity>
              </View>
            ))
          )}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <TextInput
              style={[s.input, { flex: 1 }]}
              placeholder={t("phClubName")}
              placeholderTextColor={C.slate400}
              value={clubName}
              onChangeText={setClubName}
            />
            <TouchableOpacity
              style={[
                s.btn,
                { paddingHorizontal: 16 },
                !clubName.trim() && s.btnDisabled,
              ]}
              onPress={createClub}
              disabled={!clubName.trim()}
            >
              <Text style={s.btnText}>{t("createClubBtn")}</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    };
    setModal({ title: t("manageClubsTitle"), content: <ModalContent /> });
  };

  const openAddGroupModal = (prefillClubId?: string | null) => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [name, setName] = useState("");
      const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>([]);
      const [ageOpen, setAgeOpen] = useState(false);
      const [gender, setGender] = useState<"male" | "female" | "mixed" | "">(
        "male",
      );
      const [clubId] = useState<string | null>(prefillClubId ?? null);
      const coachSports = parseSports(currentUser.sport);
      const sportOptions = coachSports.length > 0 ? coachSports : ALL_SPORTS;
      const [sport, setSport] = useState(
        coachSports.length === 1 ? coachSports[0] : "",
      );
      const [sportOpen, setSportOpen] = useState(false);
      const toggleAgeGroup = (opt: string) => {
        setSelectedAgeGroups((prev) =>
          prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
        );
      };

      const serializedAgeGroup = serializeAgeGroups(selectedAgeGroups);
      const create = async () => {
        if (!name.trim()) {
          showToast(t("groupNameRequired"));
          return;
        }
        if (selectedAgeGroups.length === 0) {
          showToast(t("ageGroupLabel"));
          return;
        }
        if (!sport) {
          showToast(t("sportInfoLabel"));
          return;
        }
        const normalized = name.trim().toLowerCase();
        const duplicatedGroup = teamGroups.some(
          (tg) =>
            tg.coachId === currentUser.id &&
            tg.name.trim().toLowerCase() === normalized &&
            serializeAgeGroups(parseAgeGroups(tg.ageGroup)) === serializedAgeGroup &&
            (tg.clubId || null) === (clubId || null),
        );
        if (duplicatedGroup) {
          showToast(t("groupNameDuplicate"));
          return;
        }
        try {
          const data = await apiFetch("/team_groups", {
            method: "POST",
            body: {
              coachId: currentUser.id,
              teamName: name.trim(),
              playerIds: [],
              ageGroup: serializedAgeGroup,
              gender: gender || null,
              clubId: clubId || null,
              sport: sport || null,
            },
          });
          const newGroup = mapTeamGroup(data);
          setTeamGroups((prev) => [...prev, newGroup]);
          if (newGroup.clubId) {
            setExpandedClubIds((prev) => {
              const next = new Set(prev);
              next.add(newGroup.clubId!);
              return next;
            });
          }
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
            placeholder="Group Name"
          />

          <View>
            <Text style={s.fieldLabel}>{t("ageGroupLabel")}</Text>
            <TouchableOpacity
              style={s.dropdownTrigger}
              onPress={() => setAgeOpen((v) => !v)}
            >
              <Text
                style={
                  selectedAgeGroups.length > 0
                    ? s.dropdownValueText
                    : s.dropdownPlaceholder
                }
              >
                {selectedAgeGroups.length > 0
                  ? formatAgeGroupLabel(serializeAgeGroups(selectedAgeGroups))
                  : t("ageGroupLabel")}
              </Text>
              <Text style={{ color: C.slate400 }}>{ageOpen ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {ageOpen && (
              <View style={s.dropdownList}>
                {AGE_GROUP_OPTIONS.map((opt) => {
                  const active = selectedAgeGroups.includes(opt);
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[s.dropdownItem, active && s.dropdownItemActive]}
                      onPress={() => toggleAgeGroup(opt)}
                    >
                      <View style={s.rowBetween}>
                        <Text
                          style={[
                            s.dropdownItemText,
                            active && s.dropdownItemTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                        {active && <Check size={16} color={C.blue} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          <View>
            <Text style={s.fieldLabel}>{t("genderLabel")}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {(["male", "female", "mixed"] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[s.genderBtn, gender === opt && s.genderBtnActive]}
                  onPress={() => setGender(opt)}
                >
                  <Text
                    style={[
                      s.genderBtnText,
                      gender === opt && s.genderBtnTextActive,
                    ]}
                  >
                    {t(
                      `gender${opt.charAt(0).toUpperCase() + opt.slice(1)}` as any,
                    )}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View>
            <Text style={s.fieldLabel}>{t("sportInfoLabel")}</Text>
            {sportOptions.length === 1 ? (
              <View style={[s.dropdownTrigger, { backgroundColor: C.slate100 }]}>
                <Text style={s.dropdownValueText}>{sportOptions[0]}</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={s.dropdownTrigger}
                  onPress={() => setSportOpen((v) => !v)}
                >
                  <Text
                    style={sport ? s.dropdownValueText : s.dropdownPlaceholder}
                  >
                    {sport || "Select sport"}
                  </Text>
                  <Text style={{ color: C.slate400 }}>
                    {sportOpen ? "▲" : "▼"}
                  </Text>
                </TouchableOpacity>
                {sportOpen && (
                  <View style={s.dropdownList}>
                    {sportOptions.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          s.dropdownItem,
                          sport === opt && s.dropdownItemActive,
                        ]}
                        onPress={() => {
                          setSport(opt);
                          setSportOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            s.dropdownItemText,
                            sport === opt && s.dropdownItemTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>

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

  const openAddOfflinePlayerModal = (variants: TeamGroup[]) => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [playerName, setPlayerName] = useState("");
      const [selectedGroupId, setSelectedGroupId] = useState(
        variants[0]?.id ?? "",
      );
      const add = async () => {
        if (!playerName.trim() || !selectedGroupId) {
          showToast(t("offlinePlayerNameLabel"));
          return;
        }
        try {
          const data = await apiFetch(
            `/team_groups/${selectedGroupId}/offline_players`,
            {
              method: "POST",
              body: { name: playerName.trim() },
            },
          );
          setTeamGroups((prev) =>
            prev.map((g) =>
              g.id === selectedGroupId
                ? {
                    ...g,
                    offlinePlayers: [
                      ...g.offlinePlayers,
                        {
                          id: data.id,
                          name: data.name,
                          bindCode: data.bind_code || null,
                        },
                    ],
                  }
                : g,
            ),
          );
          setExpandedGroupIds((prev) => {
            const next = new Set(prev);
            next.add(selectedGroupId);
            return next;
          });
          setModal(null);
          showToast(
            data.bind_code
              ? `${t("playerAdded")} ${t("bindCodeLabel")}: ${data.bind_code}`
              : t("playerAdded"),
          );
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };
      return (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 13, color: C.slate600 }}>
            {t("offlinePlayerModalDesc")}
          </Text>
          {variants.length > 1 && (
            <View>
              <Text style={s.fieldLabel}>{t("selectGroupLabel")}</Text>
              {variants.map((v) => (
                <TouchableOpacity
                  key={v.id}
                  style={[
                    s.groupSelectRow,
                    selectedGroupId === v.id && s.groupSelectActive,
                  ]}
                  onPress={() => setSelectedGroupId(v.id)}
                >
                  <Text
                    style={[
                      { fontSize: 13, color: C.slate700 },
                      selectedGroupId === v.id && { fontWeight: "700" },
                    ]}
                  >
                    {v.ageGroup ?? "—"}{" "}
                    {v.gender === "male"
                      ? "♂"
                      : v.gender === "female"
                        ? "♀"
                        : v.gender === "mixed"
                          ? "⚥"
                          : ""}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
          <FieldInput
            label={t("offlinePlayerNameLabel")}
            value={playerName}
            onChangeText={setPlayerName}
            placeholder={t("offlinePlayerNameLabel")}
          />
          <TouchableOpacity
            style={[s.btn, !playerName.trim() && s.btnDisabled]}
            onPress={add}
            disabled={!playerName.trim()}
          >
            <Text style={s.btnText}>{t("addPlayerBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({ title: t("addPlayerBtn"), content: <ModalContent /> });
  };

  const confirmRemoveOfflinePlayer = (
    groupId: string,
    offlinePlayerId: string,
    playerName: string,
  ) => {
    setModal({
      title: `移除 ${playerName}`,
      content: (
        <View style={{ gap: 12 }}>
          <Text style={{ color: C.slate600, fontSize: 13 }}>
            确定要从队伍中移除 {playerName} 吗？
          </Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.red }]}
            onPress={async () => {
              try {
                await apiFetch(
                  `/team_groups/${groupId}/offline_players/${offlinePlayerId}`,
                  { method: "DELETE" },
                );
                setTeamGroups((prev) =>
                  prev.map((g) =>
                    g.id === groupId
                      ? {
                          ...g,
                          offlinePlayers: g.offlinePlayers.filter(
                            (p) => p.id !== offlinePlayerId,
                          ),
                        }
                      : g,
                  ),
                );
                setModal(null);
                showToast("已移除球员");
              } catch (err: any) {
                showToast("Failed: " + err.message);
              }
            }}
          >
            <Text style={s.btnText}>确认移除</Text>
          </TouchableOpacity>
        </View>
      ),
    });
  };

  const openEditGroupModal = (group: TeamGroup) => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [name, setName] = useState(group.name);
      const [selectedAgeGroups, setSelectedAgeGroups] = useState<string[]>(
        parseAgeGroups(group.ageGroup),
      );
      const [ageOpen, setAgeOpen] = useState(false);
      const [gender, setGender] = useState<"male" | "female" | "mixed" | "">(
        group.gender ?? "male",
      );
      const [clubId, setClubId] = useState<string | null>(group.clubId ?? null);
      const [clubOpen, setClubOpen] = useState(false);
      const coachSports = parseSports(currentUser.sport);
      const sportOptions = coachSports.length > 0 ? coachSports : ALL_SPORTS;
      const [sport, setSport] = useState(
        group.sport ?? (coachSports.length === 1 ? coachSports[0] : ""),
      );
      const [sportOpen, setSportOpen] = useState(false);
      const toggleAgeGroup = (opt: string) => {
        setSelectedAgeGroups((prev) =>
          prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt],
        );
      };
      const save = async () => {
        if (!name.trim()) {
          showToast(t("nameRequired"));
          return;
        }
        if (selectedAgeGroups.length === 0) {
          showToast(t("ageGroupLabel"));
          return;
        }
        const serializedAgeGroup = serializeAgeGroups(selectedAgeGroups);
        try {
          await apiFetch(`/team_groups/${group.id}`, {
            method: "PUT",
            body: {
              teamName: name,
              ageGroup: serializedAgeGroup,
              gender: gender || null,
              clubId: clubId || null,
              sport: sport || null,
            },
          });
          setTeamGroups((prev) =>
            prev.map((g) =>
              g.id === group.id
                ? {
                    ...g,
                    name,
                  ageGroup: serializedAgeGroup || null,
                    gender: (gender || null) as any,
                    clubId: clubId || null,
                    sport: sport || null,
                  }
                : g,
            ),
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
          {/* Age group picker */}
          <View>
            <Text style={s.fieldLabel}>{t("ageGroupLabel")}</Text>
            <TouchableOpacity
              style={s.dropdownTrigger}
              onPress={() => setAgeOpen((v) => !v)}
            >
              <Text
                style={
                  selectedAgeGroups.length > 0
                    ? s.dropdownValueText
                    : s.dropdownPlaceholder
                }
              >
                {selectedAgeGroups.length > 0
                  ? formatAgeGroupLabel(serializeAgeGroups(selectedAgeGroups))
                  : t("ageGroupLabel")}
              </Text>
              <Text style={{ color: C.slate400 }}>{ageOpen ? "▲" : "▼"}</Text>
            </TouchableOpacity>
            {ageOpen && (
              <View style={s.dropdownList}>
                {AGE_GROUP_OPTIONS.map((opt) => {
                  const active = selectedAgeGroups.includes(opt);
                  return (
                    <TouchableOpacity
                      key={opt}
                      style={[s.dropdownItem, active && s.dropdownItemActive]}
                      onPress={() => toggleAgeGroup(opt)}
                    >
                      <View style={s.rowBetween}>
                        <Text
                          style={[
                            s.dropdownItemText,
                            active && s.dropdownItemTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                        {active && <Check size={16} color={C.blue} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
          {/* Gender picker */}
          <View>
            <Text style={s.fieldLabel}>{t("genderLabel")}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {(["male", "female", "mixed"] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[s.genderBtn, gender === opt && s.genderBtnActive]}
                  onPress={() => setGender(opt)}
                >
                  <Text
                    style={[
                      s.genderBtnText,
                      gender === opt && s.genderBtnTextActive,
                    ]}
                  >
                    {t(
                      `gender${opt.charAt(0).toUpperCase() + opt.slice(1)}` as any,
                    )}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          {/* Club picker */}
          {myClubs.length > 0 && (
            <View>
              <Text style={s.fieldLabel}>{t("labelClubAssign")}</Text>
              <TouchableOpacity
                style={s.dropdownTrigger}
                onPress={() => setClubOpen((v) => !v)}
              >
                <Text
                  style={clubId ? s.dropdownValueText : s.dropdownPlaceholder}
                >
                  {myClubs.find((c) => c.id === clubId)?.name ??
                    t("clubNotSelect")}
                </Text>
                <Text style={{ color: C.slate400 }}>
                  {clubOpen ? "▲" : "▼"}
                </Text>
              </TouchableOpacity>
              {clubOpen && (
                <View style={s.dropdownList}>
                  <TouchableOpacity
                    style={[s.dropdownItem, !clubId && s.dropdownItemActive]}
                    onPress={() => {
                      setClubId(null);
                      setClubOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        s.dropdownItemText,
                        !clubId && s.dropdownItemTextActive,
                      ]}
                    >
                      {t("clubNotSelect")}
                    </Text>
                  </TouchableOpacity>
                  {myClubs.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[
                        s.dropdownItem,
                        clubId === c.id && s.dropdownItemActive,
                      ]}
                      onPress={() => {
                        setClubId(c.id);
                        setClubOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          s.dropdownItemText,
                          clubId === c.id && s.dropdownItemTextActive,
                        ]}
                      >
                        🏆 {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}
          {/* Sport picker */}
          <View>
            <Text style={s.fieldLabel}>{t("sportInfoLabel")}</Text>
            {sportOptions.length === 1 ? (
              <View
                style={[s.dropdownTrigger, { backgroundColor: C.slate100 }]}
              >
                <Text style={s.dropdownValueText}>{sportOptions[0]}</Text>
              </View>
            ) : (
              <>
                <TouchableOpacity
                  style={s.dropdownTrigger}
                  onPress={() => setSportOpen((v) => !v)}
                >
                  <Text
                    style={sport ? s.dropdownValueText : s.dropdownPlaceholder}
                  >
                    {sport || "选择运动类型…"}
                  </Text>
                  <Text style={{ color: C.slate400 }}>
                    {sportOpen ? "▲" : "▼"}
                  </Text>
                </TouchableOpacity>
                {sportOpen && (
                  <View style={s.dropdownList}>
                    {sportOptions.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          s.dropdownItem,
                          sport === opt && s.dropdownItemActive,
                        ]}
                        onPress={() => {
                          setSport(opt);
                          setSportOpen(false);
                        }}
                      >
                        <Text
                          style={[
                            s.dropdownItemText,
                            sport === opt && s.dropdownItemTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
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

  const openApplyToGameModal = (game: Game) => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const myGroups = teamGroups.filter((tg) => tg.coachId === currentUser.id);

      const matchingGroups = myGroups.filter(
        (g) =>
          !!g.sport &&
          !!game.sport &&
          normalizeSportName(g.sport) === normalizeSportName(game.sport),
      );

      const defaultId = matchingGroups[0]?.id ?? "";
      const [selectedGroupId, setSelectedGroupId] = useState(defaultId);

      const apply = async () => {
        if (!selectedGroupId) {
          showToast(t("fillRequiredFields"));
          return;
        }
        try {
          const data = await apiFetch("/match_applications", {
            method: "POST",
            body: {
              gameId: game.id,
              applicantCoachId: currentUser.id,
              applicantGroupId: selectedGroupId,
              status: "pending",
            },
          });
          setMatchApplications((prev) => [...prev, mapMatchApp(data)]);
          setModal(null);
          showToast(t("applySent"));
        } catch (err: any) {
          showToast("Failed: " + err.message);
        }
      };

      const GroupRow = ({ g }: { g: (typeof myGroups)[0] }) => (
        <TouchableOpacity
          style={[
            s.groupSelectRow,
            selectedGroupId === g.id && s.groupSelectActive,
          ]}
          onPress={() => setSelectedGroupId(g.id)}
        >
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: selectedGroupId === g.id ? C.blue : C.slate700,
                fontWeight: "600",
              }}
            >
              {g.name}
            </Text>
            <Text style={{ fontSize: 11, color: C.slate400, marginTop: 2 }}>
              {(formatAgeGroupLabel(g.ageGroup) || "—") +
                " · " +
                (g.gender
                  ? t(
                      `gender${g.gender.charAt(0).toUpperCase() + g.gender.slice(1)}` as any,
                    )
                  : "—")}
            </Text>
          </View>
          {selectedGroupId === g.id && <Check size={14} color={C.blue} />}
        </TouchableOpacity>
      );

      return (
        <View style={{ gap: 12 }}>
          <Text style={s.label}>{t("selectGroupLabel")}</Text>
          {myGroups.length === 0 ? (
            <Text style={s.hintText}>{t("noGroupsCreateFirst")}</Text>
          ) : matchingGroups.length === 0 ? (
            <Text style={s.hintText}>{t("noMatchingGroupsForGame")}</Text>
          ) : (
            <>
              {/* Matching groups — always visible */}
              {matchingGroups.length > 0 && (
                <>
                  {!!game.sport && (
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 2,
                      }}
                    >
                      <View
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: C.green,
                        }}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          color: C.green,
                          fontWeight: "700",
                        }}
                      >
                        {t("matchingTeamsLabel")}
                        {`  ${normalizeSportName(game.sport)}`}
                      </Text>
                    </View>
                  )}
                  {matchingGroups.map((g) => (
                    <GroupRow key={g.id} g={g} />
                  ))}
                </>
              )}
            </>
          )}
          <TouchableOpacity
            style={[s.btn, !selectedGroupId && s.btnDisabled]}
            onPress={apply}
            disabled={!selectedGroupId}
          >
            <Text style={s.btnText}>{t("confirmApplyBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({
      title: t("applyToGameTitle"),
      content: <ModalContent />,
    });
  };

  const openInviteForGame = (game: Game) => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const myGroups = teamGroups.filter((tg) => tg.coachId === currentUser.id);
      // Home coach → homeGroupId; away coach → their accepted application's group
      const myAcceptedApp = matchApplications.find(
        (m) =>
          m.gameId === game.id &&
          m.applicantCoachId === currentUser.id &&
          m.status === "accepted",
      );
      const defaultGroupId =
        game.creatorId === currentUser.id
          ? (game.homeGroupId ?? myGroups[0]?.id ?? "")
          : (myAcceptedApp?.applicantGroupId ?? myGroups[0]?.id ?? "");
      const [selectedGroupId, setSelectedGroupId] = useState(defaultGroupId);
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
          {myGroups.map((g) => {
            const isLocked = g.id !== defaultGroupId;
            const isSelected = selectedGroupId === g.id;
            return (
              <TouchableOpacity
                key={g.id}
                style={[
                  s.groupSelectRow,
                  isSelected && s.groupSelectActive,
                  isLocked && { opacity: 0.35 },
                ]}
                onPress={() => !isLocked && setSelectedGroupId(g.id)}
                activeOpacity={isLocked ? 1 : 0.7}
              >
                <Text
                  style={{
                    color: isSelected ? C.blue : C.slate700,
                    fontWeight: "600",
                    flex: 1,
                  }}
                >
                  {g.name}
                </Text>
                {isLocked ? (
                  <Text style={{ fontSize: 11, color: C.slate400 }}>🔒</Text>
                ) : isSelected ? (
                  <Check size={14} color={C.blue} />
                ) : null}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={s.btn} onPress={send}>
            <Text style={s.btnText}>{t("sendInvitationsBtn")}</Text>
          </TouchableOpacity>
        </View>
      );
    };
    setModal({ title: t("invitePlayersTitle"), content: <ModalContent /> });
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
        {/* ===== DISCOVER TAB ===== */}
        {tab === "discover" && (
          <View>
            <Text style={s.sectionTitle}>{t("discoverMatches")}</Text>
            {/* ---- Search box ---- */}
            <View style={s.searchRow}>
              <Search size={16} color={C.slate400} />
              <TextInput
                style={s.searchInput}
                placeholder={t("discoverSearchPh")}
                placeholderTextColor={C.slate400}
                value={discoverSearch}
                onChangeText={setDiscoverSearch}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
            </View>
            {/* ---- Private game invite-code lookup ---- */}
            <View
              style={[
                s.searchRow,
                { marginBottom: 8, borderColor: C.slate200 },
              ]}
            >
              <Key size={15} color={C.slate400} />
              <TextInput
                style={[s.searchInput, { textTransform: "uppercase" }]}
                placeholder="输入邀请码查看私密比赛"
                placeholderTextColor={C.slate400}
                value={inviteCodeInput}
                onChangeText={(v) => setInviteCodeInput(v.toUpperCase())}
                autoCapitalize="characters"
                returnKeyType="search"
              />
              <TouchableOpacity
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  backgroundColor:
                    inviteCodeInput.length >= 4 ? C.blue : C.slate200,
                  borderRadius: 6,
                }}
                disabled={inviteCodeInput.length < 4 || inviteCodeLooking}
                onPress={async () => {
                  setInviteCodeLooking(true);
                  try {
                    const data = await apiFetch(
                      `/games/by_invite/${inviteCodeInput.trim()}`,
                    );
                    const game = mapGame(data);
                    // Add to local games list if not already present
                    setGames((prev) =>
                      prev.some((g) => g.id === game.id)
                        ? prev
                        : [...prev, game],
                    );
                    setUnlockedPrivateGameIds((prev) => {
                      const next = new Set(prev);
                      next.add(game.id);
                      return next;
                    });
                    setInviteCodeInput("");
                    showToast("已找到比赛，可在下方申请对战");
                    setExpandedDiscoverIds((prev) => {
                      const next = new Set(prev);
                      next.add(game.id);
                      return next;
                    });
                  } catch {
                    showToast("邀请码无效或比赛不存在");
                  } finally {
                    setInviteCodeLooking(false);
                  }
                }}
              >
                <Text
                  style={{
                    color: inviteCodeInput.length >= 4 ? C.white : C.slate400,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  查找
                </Text>
              </TouchableOpacity>
            </View>
            {(() => {
              const allSports = [
                "Football/Soccer",
                "Basketball",
                "Tennis",
                "Volleyball",
              ];
              const allAges = [
                "U10",
                "U11",
                "U12",
                "U13",
                "U14",
                "U15",
                "U16",
                "U17",
                "U18",
                "U19",
                "U20",
                "U21",
                "Others",
              ];
              const allGenders: ("male" | "female" | "mixed")[] = [
                "male",
                "female",
                "mixed",
              ];
              // 全部 = 清空该组 (length===0 代表不限制)
              const sportIsAll = filterSport.length === 0;
              const ageIsAll = filterAgeGroup.length === 0;
              const genderIsAll = filterGender.length === 0;
              return (
                <View style={{ marginBottom: 12, gap: 0 }}>
                  {/* Sport */}
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 6,
                      paddingBottom: 8,
                    }}
                  >
                    <TouchableOpacity
                      style={[s.filterChip, sportIsAll && s.filterChipActive]}
                      onPress={() => setFilterSport([])}
                    >
                      <Text
                        style={[
                          s.filterChipText,
                          sportIsAll && s.filterChipTextActive,
                        ]}
                      >
                        {t("filterAll")}
                      </Text>
                    </TouchableOpacity>
                    {allSports.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          s.filterChip,
                          filterSport.includes(opt) && s.filterChipActive,
                        ]}
                        onPress={() => toggleFilter(setFilterSport, opt)}
                      >
                        <Text
                          style={[
                            s.filterChipText,
                            filterSport.includes(opt) && s.filterChipTextActive,
                          ]}
                        >
                          {sportEmoji(opt)} {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View
                    style={{
                      height: 1,
                      backgroundColor: C.slate200,
                      marginBottom: 8,
                    }}
                  />
                  {/* Age group */}
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 6,
                      paddingBottom: 8,
                    }}
                  >
                    <TouchableOpacity
                      style={[s.filterChip, ageIsAll && s.filterChipActive]}
                      onPress={() => setFilterAgeGroup([])}
                    >
                      <Text
                        style={[
                          s.filterChipText,
                          ageIsAll && s.filterChipTextActive,
                        ]}
                      >
                        {t("filterAll")}
                      </Text>
                    </TouchableOpacity>
                    {allAges.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          s.filterChip,
                          filterAgeGroup.includes(opt) && s.filterChipActive,
                        ]}
                        onPress={() => toggleFilter(setFilterAgeGroup, opt)}
                      >
                        <Text
                          style={[
                            s.filterChipText,
                            filterAgeGroup.includes(opt) &&
                              s.filterChipTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <View
                    style={{
                      height: 1,
                      backgroundColor: C.slate200,
                      marginBottom: 8,
                    }}
                  />
                  {/* Gender */}
                  <View
                    style={{
                      flexDirection: "row",
                      flexWrap: "wrap",
                      gap: 6,
                      paddingBottom: 4,
                    }}
                  >
                    <TouchableOpacity
                      style={[s.filterChip, genderIsAll && s.filterChipActive]}
                      onPress={() => setFilterGender([])}
                    >
                      <Text
                        style={[
                          s.filterChipText,
                          genderIsAll && s.filterChipTextActive,
                        ]}
                      >
                        {t("filterAll")}
                      </Text>
                    </TouchableOpacity>
                    {allGenders.map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          s.filterChip,
                          filterGender.includes(opt) && s.filterChipActive,
                        ]}
                        onPress={() => toggleFilter(setFilterGender, opt)}
                      >
                        <Text
                          style={[
                            s.filterChipText,
                            filterGender.includes(opt) &&
                              s.filterChipTextActive,
                          ]}
                        >
                          {t(
                            `gender${opt.charAt(0).toUpperCase() + opt.slice(1)}` as any,
                          )}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })()}
            {(() => {
              const filtered = games
                .filter(
                  (g) =>
                    g.creatorId !== currentUser.id &&
                    g.status === "open" &&
                    (!g.isPrivate || unlockedPrivateGameIds.has(g.id)) &&
                    (filterSport.length === 0 ||
                      filterSport.includes(g.sport)) &&
                    (filterAgeGroup.length === 0 ||
                      filterAgeGroup.some((f) =>
                        matchesAgeFilter(g.ageGroup, f),
                      )) &&
                    (filterGender.length === 0 ||
                      g.gender === null ||
                      filterGender.includes(g.gender)) &&
                    (() => {
                      const kw = discoverSearch.trim().toLowerCase();
                      if (!kw) return true;
                      const creator = users.find((u) => u.id === g.creatorId);
                      const homeGroup = teamGroups.find(
                        (tg) => tg.id === g.homeGroupId,
                      );
                      const opposingGroup = teamGroups.find(
                        (tg) => tg.id === g.opposingGroupId,
                      );
                      return (
                        g.sport.toLowerCase().includes(kw) ||
                        (g.gender ?? "").toLowerCase().includes(kw) ||
                        g.time.toLowerCase().includes(kw) ||
                        g.ageGroup.toLowerCase().includes(kw) ||
                        (creator?.name ?? "").toLowerCase().includes(kw) ||
                        (homeGroup?.name ?? "").toLowerCase().includes(kw) ||
                        (opposingGroup?.name ?? "").toLowerCase().includes(kw)
                      );
                    })(),
                )
                .map((game) => {
                  const creator = users.find((u) => u.id === game.creatorId);
                  const homeGroup = teamGroups.find(
                    (tg) => tg.id === game.homeGroupId,
                  );
                  const homeClub = homeGroup?.clubId
                    ? clubs.find((c) => c.id === homeGroup.clubId)
                    : null;
                  const creatorClub = creator?.defaultClubId
                    ? clubs.find((c) => c.id === creator.defaultClubId)
                    : null;
                  const displayClub = homeClub ?? creatorClub;
                  const hasApplied = matchApplications.some(
                    (m) =>
                      m.gameId === game.id &&
                      m.applicantCoachId === currentUser.id,
                  );
                  return (
                    <View key={game.id} style={s.card}>
                      {/* Always-visible: title + status + time + location */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => toggleDiscoverExpand(game.id)}
                      >
                        <View style={s.cardHeader}>
                          <Text style={s.cardTitle}>
                            {sportEmoji(game.sport)}
                            {" - "}
                            {displayClub
                              ? displayClub.name
                              : (creator?.name ?? game.sport)}
                            {" - "}
                            {game.ageGroup}
                          </Text>
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <View style={s.statusBadge}>
                              <Text style={s.statusText}>
                                {game.status.toUpperCase()}
                              </Text>
                            </View>
                            {expandedDiscoverIds.has(game.id) ? (
                              <ChevronDown size={16} color={C.slate400} />
                            ) : (
                              <ChevronRight size={16} color={C.slate400} />
                            )}
                          </View>
                        </View>
                        <Text style={s.metaRow}>
                          <Text>📅 </Text>
                          {fmtDateTime(game.time)}
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
                      </TouchableOpacity>

                      {/* Collapsible details */}
                      {expandedDiscoverIds.has(game.id) && (
                        <View style={{ marginTop: 6 }}>
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
                          {game.gender && (
                            <Text
                              style={[
                                s.metaRow,
                                {
                                  color: genderColor(game.gender),
                                  fontWeight: "600",
                                },
                              ]}
                            >
                              {game.gender === "male"
                                ? "♂"
                                : game.gender === "female"
                                  ? "♀"
                                  : "⚥"}{" "}
                              {t(
                                `gender${game.gender.charAt(0).toUpperCase() + game.gender.slice(1)}` as any,
                              )}
                            </Text>
                          )}
                          {!!game.description && (
                            <View style={s.infoBox}>
                              <Text style={s.hintText}>{game.description}</Text>
                            </View>
                          )}
                          {game.status === "open" ? (
                            <TouchableOpacity
                              style={[s.btn, hasApplied && s.btnDisabled]}
                              onPress={() => openApplyToGameModal(game)}
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
                      )}
                    </View>
                  );
                });
              if (filtered.length === 0) {
                return (
                  <View style={s.emptyBox}>
                    <Text style={s.emptyText}>{t("noMatchesFound")}</Text>
                  </View>
                );
              }
              return filtered;
            })()}
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
            {allMyGames
              .filter((game) => game.status !== "locked")
              .map((game) => (
                <GameManagementCard
                  key={game.id}
                  game={game}
                  state={{ ...state, showToast, setModal, clubs }}
                />
              ))}
          </View>
        )}

        {/* ===== CONFIRMED TAB ===== */}
        {tab === "confirmed" && (
          <View>
            <Text style={s.sectionTitle}>{t("confirmedGamesLabel")}</Text>
            {allMyGames.filter((g) => g.status === "locked").length === 0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>{t("noConfirmedGames")}</Text>
              </View>
            )}
            {allMyGames
              .filter((g) => g.status === "locked")
              .map((game) => (
                <GameManagementCard
                  key={game.id}
                  game={game}
                  state={{ ...state, showToast, setModal, clubs }}
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
                  style={[s.tagBtn, { backgroundColor: "#fef9c3" }]}
                  onPress={openManageClubsModal}
                >
                  <Trophy size={14} color="#b45309" />
                  <Text style={[s.tagBtnText, { color: "#b45309" }]}>
                    {" "}
                    {t("labelClubAssign")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Filter chips: age group */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 6,
                paddingBottom: 4,
                marginBottom: 4,
              }}
            >
              {[
                "U10",
                "U11",
                "U12",
                "U13",
                "U14",
                "U15",
                "U16",
                "U17",
                "U18",
                "U19",
                "U20",
                "U21",
                "Others",
              ].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    s.filterChip,
                    teamFilterAgeGroup.includes(opt) && s.filterChipActive,
                  ]}
                  onPress={() => toggleFilter(setTeamFilterAgeGroup, opt)}
                >
                  <Text
                    style={[
                      s.filterChipText,
                      teamFilterAgeGroup.includes(opt) &&
                        s.filterChipTextActive,
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Filter chips: gender */}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                gap: 6,
                paddingBottom: 4,
                marginBottom: 10,
              }}
            >
              {(["male", "female", "mixed"] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    s.filterChip,
                    teamFilterGender.includes(opt) && s.filterChipActive,
                  ]}
                  onPress={() => toggleFilter(setTeamFilterGender, opt)}
                >
                  <Text
                    style={[
                      s.filterChipText,
                      teamFilterGender.includes(opt) && s.filterChipTextActive,
                    ]}
                  >
                    {opt
                      ? t(
                          `gender${opt.charAt(0).toUpperCase() + opt.slice(1)}` as any,
                        )
                      : t("filterAll")}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {teamGroups.filter((tg) => tg.coachId === currentUser.id).length ===
              0 && (
              <View style={s.emptyBox}>
                <Text style={s.emptyText}>{t("noGroupsYet")}</Text>
              </View>
            )}

            {(() => {
              const myTeams = teamGroups.filter(
                (tg) =>
                  tg.coachId === currentUser.id &&
                  (teamFilterAgeGroup.length === 0 ||
                    teamFilterAgeGroup.some((f) =>
                      matchesAgeFilter(tg.ageGroup, f),
                    )) &&
                  (teamFilterGender.length === 0 ||
                    teamFilterGender.includes(tg.gender ?? "")),
              );

              const renderNameGroups = (teams: typeof myTeams) => {
                return teams.map((group, idx) => {
                  const isLast = idx === teams.length - 1;
                  const isExpanded = expandedGroupIds.has(group.id);
                  return (
                    <View key={group.id} style={{ marginBottom: 10 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        <TouchableOpacity
                          style={{
                            flex: 1,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 6,
                            paddingVertical: 7,
                          }}
                          onPress={() => toggleGroupExpand(group.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown size={14} color={C.slate500} />
                          ) : (
                            <ChevronRight size={14} color={C.slate400} />
                          )}
                          <Text
                            style={{
                              fontWeight: "700",
                              color: C.slate700,
                              fontSize: 13,
                            }}
                          >
                            {group.name}
                          </Text>
                          {group.ageGroup ? (
                            <View
                              style={[
                                s.statusBadge,
                                { backgroundColor: "#eff6ff" },
                              ]}
                            >
                              <Text style={[s.statusText, { color: C.blue }]}>
                                {formatAgeGroupLabel(group.ageGroup)}
                              </Text>
                            </View>
                          ) : null}
                          {!!group.gender && (
                            <View
                              style={[
                                s.statusBadge,
                                {
                                  backgroundColor:
                                    group.gender === "male"
                                      ? "#eff6ff"
                                      : group.gender === "female"
                                        ? "#fdf2f8"
                                        : "#f8fafc",
                                },
                              ]}
                            >
                              <Text
                                style={[
                                  s.statusText,
                                  { color: genderColor(group.gender) },
                                ]}
                              >
                                {group.gender === "male"
                                  ? "♂"
                                  : group.gender === "female"
                                    ? "♀"
                                    : "⚥"}
                              </Text>
                            </View>
                          )}
                          <View style={s.countBadge}>
                            <Text style={s.countBadgeText}>
                              {group.playerIds.length + group.offlinePlayers.length}
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <View style={{ flexDirection: "row", gap: 4 }}>
                          <TouchableOpacity
                            style={s.iconBtnSm}
                            onPress={() => openAddOfflinePlayerModal([group])}
                          >
                            <UserPlus size={13} color={C.slate600} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.iconBtnSm}
                            onPress={() => openInviteCodeModal(group)}
                          >
                            <Key size={13} color={C.green} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.iconBtnSm}
                            onPress={() => openEditGroupModal(group)}
                          >
                            <Pencil size={13} color={C.blue} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={s.iconBtnSm}
                            onPress={() => confirmDeleteGroup(group.id)}
                          >
                            <Trash2 size={13} color={C.red} />
                          </TouchableOpacity>
                        </View>
                      </View>

                      {isExpanded && (
                        <View
                          style={{
                            paddingLeft: 22,
                            paddingTop: 4,
                            paddingBottom: 6,
                          }}
                        >
                          {group.playerIds.length === 0 &&
                          group.offlinePlayers.length === 0 ? (
                            <Text style={[s.emptyText, { fontSize: 12 }]}>
                              {t("emptyGroup")}
                            </Text>
                          ) : (
                            <>
                              {group.playerIds.map((pid) => {
                                const player = users.find((u) => u.id === pid);
                                return (
                                  <View
                                    key={pid}
                                    style={[s.playerRow, { paddingVertical: 6 }]}
                                  >
                                    <View
                                      style={{
                                        flexDirection: "row",
                                        alignItems: "center",
                                        gap: 8,
                                      }}
                                    >
                                      <View style={s.avatarSm}>
                                        <User size={14} color={C.slate400} />
                                      </View>
                                      <View>
                                        <Text
                                          style={{
                                            fontWeight: "600",
                                            color: C.slate800,
                                            fontSize: 13,
                                          }}
                                        >
                                          {player?.name}
                                        </Text>
                                        <Text style={s.subText}>{player?.email}</Text>
                                      </View>
                                    </View>
                                    <View style={{ flexDirection: "row", gap: 4 }}>
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
                                        <ArrowRightLeft size={13} color={C.blue} />
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
                                        <UserX size={13} color={C.red} />
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                );
                              })}
                              {group.offlinePlayers.map((op) => (
                                <View
                                  key={op.id}
                                  style={[s.playerRow, { paddingVertical: 6 }]}
                                >
                                  <View
                                    style={{
                                      flexDirection: "row",
                                      alignItems: "center",
                                      gap: 8,
                                    }}
                                  >
                                    <View
                                      style={[s.avatarSm, { backgroundColor: C.slate100 }]}
                                    >
                                      <User size={14} color={C.slate400} />
                                    </View>
                                    <View>
                                      <Text
                                        style={{
                                          fontWeight: "600",
                                          color: C.slate800,
                                          fontSize: 13,
                                        }}
                                      >
                                        {op.name}
                                      </Text>
                                      <Text
                                        style={[s.subText, { color: C.slate400 }]}
                                      >
                                        {t("offlineNoAccountLabel")}
                                        {op.bindCode
                                          ? ` · ${t("bindCodeLabel")} ${op.bindCode}`
                                          : ""}
                                      </Text>
                                    </View>
                                  </View>
                                  <TouchableOpacity
                                    style={s.iconBtnSm}
                                    onPress={() =>
                                      confirmRemoveOfflinePlayer(
                                        group.id,
                                        op.id,
                                        op.name,
                                      )
                                    }
                                  >
                                    <UserX size={13} color={C.red} />
                                  </TouchableOpacity>
                                </View>
                              ))}
                            </>
                          )}
                        </View>
                      )}

                      {!isLast && (
                        <View
                          style={{
                            height: 1,
                            backgroundColor: C.slate100,
                            marginLeft: 8,
                            marginBottom: 2,
                          }}
                        />
                      )}
                    </View>
                  );
                });
              };

              // Build club sections
              type Section = {
                clubId: string | null;
                label: string;
                teams: typeof myTeams;
              };
              const sections: Section[] = myClubs.map((club) => ({
                clubId: club.id,
                label: club.name,
                teams: myTeams.filter((tg) => tg.clubId === club.id),
              }));

              // Unassigned teams
              const unassigned = myTeams.filter(
                (tg) => !tg.clubId || !myClubs.some((c) => c.id === tg.clubId),
              );
              if (unassigned.length > 0 || myClubs.length === 0) {
                sections.push({
                  clubId: null,
                  label: myClubs.length > 0 ? t("unassignedClub") : "",
                  teams: unassigned,
                });
              }

              return sections.map((section) => {
                const sectionKey = section.clubId ?? "__no_club__";
                const isExpanded = expandedClubIds.has(sectionKey);

                // If no clubs configured, render flat (no club header wrapper)
                if (myClubs.length === 0) {
                  return (
                    <View key={sectionKey}>
                      {renderNameGroups(section.teams)}
                    </View>
                  );
                }

                return (
                  <View
                    key={sectionKey}
                    style={[s.card, { paddingBottom: isExpanded ? 8 : 0 }]}
                  >
                    {/* Club header */}
                    <View style={s.rowBetween}>
                      <TouchableOpacity
                        style={{
                          flex: 1,
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 8,
                          paddingVertical: 2,
                        }}
                        onPress={() => toggleClubExpand(sectionKey)}
                        activeOpacity={0.7}
                      >
                        {section.clubId ? (
                          <Trophy size={15} color="#b45309" />
                        ) : (
                          <Users size={15} color={C.slate400} />
                        )}
                        <Text
                          style={[
                            s.cardTitle,
                            {
                              fontSize: 15,
                              color: section.clubId ? "#b45309" : C.slate500,
                            },
                          ]}
                        >
                          {section.label}
                        </Text>
                        <View style={s.countBadge}>
                          <Text style={s.countBadgeText}>
                            {section.teams.length}
                          </Text>
                        </View>
                        {isExpanded ? (
                          <ChevronDown size={15} color={C.slate400} />
                        ) : (
                          <ChevronRight size={15} color={C.slate400} />
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={s.iconBtnSm}
                        onPress={() => openAddGroupModal(section.clubId)}
                      >
                        <Plus size={14} color={C.slate700} />
                      </TouchableOpacity>
                    </View>

                    {/* Teams inside club */}
                    {isExpanded && (
                      <View style={{ marginTop: 10 }}>
                        {section.teams.length === 0 ? (
                          <TouchableOpacity
                            style={[
                              s.emptyBox,
                              {
                                paddingVertical: 16,
                                marginBottom: 0,
                                borderWidth: 1,
                                borderColor: C.slate200,
                                borderStyle: "dashed",
                                borderRadius: 8,
                                flexDirection: "row",
                                gap: 6,
                                justifyContent: "center",
                                alignItems: "center",
                              },
                            ]}
                            onPress={() => openAddGroupModal(section.clubId)}
                          >
                            <Plus size={14} color={C.slate400} />
                            <Text style={s.emptyText}>{t("addTeamBtn")}</Text>
                          </TouchableOpacity>
                        ) : (
                          <View>{renderNameGroups(section.teams)}</View>
                        )}
                      </View>
                    )}
                  </View>
                );
              });
            })()}
            <TouchableOpacity
              style={{
                backgroundColor: "#f5f3ff",
                marginTop: 16,
                paddingVertical: 12,
                borderRadius: 10,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
              onPress={openGenerateCoachCodeModal}
            >
              <UserPlus size={16} color={C.purple} />
              <Text style={[s.tagBtnText, { color: C.purple, fontSize: 14 }]}>
                {t("inviteCoachBtn")}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Bottom nav */}
      <View
        style={[s.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}
      >
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
            <View style={{ position: "relative" }}>
              <Calendar
                size={22}
                color={tab === "my_games" ? C.blue : C.slate400}
              />
              {hasIncomingPendingApplications && (
                <View
                  style={{
                    position: "absolute",
                    top: -2,
                    right: -3,
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: C.red,
                    borderWidth: 1,
                    borderColor: C.white,
                  }}
                />
              )}
            </View>
          }
          label={t("myGamesLabel")}
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
      <CoachProfileScreen
        visible={coachProfileOpen}
        onClose={() => setCoachProfileOpen(false)}
        currentUser={currentUser}
        clubs={myClubs}
        showToast={showToast}
        setCurrentUser={setCurrentUser}
      />
    </KeyboardAvoidingView>
  );
}

// ==========================================
// Helpers
// ==========================================
function sportEmoji(sport: string): string {
  const s = sport.toLowerCase();
  if (s.includes("football") || s.includes("soccer")) return "⚽";
  if (s.includes("basketball")) return "🏀";
  if (s.includes("tennis")) return "🎾";
  if (s.includes("volleyball")) return "🏐";
  return "🏅";
}

const ALL_SPORTS = ["Football/Soccer", "Basketball", "Tennis", "Volleyball"];
const AGE_GROUP_OPTIONS = [
  "U10",
  "U11",
  "U12",
  "U13",
  "U14",
  "U15",
  "U16",
  "U17",
  "U18",
  "U19",
  "U20",
  "U21",
  "Others",
];

function normalizeSportName(sport: string | null | undefined): string {
  const raw = (sport || "").trim();
  if (!raw) return "";
  const lower = raw.toLowerCase();
  if (
    lower === "football" ||
    lower === "soccer" ||
    lower === "football/soccer"
  ) {
    return "Football/Soccer";
  }
  if (lower === "basketball") return "Basketball";
  if (lower === "tennis") return "Tennis";
  if (lower === "volleyball") return "Volleyball";
  return raw;
}

/** Parse comma-separated sport string into array */
function parseSports(sport: string | null): string[] {
  if (!sport) return [];
  const normalized = sport
    .split(",")
    .map((s) => normalizeSportName(s))
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function parseAgeGroups(ageGroup: string | null | undefined): string[] {
  if (!ageGroup) return [];
  return ageGroup
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function ageGroupRank(age: string): number {
  const m = age.match(/^[Uu](\d+)$/);
  if (m) return parseInt(m[1], 10);
  if (age.toLowerCase() === "others") return -1;
  return -2;
}

function sortAgeGroupsDesc(ages: string[]): string[] {
  const unique = Array.from(new Set(ages));
  return unique.sort((a, b) => {
    const ra = ageGroupRank(a);
    const rb = ageGroupRank(b);
    if (ra !== rb) return rb - ra;
    return a.localeCompare(b);
  });
}

function serializeAgeGroups(ages: string[]): string {
  return sortAgeGroupsDesc(ages).join(",");
}

function formatAgeGroupLabel(ageGroup: string | null | undefined): string {
  const ages = sortAgeGroupsDesc(parseAgeGroups(ageGroup));
  return ages.join("/");
}

/** Returns true when `ageGroup` should be included for a given filter chip value. */
function matchesAgeFilter(ageGroup: string | null, filter: string): boolean {
  const groups = parseAgeGroups(ageGroup);
  if (groups.length === 0) return false;
  return groups.some((ag) => {
    const m = ag.match(/^[Uu](\d+)$/);
    const n = m ? parseInt(m[1], 10) : null;
    if (filter === "<U10") return n !== null && n < 10;
    if (filter === ">U21") return n !== null && n > 21;
    if (filter === "Others") return n === null;
    return ag === filter;
  });
}

function genderColor(gender: string | null): string {
  if (gender === "male") return "#3b82f6";
  if (gender === "female") return "#ec4899";
  return "#64748b";
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    clubs: Club[];
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
    clubs,
  } = state;
  const { t } = useLanguage();

  const homeCoach = users.find((u) => u.id === game.creatorId);
  const awayCoach = game.opposingTeamId
    ? users.find((u) => u.id === game.opposingTeamId)
    : null;
  const opponentCoach =
    game.creatorId === currentUser.id ? awayCoach : homeCoach;
  const awayGroup = game.opposingGroupId
    ? teamGroups.find((tg) => tg.id === game.opposingGroupId)
    : null;
  const opponentGroup = awayGroup;
  // Resolve display club: prefer the home group's club, fall back to creator's default club
  const homeGroup = teamGroups.find((tg) => tg.id === game.homeGroupId);
  const homeGroupClub = homeGroup?.clubId
    ? clubs.find((c) => c.id === homeGroup.clubId)
    : null;
  const creatorClub = homeCoach?.defaultClubId
    ? clubs.find((c) => c.id === homeCoach.defaultClubId)
    : null;
  const displayClub = homeGroupClub ?? creatorClub;
  const awayGroupClub = awayGroup?.clubId
    ? clubs.find((c) => c.id === awayGroup.clubId)
    : null;
  const homeTeamDisplay = homeGroup
    ? `${homeGroupClub?.name ?? creatorClub?.name ?? "—"} · ${homeGroup.name}`
    : "—";
  const awayTeamDisplay = awayGroup
    ? `${awayGroupClub?.name ?? "—"} · ${awayGroup.name}`
    : t("pendingLabel");
  const pendingOpponents = matchApplications.filter(
    (m) => m.gameId === game.id && m.status === "pending",
  );
  const gameRoster = rosters.filter((r) => r.gameId === game.id);
  const offlinePlayersById = new Map(
    teamGroups
      .flatMap((tg) => tg.offlinePlayers)
      .map((p) => [p.id, p.name] as const),
  );
  const trackedOfflineIds = new Set(
    gameRoster
      .filter((r) => offlinePlayersById.has(r.playerId))
      .map((r) => r.playerId),
  );
  const defaultOfflineParticipants = (homeGroup?.offlinePlayers ?? []).filter(
    (p) => !trackedOfflineIds.has(p.id),
  );
  const [offlineParticipationMap, setOfflineParticipationMap] = useState<
    Record<string, "approved" | "not_participating">
  >({});
  const locallyParticipatingOffline = defaultOfflineParticipants.filter(
    (p) => (offlineParticipationMap[p.id] ?? "approved") === "approved",
  );
  const locallyNotParticipatingOffline = defaultOfflineParticipants.filter(
    (p) =>
      (offlineParticipationMap[p.id] ?? "approved") === "not_participating",
  );

  const participatingPlayers = gameRoster.filter(
    (r) =>
      r.status === "approved" ||
      r.status === "pending_coach" ||
      r.status === "pending_guardian",
  );
  const nonParticipatingPlayers = gameRoster.filter(
    (r) => r.status === "not_participating" || r.status === "withdrawn",
  );

  const [expanded, setExpanded] = useState(
    pendingOpponents.length > 0 || participatingPlayers.length > 0,
  );

  const volunteerNames = game.volunteers?.length
    ? game.volunteers
        .map((vId) => users.find((u) => u.id === vId)?.name)
        .join(", ")
    : "None";

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

  const handleRejectOpponent = async (app: MatchApplication) => {
    try {
      await apiFetch(`/match_applications/${app.id}`, {
        method: "DELETE",
      });
      setMatchApplications((prev) => prev.filter((m) => m.id !== app.id));
      showToast(t("applicationRejectedRemoved"));
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

  const handleSetParticipation = async (
    entry: RosterEntry,
    status: "approved" | "not_participating",
  ) => {
    if (entry.status === "withdrawn") {
      showToast(t("withdrawnLockedToast"));
      return;
    }

    const applyLocal = () => {
      setRosters((prev) =>
        prev.map((r) =>
          r.id === entry.id
            ? {
                ...r,
                status,
                withdrawReason:
                  status === "not_participating" ? r.withdrawReason : null,
              }
            : r,
        ),
      );
    };

    try {
      await apiFetch(`/rosters/${entry.id}/status`, {
        method: "PUT",
        body: { status },
      });
      applyLocal();
      showToast(
        status === "approved"
          ? t("setToParticipatingToast")
          : t("setToNotParticipatingToast"),
      );
    } catch (err: any) {
      applyLocal();
      showToast(t("setParticipationLocalOnlyToast"));
    }
  };

  const handleSetOfflineParticipation = async (
    offlinePlayerId: string,
    status: "approved" | "not_participating",
  ) => {
    const existing = gameRoster.find((r) => r.playerId === offlinePlayerId);
    if (existing) {
      await handleSetParticipation(existing, status);
      return;
    }

    setOfflineParticipationMap((prev) => ({
      ...prev,
      [offlinePlayerId]: status,
    }));
    showToast(
      status === "approved"
        ? t("setToParticipatingToast")
        : t("setToNotParticipatingToast"),
    );
  };

  const handleDeleteGame = () => {
    setModal({
      title: t("deleteGameTitle"),
      content: (
        <View style={{ gap: 12 }}>
          <Text style={{ color: C.slate600, fontSize: 13 }}>
            {t("deleteGameConfirm")}
          </Text>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: C.red }]}
            onPress={async () => {
              try {
                await apiFetch(`/games/${game.id}`, { method: "DELETE" });
                setGames((prev) => prev.filter((g) => g.id !== game.id));
                setModal(null);
                showToast(t("gameDeleted"));
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

  const openEditGameModal = () => {
    const ModalContent = () => {
      const { t } = useLanguage();
      const [time, setTime] = useState(game.time);
      const [location, setLocation] = useState(game.location);
      const [ageGroup, setAgeGroup] = useState(game.ageGroup);
      const [ageGroupOpen, setAgeGroupOpen] = useState(false);
      const [gender, setGender] = useState<"male" | "female" | "mixed" | "">(
        game.gender ?? "male",
      );
      const [description, setDescription] = useState(game.description);
      const [contactPhone, setContactPhone] = useState(game.contactPhone ?? "");
      const [submitted, setSubmitted] = useState(false);
      const save = async () => {
        if (!time || !location || !ageGroup) {
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
              gender: gender || null,
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
          {/* Age group collapsible picker */}
          <View>
            <Text style={s.fieldLabel}>{t("ageGroupLabel")} *</Text>
            <TouchableOpacity
              style={[
                s.dropdownTrigger,
                submitted && !ageGroup && s.inputError,
              ]}
              onPress={() => setAgeGroupOpen((v) => !v)}
            >
              <Text
                style={ageGroup ? s.dropdownValueText : s.dropdownPlaceholder}
              >
                {ageGroup || "U10 – U21"}
              </Text>
              <Text style={{ color: C.slate400 }}>
                {ageGroupOpen ? "▲" : "▼"}
              </Text>
            </TouchableOpacity>
            {ageGroupOpen && (
              <View style={s.dropdownList}>
                {[
                  "U10",
                  "U11",
                  "U12",
                  "U13",
                  "U14",
                  "U15",
                  "U16",
                  "U17",
                  "U18",
                  "U19",
                  "U20",
                  "U21",
                  "Others",
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[
                      s.dropdownItem,
                      ageGroup === opt && s.dropdownItemActive,
                    ]}
                    onPress={() => {
                      setAgeGroup(opt);
                      setAgeGroupOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        s.dropdownItemText,
                        ageGroup === opt && s.dropdownItemTextActive,
                      ]}
                    >
                      {opt}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
          {/* Gender picker */}
          <View>
            <Text style={s.fieldLabel}>{t("genderLabel")}</Text>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {(["male", "female", "mixed"] as const).map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[s.genderBtn, gender === opt && s.genderBtnActive]}
                  onPress={() => setGender(opt)}
                >
                  <Text
                    style={[
                      s.genderBtnText,
                      gender === opt && s.genderBtnTextActive,
                    ]}
                  >
                    {t(
                      `gender${opt.charAt(0).toUpperCase() + opt.slice(1)}` as any,
                    )}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <FieldInput
            label={t("detailsContactLabel")}
            value={description}
            onChangeText={setDescription}
            placeholder="Description, 预计时长…"
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
      const matchingGroups = myGroups.filter(
        (g) =>
          (!game.ageGroup || g.ageGroup === game.ageGroup) &&
          (!game.gender || g.gender === game.gender),
      );
      const [selectedGroupId, setSelectedGroupId] = useState(
        matchingGroups[0]?.id ?? "",
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
          {myGroups.length === 0 ? (
            <Text style={s.hintText}>{t("noGroupsCreateFirst")}</Text>
          ) : matchingGroups.length === 0 ? (
            <Text style={s.hintText}>{t("noMatchingGroupsForGame")}</Text>
          ) : (
            matchingGroups.map((g) => (
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
            ))
          )}
          <TouchableOpacity
            style={[s.btn, !selectedGroupId && s.btnDisabled]}
            onPress={send}
            disabled={!selectedGroupId}
          >
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
      {/* Header — tap to expand/collapse */}
      <TouchableOpacity
        style={[
          s.rowBetween,
          expanded && {
            borderBottomWidth: 1,
            borderColor: C.slate200,
            paddingBottom: 10,
            marginBottom: 10,
          },
        ]}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.cardTitle}>
            {sportEmoji(game.sport)}{" "}
            {displayClub ? displayClub.name : (homeCoach?.name ?? game.sport)} ·{" "}
            {game.ageGroup} ({fmtDate(game.time)})
          </Text>
          {!expanded && (
            <Text style={{ fontSize: 12, color: C.slate500, marginTop: 2 }}>
              {fmtDateTime(game.time)} · {game.ageGroup}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {expanded && game.creatorId === currentUser.id && (
            <TouchableOpacity
              onPress={openEditGameModal}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Pencil size={16} color={C.blue} />
            </TouchableOpacity>
          )}
          {expanded &&
            game.creatorId === currentUser.id &&
            game.status !== "locked" && (
              <TouchableOpacity
                onPress={handleDeleteGame}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Trash2 size={16} color={C.red} />
              </TouchableOpacity>
            )}
          <Text style={{ color: C.slate400, fontSize: 14 }}>
            {expanded ? "▲" : "▼"}
          </Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <>
          {/* Info */}
          <View style={s.infoBox}>
            <InfoRow label={t("homeTeamLabel")} value={homeTeamDisplay} />
            <InfoRow label={t("awayTeamLabel")} value={awayTeamDisplay} />
            {opponentCoach && (
              <>
                <InfoRow
                  label={t("opponentCoachLabel")}
                  value={opponentCoach.name}
                />
                <View style={s.rowBetween}>
                  <Text style={s.infoLabel}>
                    {t("opponentCoachEmailLabel")}
                  </Text>
                  <TouchableOpacity
                    style={s.valueLinkWrap}
                    onPress={() =>
                      Linking.openURL(`mailto:${opponentCoach.email}`)
                    }
                  >
                    <Text style={[s.infoValue, { color: C.blue }]}>
                      {opponentCoach.email}
                    </Text>
                  </TouchableOpacity>
                </View>
                {opponentCoach.phone && (
                  <View style={s.rowBetween}>
                    <Text style={s.infoLabel}>
                      {t("opponentCoachPhoneLabel")}
                    </Text>
                    <TouchableOpacity
                      style={s.valueLinkWrap}
                      onPress={() =>
                        Linking.openURL(`tel:${opponentCoach.phone}`)
                      }
                    >
                      <Text style={[s.infoValue, { color: C.green }]}>
                        {opponentCoach.phone}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
                {opponentGroup && (
                  <InfoRow
                    label={t("opponentGroupLabel")}
                    value={opponentGroup.name}
                  />
                )}
              </>
            )}
            <InfoRow
              label={t("timeInfoLabel")}
              value={fmtDateTime(game.time)}
            />
            <View style={s.rowBetween}>
              <Text style={s.infoLabel}>{t("locationInfoLabel")}</Text>
              <TouchableOpacity
                style={s.valueLinkWrap}
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
            {!!game.contactPhone && game.status !== "locked" && (
              <View style={s.rowBetween}>
                <Text style={s.infoLabel}>{t("contactPhoneInfoLabel")}</Text>
                <TouchableOpacity
                  style={s.valueLinkWrap}
                  onPress={() => Linking.openURL(`tel:${game.contactPhone!}`)}
                >
                  <Text style={[s.infoValue, { color: C.green }]}>
                    {game.contactPhone}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            <InfoRow label={t("ageGroupInfoLabel")} value={game.ageGroup} />
            {game.gender && (
              <View style={s.rowBetween}>
                <Text style={s.infoLabel}>{t("genderInfoLabel")}</Text>
                <Text
                  style={[
                    s.infoValue,
                    { color: genderColor(game.gender), fontWeight: "600" },
                  ]}
                >
                  {game.gender === "male"
                    ? "♂ "
                    : game.gender === "female"
                      ? "♀ "
                      : "⚥ "}
                  {t(
                    `gender${game.gender.charAt(0).toUpperCase() + game.gender.slice(1)}` as any,
                  )}
                </Text>
              </View>
            )}
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
            {game.isPrivate && game.gameInviteCode && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 6,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  backgroundColor: "#eff6ff",
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: "#bfdbfe",
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Key size={13} color={C.blue} />
                  <Text
                    style={{ fontSize: 12, color: C.blue, fontWeight: "600" }}
                  >
                    私密 · 邀请码：{game.gameInviteCode}
                  </Text>
                </View>
                <TouchableOpacity
                  hitSlop={8}
                  onPress={async () => {
                    await Clipboard.setStringAsync(game.gameInviteCode!);
                    showToast(t("copied"));
                  }}
                  style={{
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    backgroundColor: C.blue,
                    borderRadius: 5,
                  }}
                >
                  <Text
                    style={{ fontSize: 11, color: C.white, fontWeight: "600" }}
                  >
                    {t("copy")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}
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
                  const applicantGroup = app.applicantGroupId
                    ? teamGroups.find((tg) => tg.id === app.applicantGroupId)
                    : null;
                  const applicantClub = applicantGroup?.clubId
                    ? clubs.find((c) => c.id === applicantGroup.clubId)
                    : null;
                  const applicantGroupDisplay = applicantGroup
                    ? `${applicantClub?.name ?? "—"} · ${applicantGroup.name}`
                    : "—";
                  const applicantMeta =
                    `${formatAgeGroupLabel(applicantGroup?.ageGroup) || "—"} · ` +
                    (applicantGroup?.gender
                      ? t(
                          `gender${
                            applicantGroup.gender.charAt(0).toUpperCase() +
                            applicantGroup.gender.slice(1)
                          }` as any,
                        )
                      : "—");
                  return (
                    <View key={app.id} style={s.pendingRow}>
                      <View style={{ flex: 1, gap: 4 }}>
                        <Text style={{ color: C.blue, fontWeight: "600" }}>
                          {opp?.name ?? "—"}
                        </Text>
                        <Text style={s.pendingMetaText}>
                          {t("teamLabel")}: {applicantGroupDisplay}
                        </Text>
                        <Text style={s.pendingMetaText}>{applicantMeta}</Text>
                        <Text style={s.pendingMetaText}>
                          {t("labelEmail")}: {opp?.email ?? "—"}
                        </Text>
                        <Text style={s.pendingMetaText}>
                          {t("labelPhone")}: {opp?.phone ?? "—"}
                        </Text>
                      </View>
                      <View style={s.pendingActions}>
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
                        <TouchableOpacity
                          style={s.rejectBtn}
                          onPress={() => handleRejectOpponent(app)}
                        >
                          <Text
                            style={{
                              color: C.white,
                              fontSize: 12,
                              fontWeight: "600",
                            }}
                          >
                            {t("rejectBtn")}
                          </Text>
                        </TouchableOpacity>
                      </View>
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
              {/* Invite players manually only available after game is locked */}
              {game.status === "locked" && (
                <TouchableOpacity onPress={openInviteModal}>
                  <Text
                    style={{ color: C.blue, fontSize: 13, fontWeight: "500" }}
                  >
                    {t("invitePlayersBtn")}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            <View style={s.participationColumnsWrap}>
              <View style={s.participatingColumn}>
                <Text style={[s.rosterSectionLabel, { color: C.green }]}>
                  {t("participatingCountLabel").replace(
                    "{count}",
                    String(
                      participatingPlayers.length +
                        locallyParticipatingOffline.length,
                    ),
                  )}
                </Text>
                {participatingPlayers.map((p) => {
                  const playerName =
                    users.find((u) => u.id === p.playerId)?.name ||
                    offlinePlayersById.get(p.playerId) ||
                    "-";
                  return (
                    <View key={p.id} style={s.participationRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ fontWeight: "600", color: C.slate800 }}
                          numberOfLines={1}
                        >
                          {playerName}
                        </Text>
                        {p.status === "pending_coach" && (
                          <Text style={{ fontSize: 10, color: "#c2410c" }}>
                            {t("pendingCoachLabel")}
                          </Text>
                        )}
                        {p.status === "pending_guardian" && (
                          <Text style={{ fontSize: 10, color: "#c2410c" }}>
                            {t("pendingGuardianLabel")}
                          </Text>
                        )}
                      </View>
                      <View style={s.participationActions}>
                        {p.status === "pending_coach" && (
                          <TouchableOpacity
                            style={s.approveBtn}
                            onPress={() => handleApprovePlayer(p)}
                          >
                            <Text style={s.participationActionText}>
                              {t("approveBtn")}
                            </Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity
                          style={[s.participationBtn, s.toNonParticipatingBtn]}
                          onPress={() =>
                            handleSetParticipation(p, "not_participating")
                          }
                        >
                          <Text style={s.participationActionText}>
                            {t("setNotParticipatingBtn")}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
                {locallyParticipatingOffline.map((p) => (
                  <View key={p.id} style={s.participationRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{ fontWeight: "600", color: C.slate800 }}
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                      <Text style={{ fontSize: 10, color: C.slate500 }}>
                        {t("offlineDefaultParticipating")}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.participationBtn, s.toNonParticipatingBtn]}
                      onPress={() =>
                        handleSetOfflineParticipation(p.id, "not_participating")
                      }
                    >
                      <Text style={s.participationActionText}>
                        {t("setNotParticipatingBtn")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>

              <View style={s.nonParticipatingColumn}>
                <Text style={[s.rosterSectionLabel, { color: C.red }]}>
                  {t("notParticipatingCountLabel").replace(
                    "{count}",
                    String(
                      nonParticipatingPlayers.length +
                        locallyNotParticipatingOffline.length,
                    ),
                  )}
                </Text>
                {nonParticipatingPlayers.map((p) => {
                  const playerName =
                    users.find((u) => u.id === p.playerId)?.name ||
                    offlinePlayersById.get(p.playerId) ||
                    "-";
                  const locked = p.status === "withdrawn";
                  return (
                    <View
                      key={p.id}
                      style={[s.participationRow, locked && s.withdrawnRow]}
                    >
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text
                          style={{ fontWeight: "600", color: C.slate800 }}
                          numberOfLines={1}
                        >
                          {playerName}
                        </Text>
                        {locked && (
                          <Text style={{ fontSize: 10, color: C.red }}>
                            {t("withdrawnLockedReasonPrefix")}
                            {p.withdrawReason || t("noReasonFallback")}
                          </Text>
                        )}
                      </View>
                      {!locked && (
                        <TouchableOpacity
                          style={[s.participationBtn, s.toParticipatingBtn]}
                          onPress={() => handleSetParticipation(p, "approved")}
                        >
                          <Text style={s.participationActionText}>
                            {t("setParticipatingBtn")}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
                {locallyNotParticipatingOffline.map((p) => (
                  <View key={p.id} style={s.participationRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{ fontWeight: "600", color: C.slate800 }}
                        numberOfLines={1}
                      >
                        {p.name}
                      </Text>
                      <Text style={{ fontSize: 10, color: C.slate500 }}>
                        {t("offlineDefaultParticipating")}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={[s.participationBtn, s.toParticipatingBtn]}
                      onPress={() =>
                        handleSetOfflineParticipation(p.id, "approved")
                      }
                    >
                      <Text style={s.participationActionText}>
                        {t("setParticipatingBtn")}
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}
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
    borderColor: C.slate300,
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
    borderColor: C.slate200,
    gap: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: C.slate600,
    maxWidth: "44%",
    marginRight: 8,
  },
  infoValue: {
    fontSize: 12,
    color: C.slate700,
    flex: 1,
    textAlign: "right",
  },
  valueLinkWrap: {
    flex: 1,
    alignItems: "flex-end",
  },
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  hintText: { fontSize: 12, color: C.slate500 },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: C.slate700,
    marginBottom: 4,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: C.slate700,
    marginBottom: 2,
  },
  genderBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: C.slate300,
    alignItems: "center",
    backgroundColor: C.white,
  },
  genderBtnActive: {
    borderColor: C.blue,
    backgroundColor: "#eff6ff",
  },
  genderBtnText: { fontSize: 13, color: C.slate600 },
  genderBtnTextActive: { color: C.blue, fontWeight: "600" },
  dropdownTrigger: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: C.slate300,
    borderRadius: 12,
    padding: 12,
    backgroundColor: C.white,
  },
  dropdownValueText: { fontSize: 13, color: C.slate800 },
  dropdownPlaceholder: { fontSize: 13, color: C.slate400 },
  dropdownList: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 12,
    backgroundColor: C.white,
    overflow: "hidden",
  },
  dropdownItem: {
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.slate100,
  },
  dropdownItemActive: { backgroundColor: "#eff6ff" },
  dropdownItemText: { fontSize: 14, color: C.slate700 },
  dropdownItemTextActive: { color: C.blue, fontWeight: "600" },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: C.slate200,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: C.slate800,
    padding: 0,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 16,
    backgroundColor: C.slate100,
    borderWidth: 1,
    borderColor: C.slate200,
  },
  filterChipActive: {
    backgroundColor: C.blue,
    borderColor: C.blue,
  },
  filterChipText: { fontSize: 12, color: C.slate600, fontWeight: "500" },
  filterChipTextActive: { color: C.white },
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
    paddingTop: 8,
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
    alignItems: "flex-start",
    backgroundColor: C.white,
    padding: 10,
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
  rejectBtn: {
    backgroundColor: C.red,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  pendingActions: {
    gap: 6,
    marginLeft: 8,
    alignItems: "flex-end",
  },
  pendingMetaText: {
    fontSize: 12,
    color: C.slate600,
  },
  participationColumnsWrap: {
    marginTop: 8,
    flexDirection: "row",
    gap: 8,
  },
  participatingColumn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#bbf7d0",
    backgroundColor: "#f0fdf4",
    borderRadius: 10,
    padding: 8,
    gap: 6,
  },
  nonParticipatingColumn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
    borderRadius: 10,
    padding: 8,
    gap: 6,
  },
  participationRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    backgroundColor: C.white,
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: C.slate200,
  },
  participationActions: {
    gap: 6,
    flexShrink: 0,
    alignItems: "flex-end",
  },
  participationBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignSelf: "flex-end",
  },
  toNonParticipatingBtn: {
    backgroundColor: C.red,
  },
  toParticipatingBtn: {
    backgroundColor: C.green,
  },
  participationActionText: {
    color: C.white,
    fontSize: 11,
    fontWeight: "600",
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
