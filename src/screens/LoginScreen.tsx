/**
 * 登录 / 注册页面 (Login & Register Screen)
 * 对应 App.jsx 的 LoginScreen 组件
 */
import React, { useState } from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { API_BASE_URL, mapUser } from "../api";
import { C, DatePickerField, LangSwitcher } from "../components/shared";
import { useLanguage } from "../i18n";
import { User } from "../types";

interface Props {
  onLogin: (user: User) => void;
}

const INVALID_PWD = /[ <>'"]/;

function calcAge(dob: string): number | null {
  if (!dob || dob.length < 10) return null;
  const [y, m, d] = dob.substring(0, 10).split("-").map(Number);
  if (!y || !m || !d) return null;
  const today = new Date();
  let age = today.getFullYear() - y;
  if (
    today.getMonth() + 1 < m ||
    (today.getMonth() + 1 === m && today.getDate() < d)
  )
    age--;
  return age;
}

const UNDERAGE_LIMIT = 16;

export default function LoginScreen({ onLogin }: Props) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [regRole, setRegRole] = useState<"player" | "coach">("player");

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);

  // Register
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [showRegPwd, setShowRegPwd] = useState(false);
  const [regCode, setRegCode] = useState("");
  const [regDob, setRegDob] = useState("");
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // Guardian (for underage players)
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPassword, setGuardianPassword] = useState("");
  const [showGuardianPwd, setShowGuardianPwd] = useState(false);

  const playerAge = regRole === "player" ? calcAge(regDob) : null;
  const needsGuardian = playerAge !== null && playerAge < UNDERAGE_LIMIT;

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setLoginError(t("errEmailRequired"));
      return;
    }
    setLoginError("");
    setLoginLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoginError(data.detail || t("errInvalidCredentials"));
        return;
      }
      const userData = await res.json();
      onLogin(mapUser(userData));
    } catch {
      setLoginError(t("errCannotConnect"));
    } finally {
      setLoginLoading(false);
    }
  };

  const handleRegister = async () => {
    if (
      !regName.trim() ||
      !regEmail.trim() ||
      !regPassword.trim() ||
      !regCode.trim()
    ) {
      setRegError(t("errFillAll"));
      return;
    }
    if (INVALID_PWD.test(regPassword)) {
      setRegError(t("errPwdInvalid"));
      return;
    }
    if (regPassword.length < 6) {
      setRegError(t("errPwdTooShort"));
      return;
    }
    if (needsGuardian) {
      if (
        !guardianName.trim() ||
        !guardianEmail.trim() ||
        !guardianPassword.trim()
      ) {
        setRegError(
          t("errGuardianRequired").replace("{limit}", String(UNDERAGE_LIMIT)),
        );
        return;
      }
      if (INVALID_PWD.test(guardianPassword)) {
        setRegError(t("errGuardianPwdInvalid"));
        return;
      }
      if (guardianPassword.length < 6) {
        setRegError(t("errGuardianPwdTooShort"));
        return;
      }
    }
    setRegError("");
    setRegLoading(true);
    const endpoint =
      regRole === "coach"
        ? `${API_BASE_URL}/register_coach`
        : `${API_BASE_URL}/register`;
    const payload =
      regRole === "coach"
        ? {
            name: regName.trim(),
            email: regEmail.trim(),
            password: regPassword,
            coachInviteCode: regCode.trim(),
            dob: regDob || null,
          }
        : {
            name: regName.trim(),
            email: regEmail.trim(),
            password: regPassword,
            inviteCode: regCode.trim(),
            dob: regDob || null,
            ...(needsGuardian
              ? {
                  guardianName: guardianName.trim(),
                  guardianEmail: guardianEmail.trim(),
                  guardianPassword,
                }
              : {}),
          };
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRegError(data.detail || t("errRegFailed"));
        return;
      }
      const userData = await res.json();
      onLogin(mapUser(userData));
    } catch {
      setRegError(t("errCannotConnect"));
    } finally {
      setRegLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={styles.bg}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* Language switcher */}
        <View style={{ alignItems: "flex-end", marginBottom: 8 }}>
          <LangSwitcher />
        </View>

        {/* Logo */}
        <View style={styles.logoBox}>
          <Text style={styles.logoIcon}>🛡</Text>
        </View>
        <Text style={styles.title}>Team Matcher</Text>
        <Text style={styles.subtitle}>
          {tab === "login"
            ? t("loginSubtitleSignin")
            : t("loginSubtitleRegister")}
        </Text>

        {/* Tab switcher */}
        <View style={styles.tabWrap}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "login" && styles.tabBtnActive]}
            onPress={() => setTab("login")}
          >
            <Text
              style={[styles.tabText, tab === "login" && styles.tabTextActive]}
            >
              {t("tabSignin")}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === "register" && styles.tabBtnActive]}
            onPress={() => setTab("register")}
          >
            <Text
              style={[
                styles.tabText,
                tab === "register" && styles.tabTextActive,
              ]}
            >
              {t("tabRegister")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ---- Login Form ---- */}
        {tab === "login" && (
          <View style={styles.form}>
            <Text style={styles.label}>{t("labelEmail")}</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
            />

            <Text style={[styles.label, { marginTop: 12 }]}>
              {t("labelPassword")}
            </Text>
            <View style={styles.pwdWrap}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry={!showPwd}
                autoComplete="password"
              />
              <TouchableOpacity
                style={styles.pwdToggle}
                onPress={() => setShowPwd((v) => !v)}
              >
                <Text style={styles.pwdToggleText}>
                  {showPwd ? t("pwdHide") : t("pwdShow")}
                </Text>
              </TouchableOpacity>
            </View>

            {!!loginError && (
              <Text style={styles.errorText}>⚠ {loginError}</Text>
            )}

            <TouchableOpacity
              style={[styles.primaryBtn, loginLoading && styles.disabledBtn]}
              onPress={handleLogin}
              disabled={loginLoading}
            >
              {loginLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{t("btnSignin")}</Text>
              )}
            </TouchableOpacity>

            {/* Demo accounts hint */}
            <View style={styles.demoBox}>
              <Text style={styles.demoTitle}>{t("demoTitle")}</Text>
              <Text style={styles.demoText}>
                Coach Alex — alex@coach.com / password123
              </Text>
              <Text style={styles.demoText}>
                Coach Bob — bob@coach.com / password123
              </Text>
              <Text style={styles.demoText}>
                Player Mike — mike@player.com / password123
              </Text>
              <Text style={styles.demoText}>
                Admin — admin@system.com / password123
              </Text>
            </View>
          </View>
        )}

        {/* ---- Register Form ---- */}
        {tab === "register" && (
          <View style={styles.form}>
            {/* Role toggle */}
            <View style={styles.roleWrap}>
              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  regRole === "player" && styles.roleBtnBlue,
                ]}
                onPress={() => {
                  setRegRole("player");
                  setRegCode("");
                  setRegError("");
                  setGuardianName("");
                  setGuardianEmail("");
                  setGuardianPassword("");
                }}
              >
                <Text
                  style={[
                    styles.roleBtnText,
                    regRole === "player" && { color: "#fff" },
                  ]}
                >
                  {t("playerRole")}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  regRole === "coach" && styles.roleBtnPurple,
                ]}
                onPress={() => {
                  setRegRole("coach");
                  setRegCode("");
                  setRegError("");
                  setGuardianName("");
                  setGuardianEmail("");
                  setGuardianPassword("");
                }}
              >
                <Text
                  style={[
                    styles.roleBtnText,
                    regRole === "coach" && { color: "#fff" },
                  ]}
                >
                  {t("coachRole")}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>{t("labelFullName")} *</Text>
            <TextInput
              style={styles.input}
              value={regName}
              onChangeText={setRegName}
              placeholder="Your Name"
              autoComplete="name"
            />

            <Text style={[styles.label, { marginTop: 12 }]}>
              {t("labelEmail")} *
            </Text>
            <TextInput
              style={styles.input}
              value={regEmail}
              onChangeText={setRegEmail}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={[styles.label, { marginTop: 12 }]}>
              {t("labelPassword")} *
            </Text>
            <View style={styles.pwdWrap}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={regPassword}
                onChangeText={setRegPassword}
                placeholder="••••••••"
                secureTextEntry={!showRegPwd}
              />
              <TouchableOpacity
                style={styles.pwdToggle}
                onPress={() => setShowRegPwd((v) => !v)}
              >
                <Text style={styles.pwdToggleText}>
                  {showRegPwd ? t("pwdHide") : t("pwdShow")}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.hint}>{t("pwdHint")}</Text>

            <DatePickerField
              label={`${t("labelDob")} *`}
              value={regDob}
              onChange={setRegDob}
              mode="date"
              inputStyle={styles.input}
            />
            {playerAge !== null && (
              <Text
                style={[
                  styles.hint,
                  { color: needsGuardian ? "#f59e0b" : C.slate400 },
                ]}
              >
                {needsGuardian
                  ? t("underageWarning").replace(
                      "{limit}",
                      String(UNDERAGE_LIMIT),
                    )
                  : t("ageDisplay").replace("{age}", String(playerAge))}
              </Text>
            )}

            {/* Guardian section — shown for underage players */}
            {needsGuardian && regRole === "player" && (
              <View style={styles.guardianBox}>
                <Text style={styles.guardianTitle}>
                  {t("guardianAccountTitle")}
                </Text>
                <Text style={styles.guardianHint}>
                  {t("guardianAccountHint")}
                </Text>

                <Text style={[styles.label, { marginTop: 10 }]}>
                  {t("labelGuardianName")} *
                </Text>
                <TextInput
                  style={styles.input}
                  value={guardianName}
                  onChangeText={setGuardianName}
                  placeholder="Guardian Name"
                  autoComplete="name"
                />

                <Text style={[styles.label, { marginTop: 12 }]}>
                  {t("labelGuardianEmail")} *
                </Text>
                <TextInput
                  style={styles.input}
                  value={guardianEmail}
                  onChangeText={setGuardianEmail}
                  placeholder="guardian@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <Text style={[styles.label, { marginTop: 12 }]}>
                  {t("labelGuardianPwd")} *
                </Text>
                <View style={styles.pwdWrap}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={guardianPassword}
                    onChangeText={setGuardianPassword}
                    placeholder="••••••••"
                    secureTextEntry={!showGuardianPwd}
                  />
                  <TouchableOpacity
                    style={styles.pwdToggle}
                    onPress={() => setShowGuardianPwd((v) => !v)}
                  >
                    <Text style={styles.pwdToggleText}>
                      {showGuardianPwd ? t("pwdHide") : t("pwdShow")}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.hint}>{t("guardianPwdHint")}</Text>
              </View>
            )}

            <Text style={[styles.label, { marginTop: 12 }]}>
              {regRole === "coach"
                ? t("labelCoachRegCode")
                : t("labelPlayerInviteCode")}{" "}
              *
            </Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={regCode}
              onChangeText={(v) => setRegCode(v.toUpperCase())}
              placeholder="XXXXXXXX"
              maxLength={8}
              autoCapitalize="characters"
            />
            <Text style={styles.hint}>
              {regRole === "coach" ? t("hintCoachCode") : t("hintPlayerCode")}
            </Text>

            {!!regError && <Text style={styles.errorText}>⚠ {regError}</Text>}

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                { backgroundColor: C.green },
                regLoading && styles.disabledBtn,
              ]}
              onPress={handleRegister}
              disabled={regLoading}
            >
              {regLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryBtnText}>{t("btnRegister")}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.slate50 },
  container: {
    alignItems: "center",
    padding: 24,
    paddingBottom: 60,
  },
  logoBox: {
    width: 72,
    height: 72,
    backgroundColor: C.blue,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 40,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  logoIcon: { fontSize: 36 },
  title: {
    fontSize: 28,
    fontWeight: "bold",
    color: C.slate800,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: C.slate500,
    textAlign: "center",
    marginBottom: 24,
  },
  tabWrap: {
    flexDirection: "row",
    backgroundColor: C.slate200,
    borderRadius: 14,
    padding: 4,
    width: "100%",
    marginBottom: 24,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
  },
  tabBtnActive: {
    backgroundColor: C.white,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: { fontSize: 13, fontWeight: "600", color: C.slate500 },
  tabTextActive: { color: C.slate800 },
  form: { width: "100%" },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: C.slate700,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: C.slate300,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 14,
    color: C.slate800,
    backgroundColor: C.white,
    marginBottom: 4,
  },
  pwdWrap: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  pwdToggle: { position: "absolute", right: 14 },
  pwdToggleText: { fontSize: 12, color: C.slate400 },
  hint: { fontSize: 11, color: C.slate400, marginBottom: 4 },
  errorText: {
    fontSize: 13,
    color: C.red,
    backgroundColor: C.redLight,
    padding: 10,
    borderRadius: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  primaryBtn: {
    width: "100%",
    paddingVertical: 15,
    backgroundColor: C.blue,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
    shadowColor: C.blue,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  disabledBtn: { opacity: 0.6 },
  primaryBtnText: { color: C.white, fontWeight: "700", fontSize: 15 },
  demoBox: {
    marginTop: 20,
    backgroundColor: C.slate100,
    borderRadius: 14,
    padding: 14,
    width: "100%",
  },
  demoTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: C.slate600,
    marginBottom: 6,
  },
  demoText: { fontSize: 11, color: C.slate500, lineHeight: 18 },
  roleWrap: {
    flexDirection: "row",
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: C.slate200,
    marginBottom: 16,
  },
  roleBtn: {
    flex: 1,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: C.white,
  },
  roleBtnBlue: { backgroundColor: C.blue },
  roleBtnPurple: { backgroundColor: C.purple },
  roleBtnText: { fontSize: 13, fontWeight: "600", color: C.slate500 },
  codeInput: {
    fontFamily:
      Platform.select({ ios: "Courier", android: "monospace" }) ?? "monospace",
    letterSpacing: 4,
  },
  guardianBox: {
    marginTop: 16,
    padding: 16,
    backgroundColor: "#fffbeb",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#fcd34d",
  },
  guardianTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#92400e",
    marginBottom: 6,
  },
  guardianHint: {
    fontSize: 11,
    color: "#a16207",
    lineHeight: 16,
    marginBottom: 4,
  },
});
