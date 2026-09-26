/**
 * 登录 / 注册页面 (Login & Register Screen)
 * 对应 App.jsx 的 LoginScreen 组件
 */
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Keyboard,
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
import { C, LangSwitcher } from "../components/shared";
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

function normalizeEmailCode(v: string): string {
  return v
    .replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 65248))
    .replace(/\s+/g, "")
    .trim();
}

export default function LoginScreen({ onLogin }: Props) {
  const { t } = useLanguage();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [regRole, setRegRole] = useState<"player" | "coach" | "guardian">(
    "player",
  );

  // Login
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  // Pending email verification during login
  const [pendingVerifyEmail, setPendingVerifyEmail] = useState<string | null>(
    null,
  );
  const [loginVerifyCode, setLoginVerifyCode] = useState("");
  const [loginVerifySending, setLoginVerifySending] = useState(false);
  const [loginVerifyCodeSent, setLoginVerifyCodeSent] = useState(false);
  const [loginVerifyLoading, setLoginVerifyLoading] = useState(false);
  const [loginVerifyError, setLoginVerifyError] = useState("");
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetNewPwd, setResetNewPwd] = useState("");
  const [resetConfirmPwd, setResetConfirmPwd] = useState("");
  const [resetShowPwd, setResetShowPwd] = useState(false);
  const [resetSendingCode, setResetSendingCode] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");

  // Register
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPwd, setShowRegPwd] = useState(false);
  const [regCode, setRegCode] = useState("");
  const [regDob, setRegDob] = useState("");
  const [dobYear, setDobYear] = useState("");
  const [dobMonth, setDobMonth] = useState("");
  const [dobDay, setDobDay] = useState("");

  // Assemble ISO date from parts and update regDob
  const updateDob = (y: string, m: string, d: string) => {
    const yNum = parseInt(y, 10);
    const mNum = parseInt(m, 10);
    const dNum = parseInt(d, 10);
    if (y.length === 4 && mNum >= 1 && mNum <= 12 && dNum >= 1 && dNum <= 31) {
      const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      setRegDob(iso);
    } else {
      setRegDob("");
    }
  };
  const [regError, setRegError] = useState("");
  const [regLoading, setRegLoading] = useState(false);
  const [emailTakenError, setEmailTakenError] = useState("");

  // Email verification code
  const [emailCode, setEmailCode] = useState("");
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [codeError, setCodeError] = useState("");

  const checkEmailTaken = async (emailVal: string) => {
    if (!emailVal.trim() || !emailVal.includes("@")) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/check_email?email=${encodeURIComponent(emailVal.trim())}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.taken) {
          setEmailTakenError(t("errEmailTaken"));
        } else {
          setEmailTakenError("");
        }
      }
    } catch {
      // silently ignore network errors for this check
    }
  };

  // Guardian (for underage players)
  const [guardianName, setGuardianName] = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [guardianPassword, setGuardianPassword] = useState("");
  const [showGuardianPwd, setShowGuardianPwd] = useState(false);
  const [guardianEmailCode, setGuardianEmailCode] = useState("");
  const [sendingGuardianCode, setSendingGuardianCode] = useState(false);
  const [guardianCodeSent, setGuardianCodeSent] = useState(false);
  const [guardianCodeError, setGuardianCodeError] = useState("");

  // Extra reg fields
  const [regPhone, setRegPhone] = useState("");
  const [regClubName, setRegClubName] = useState("");

  const playerAge = regRole === "player" ? calcAge(regDob) : null;
  const needsGuardian = playerAge !== null && playerAge < UNDERAGE_LIMIT;
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const showSub = Keyboard.addListener("keyboardDidShow", (e) => {
      setKeyboardInset(Math.max(0, e.endCoordinates?.height ?? 0));
    });
    const hideSub = Keyboard.addListener("keyboardDidHide", () => {
      setKeyboardInset(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

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
        if (data.detail === "EMAIL_NOT_VERIFIED") {
          setPendingVerifyEmail(email.trim());
          setLoginVerifyCode("");
          setLoginVerifyCodeSent(false);
          setLoginVerifyError("");
          return;
        }
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

  const handleLoginSendCode = async () => {
    setLoginVerifyError("");
    setLoginVerifySending(true);
    try {
      const res = await fetch(`${API_BASE_URL}/send_login_verify_code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pendingVerifyEmail }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoginVerifyError(data.detail || t("errCannotConnect"));
        return;
      }
      setLoginVerifyCodeSent(true);
    } catch {
      setLoginVerifyError(t("errCannotConnect"));
    } finally {
      setLoginVerifySending(false);
    }
  };

  const handleVerifyAndLogin = async () => {
    if (!loginVerifyCode.trim()) {
      setLoginVerifyError(t("errCodeRequired"));
      return;
    }
    setLoginVerifyLoading(true);
    setLoginVerifyError("");
    try {
      const res = await fetch(`${API_BASE_URL}/verify_email_code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: pendingVerifyEmail,
          code: normalizeEmailCode(loginVerifyCode),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setLoginVerifyError(data.detail || t("errInvalidCredentials"));
        return;
      }
      const userData = await res.json();
      onLogin(mapUser(userData));
    } catch {
      setLoginVerifyError(t("errCannotConnect"));
    } finally {
      setLoginVerifyLoading(false);
    }
  };

  const sendEmailCode = async () => {
    if (!regEmail.trim() || !regEmail.includes("@")) {
      setCodeError(t("labelEmail"));
      return;
    }
    setSendingCode(true);
    setCodeError("");
    try {
      const res = await fetch(`${API_BASE_URL}/send_email_code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: regEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setCodeError(data.detail || t("errRegFailed"));
        return;
      }
      setCodeSent(true);
    } catch {
      setCodeError(t("errCannotConnect"));
    } finally {
      setSendingCode(false);
    }
  };

  const sendGuardianEmailCode = async () => {
    if (!guardianEmail.trim() || !guardianEmail.includes("@")) {
      setGuardianCodeError(t("labelGuardianEmail"));
      return;
    }
    setSendingGuardianCode(true);
    setGuardianCodeError("");
    try {
      const res = await fetch(`${API_BASE_URL}/send_guardian_email_code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: guardianEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setGuardianCodeError(data.detail || t("errRegFailed"));
        return;
      }
      setGuardianCodeSent(true);
    } catch {
      setGuardianCodeError(t("errCannotConnect"));
    } finally {
      setSendingGuardianCode(false);
    }
  };

  const handleRegister = async () => {
    if (
      !regName.trim() ||
      !regEmail.trim() ||
      !regPassword.trim() ||
      (regRole !== "guardian" && !regCode.trim())
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
    if (regPassword !== regConfirmPassword) {
      setRegError(t("errPwdMismatch"));
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
      if (!guardianEmailCode.trim()) {
        setRegError(t("errGuardianCodeRequired"));
        return;
      }
    }
    if (!emailCode.trim()) {
      setRegError(t("errCodeRequired"));
      return;
    }
    setRegError("");
    setRegLoading(true);
    const endpoint =
      regRole === "coach"
        ? `${API_BASE_URL}/register_coach`
        : regRole === "guardian"
          ? `${API_BASE_URL}/register_guardian`
          : `${API_BASE_URL}/register`;
    const payload =
      regRole === "coach"
        ? {
            name: regName.trim(),
            email: regEmail.trim(),
            password: regPassword,
            coachInviteCode: regCode.trim(),
            emailCode: normalizeEmailCode(emailCode),
            dob: regDob || null,
            phone: regPhone.trim() || null,
            clubName: regClubName.trim() || null,
          }
        : regRole === "guardian"
          ? {
              name: regName.trim(),
              email: regEmail.trim(),
              password: regPassword,
              emailCode: normalizeEmailCode(emailCode),
            }
          : {
              name: regName.trim(),
              email: regEmail.trim(),
              password: regPassword,
              inviteCode: regCode.trim(),
              emailCode: normalizeEmailCode(emailCode),
              dob: regDob || null,
              phone: regPhone.trim() || null,
              ...(needsGuardian
                ? {
                    guardianName: guardianName.trim(),
                    guardianEmail: guardianEmail.trim(),
                    guardianPassword,
                    guardianEmailCode: normalizeEmailCode(guardianEmailCode),
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

  const sendResetCode = async () => {
    if (!resetEmail.trim() || !resetEmail.includes("@")) {
      setResetError(t("labelEmail"));
      return;
    }
    setResetError("");
    setResetSuccess("");
    setResetSendingCode(true);
    try {
      const res = await fetch(`${API_BASE_URL}/send_password_reset_code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setResetError(data.detail || t("errCannotConnect"));
        return;
      }
      setResetCodeSent(true);
      setResetSuccess(t("resetPwdCodeSent"));
    } catch {
      setResetError(t("errCannotConnect"));
    } finally {
      setResetSendingCode(false);
    }
  };

  const handleResetPassword = async () => {
    if (
      !resetEmail.trim() ||
      !normalizeEmailCode(resetCode) ||
      !resetNewPwd ||
      !resetConfirmPwd
    ) {
      setResetError(t("errFillAll"));
      return;
    }
    if (INVALID_PWD.test(resetNewPwd)) {
      setResetError(t("errPwdInvalid"));
      return;
    }
    if (resetNewPwd.length < 6) {
      setResetError(t("errPwdTooShort"));
      return;
    }
    if (resetNewPwd !== resetConfirmPwd) {
      setResetError(t("errPwdMismatch"));
      return;
    }
    setResetError("");
    setResetSuccess("");
    setResetSubmitting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/reset_password_by_email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: resetEmail.trim(),
          emailCode: normalizeEmailCode(resetCode),
          newPassword: resetNewPwd,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setResetError(data.detail || t("errCannotConnect"));
        return;
      }
      setResetSuccess(t("resetPwdSuccess"));
      setResetCode("");
      setResetNewPwd("");
      setResetConfirmPwd("");
    } catch {
      setResetError(t("errCannotConnect"));
    } finally {
      setResetSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Language switcher — fixed top-right, above everything */}
      <View style={{ position: "absolute", top: 52, right: 16, zIndex: 10 }}>
        <LangSwitcher />
      </View>

      <ScrollView
        style={styles.bg}
        contentContainerStyle={[
          styles.container,
          { paddingBottom: 60 + keyboardInset },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "none"}
      >
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

            <TouchableOpacity
              onPress={() => {
                setResetOpen((v) => !v);
                setResetError("");
                setResetSuccess("");
              }}
            >
              <Text
                style={{
                  marginTop: 10,
                  color: C.blue,
                  fontSize: 13,
                  textAlign: "right",
                }}
              >
                {t("forgotPwdLink")}
              </Text>
            </TouchableOpacity>

            {resetOpen && (
              <View
                style={{
                  marginTop: 12,
                  padding: 14,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: C.slate200,
                  backgroundColor: C.white,
                  gap: 10,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: "700", color: C.slate700 }}>
                  {t("resetPwdTitle")}
                </Text>
                <Text style={{ fontSize: 12, color: C.slate500 }}>
                  {t("resetPwdHint")}
                </Text>
                <TextInput
                  style={styles.input}
                  value={resetEmail}
                  onChangeText={setResetEmail}
                  placeholder="your@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                <TouchableOpacity
                  style={[
                    styles.sendCodeBtn,
                    (resetSendingCode || resetCodeSent) && styles.disabledBtn,
                  ]}
                  onPress={sendResetCode}
                  disabled={resetSendingCode || resetCodeSent}
                >
                  <Text style={styles.sendCodeBtnText}>
                    {resetSendingCode
                      ? t("verifyEmailResending")
                      : resetCodeSent
                        ? "✓ " + t("btnSendCode")
                        : t("btnSendCode")}
                  </Text>
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={resetCode}
                  onChangeText={(v) => setResetCode(normalizeEmailCode(v))}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <View style={styles.pwdWrap}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={resetNewPwd}
                    onChangeText={setResetNewPwd}
                    placeholder={t("profileNewPwd")}
                    secureTextEntry={!resetShowPwd}
                  />
                  <TouchableOpacity
                    style={styles.pwdToggle}
                    onPress={() => setResetShowPwd((v) => !v)}
                  >
                    <Text style={styles.pwdToggleText}>
                      {resetShowPwd ? t("pwdHide") : t("pwdShow")}
                    </Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  style={styles.input}
                  value={resetConfirmPwd}
                  onChangeText={setResetConfirmPwd}
                  placeholder={t("labelConfirmPassword")}
                  secureTextEntry
                />
                {!!resetError && <Text style={styles.errorText}>⚠ {resetError}</Text>}
                {!!resetSuccess && (
                  <Text style={[styles.hint, { color: C.green, fontSize: 12 }]}>
                    {resetSuccess}
                  </Text>
                )}
                <TouchableOpacity
                  style={[styles.primaryBtn, resetSubmitting && styles.disabledBtn]}
                  onPress={handleResetPassword}
                  disabled={resetSubmitting}
                >
                  {resetSubmitting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>{t("resetPwdSubmit")}</Text>
                  )}
                </TouchableOpacity>
              </View>
            )}

            {/* Pending email verification panel */}
            {!!pendingVerifyEmail && (
              <View
                style={{
                  marginTop: 16,
                  padding: 16,
                  backgroundColor: "#fefce8",
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: "#fde68a",
                  gap: 10,
                }}
              >
                <Text
                  style={{ fontWeight: "700", color: "#92400e", fontSize: 14 }}
                >
                  📧 {t("verifyEmailTitle")}
                </Text>
                <Text style={{ fontSize: 13, color: "#78350f" }}>
                  {t("verifyEmailBody").replace("{email}", pendingVerifyEmail)}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.sendCodeBtn,
                    (loginVerifySending || loginVerifyCodeSent) &&
                      styles.disabledBtn,
                  ]}
                  onPress={handleLoginSendCode}
                  disabled={loginVerifySending || loginVerifyCodeSent}
                >
                  <Text style={styles.sendCodeBtnText}>
                    {loginVerifySending
                      ? t("verifyEmailResending")
                      : loginVerifyCodeSent
                        ? "✓ " + t("btnSendCode")
                        : t("btnSendCode")}
                  </Text>
                </TouchableOpacity>
                {loginVerifyCodeSent && (
                  <Text style={{ fontSize: 12, color: "#16a34a" }}>
                    {t("codeSentHint")}
                  </Text>
                )}
                <Text style={[styles.label, { marginTop: 4 }]}>
                  {t("labelEmailCode")} *
                </Text>
                <TextInput
                  style={styles.input}
                  value={loginVerifyCode}
                  onChangeText={(v) => setLoginVerifyCode(normalizeEmailCode(v))}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                {!!loginVerifyError && (
                  <Text style={styles.errorText}>⚠ {loginVerifyError}</Text>
                )}
                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    loginVerifyLoading && styles.disabledBtn,
                  ]}
                  onPress={handleVerifyAndLogin}
                  disabled={loginVerifyLoading}
                >
                  {loginVerifyLoading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>
                      {t("btnVerifyAndLogin")}
                    </Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setPendingVerifyEmail(null);
                    setLoginVerifyCode("");
                    setLoginVerifyCodeSent(false);
                    setLoginVerifyError("");
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      color: C.blue,
                      textAlign: "center",
                      marginTop: 4,
                    }}
                  >
                    {t("verifyEmailBackToLogin")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

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
                  setGuardianEmailCode("");
                  setGuardianCodeSent(false);
                  setGuardianCodeError("");
                  setEmailCode("");
                  setCodeSent(false);
                  setCodeError("");
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
                  setGuardianEmailCode("");
                  setGuardianCodeSent(false);
                  setGuardianCodeError("");
                  setEmailCode("");
                  setCodeSent(false);
                  setCodeError("");
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
              <TouchableOpacity
                style={[
                  styles.roleBtn,
                  regRole === "guardian" && styles.roleBtnGreen,
                ]}
                onPress={() => {
                  setRegRole("guardian");
                  setRegCode("");
                  setRegError("");
                  setGuardianName("");
                  setGuardianEmail("");
                  setGuardianPassword("");
                  setGuardianEmailCode("");
                  setGuardianCodeSent(false);
                  setGuardianCodeError("");
                  setEmailCode("");
                  setCodeSent(false);
                  setCodeError("");
                }}
              >
                <Text
                  style={[
                    styles.roleBtnText,
                    regRole === "guardian" && { color: "#fff" },
                  ]}
                >
                  {t("guardianRole")}
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>
              {t("labelEmail")}{" "}
              <Text style={{ fontSize: 11, color: C.slate400 }}>
                {t("registerEmailNote")}
              </Text>{" "}
              *
            </Text>
            <TextInput
              style={[
                styles.input,
                !!emailTakenError && { borderColor: "#ef4444", borderWidth: 1 },
              ]}
              value={regEmail}
              onChangeText={(v) => {
                setRegEmail(v);
                setEmailTakenError("");
                setCodeSent(false);
                setCodeError("");
              }}
              onBlur={() => checkEmailTaken(regEmail)}
              placeholder="your@email.com"
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {!!emailTakenError && (
              <Text style={[styles.errorText, { marginTop: 2 }]}>
                ⚠ {emailTakenError}
              </Text>
            )}
            <TouchableOpacity
              style={[
                styles.sendCodeBtn,
                (sendingCode || codeSent) && styles.disabledBtn,
              ]}
              onPress={sendEmailCode}
              disabled={sendingCode || codeSent}
            >
              <Text style={styles.sendCodeBtnText}>
                {sendingCode
                  ? t("verifyEmailResending")
                  : codeSent
                    ? "✓ " + t("btnSendCode")
                    : t("btnSendCode")}
              </Text>
            </TouchableOpacity>
            {codeSent && (
              <Text style={[styles.hint, { color: C.green }]}>
                {t("codeSentHint")}
              </Text>
            )}
            {!!codeError && <Text style={styles.errorText}>⚠ {codeError}</Text>}
            <Text style={[styles.label, { marginTop: 12 }]}>
              {t("labelEmailCode")} *
            </Text>
            <TextInput
              style={styles.input}
              value={emailCode}
              onChangeText={(v) => setEmailCode(normalizeEmailCode(v))}
              placeholder="000000"
              keyboardType="number-pad"
              maxLength={6}
            />
            <Text style={styles.hint}>{t("hintEmailCode")}</Text>

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

            <Text style={[styles.label, { marginTop: 12 }]}>
              {t("labelConfirmPassword")} *
            </Text>
            <TextInput
              style={styles.input}
              value={regConfirmPassword}
              onChangeText={setRegConfirmPassword}
              placeholder="••••••••"
              secureTextEntry
            />

            <Text style={[styles.label, { marginTop: 4 }]}>
              {t("labelFullName")} *
            </Text>
            <TextInput
              style={styles.input}
              value={regName}
              onChangeText={setRegName}
              placeholder={t("phName")}
              autoComplete="name"
            />

            {regRole !== "guardian" && (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>
                  {t("labelDob")} *
                </Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 4 }}>
                  <TextInput
                    style={[styles.input, { flex: 2 }]}
                    value={dobYear}
                    onChangeText={(v) => {
                      const s = v.replace(/\D/g, "").slice(0, 4);
                      setDobYear(s);
                      updateDob(s, dobMonth, dobDay);
                    }}
                    keyboardType="number-pad"
                    maxLength={4}
                    placeholder={t("dobYearPlaceholder") || "YYYY"}
                    placeholderTextColor={C.slate400}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={dobMonth}
                    onChangeText={(v) => {
                      const s = v.replace(/\D/g, "").slice(0, 2);
                      setDobMonth(s);
                      updateDob(dobYear, s, dobDay);
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder={t("dobMonthPlaceholder") || "MM"}
                    placeholderTextColor={C.slate400}
                  />
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    value={dobDay}
                    onChangeText={(v) => {
                      const s = v.replace(/\D/g, "").slice(0, 2);
                      setDobDay(s);
                      updateDob(dobYear, dobMonth, s);
                    }}
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholder={t("dobDayPlaceholder") || "DD"}
                    placeholderTextColor={C.slate400}
                  />
                </View>
              </>
            )}
            {regRole !== "guardian" && playerAge !== null && (
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
                  placeholder={t("phName")}
                  autoComplete="name"
                />

                <Text style={[styles.label, { marginTop: 12 }]}>
                  {t("labelGuardianEmail")} *
                </Text>
                <TextInput
                  style={styles.input}
                  value={guardianEmail}
                  onChangeText={(v) => {
                    setGuardianEmail(v);
                    setGuardianEmailCode("");
                    setGuardianCodeSent(false);
                    setGuardianCodeError("");
                  }}
                  placeholder="guardian@email.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={[
                    styles.sendCodeBtn,
                    (sendingGuardianCode || guardianCodeSent) && styles.disabledBtn,
                  ]}
                  onPress={sendGuardianEmailCode}
                  disabled={sendingGuardianCode || guardianCodeSent}
                >
                  <Text style={styles.sendCodeBtnText}>
                    {sendingGuardianCode
                      ? t("verifyEmailResending")
                      : guardianCodeSent
                        ? "✓ " + t("btnSendCode")
                        : t("btnSendCode")}
                  </Text>
                </TouchableOpacity>
                {guardianCodeSent && (
                  <Text style={[styles.hint, { color: C.green }]}>
                    {t("codeSentHint")}
                  </Text>
                )}
                {!!guardianCodeError && (
                  <Text style={styles.errorText}>⚠ {guardianCodeError}</Text>
                )}

                <Text style={[styles.label, { marginTop: 12 }]}> 
                  {t("labelGuardianEmailCode")} *
                </Text>
                <TextInput
                  style={styles.input}
                  value={guardianEmailCode}
                  onChangeText={(v) => setGuardianEmailCode(normalizeEmailCode(v))}
                  placeholder="000000"
                  keyboardType="number-pad"
                  maxLength={6}
                />
                <Text style={styles.hint}>{t("hintGuardianEmailCode")}</Text>

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
              {t("labelPhone")}
            </Text>
            <TextInput
              style={styles.input}
              value={regPhone}
              onChangeText={setRegPhone}
              placeholder={t("phPhone")}
              keyboardType="phone-pad"
            />

            {regRole === "coach" && (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>
                  {t("labelDefaultClub")}
                </Text>
                <TextInput
                  style={styles.input}
                  value={regClubName}
                  onChangeText={setRegClubName}
                  placeholder={t("phClubExample")}
                />
              </>
            )}

            {regRole !== "guardian" && (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>
                  {regRole === "coach"
                    ? t("labelCoachRegCode")
                    : t("labelPlayerInviteCode")} *
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
              </>
            )}

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
  sendCodeBtn: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: C.blue,
    borderRadius: 10,
    marginTop: 8,
  },
  sendCodeBtnText: { color: C.white, fontWeight: "600", fontSize: 13 },
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
  roleBtnGreen: { backgroundColor: C.green },
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
