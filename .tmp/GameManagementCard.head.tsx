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
