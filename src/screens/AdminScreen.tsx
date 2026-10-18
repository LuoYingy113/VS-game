/**
 * 管理员仪表盘 (System Admin Dashboard)
 * 对应 App.jsx 的 AdminView
 */
import { Settings, UserPlus } from "lucide-react-native";
import React, { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { apiFetch } from "../api";
import { AppModal, C } from "../components/shared";
import { backgroundStyles, buttonStyles, theme } from "../constants/commonStyles";
import { useLanguage } from "../i18n";
import { AdminSettings, ModalConfig, User } from "../types";

interface AdminState {
  currentUser: User;
  adminSettings: AdminSettings;
  setAdminSettings: React.Dispatch<React.SetStateAction<AdminSettings>>;
  showToast: (msg: string) => void;
}

export default function AdminScreen({ state }: { state: AdminState }) {
  const { currentUser, adminSettings, setAdminSettings, showToast } = state;
  const { t } = useLanguage();
  const [modal, setModal] = useState<ModalConfig | null>(null);
  const [limitInput, setLimitInput] = useState(
    String(adminSettings.underageLimit),
  );
  const [saving, setSaving] = useState(false);

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
          <Text style={s.hintText}>{t("adminGenerateCodeHint")}</Text>
          {!code ? (
            <TouchableOpacity
              style={[s.btn, { backgroundColor: theme.accent }]}
              onPress={generate}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.btnText}>{t("adminGenerateCode")}</Text>
              )}
            </TouchableOpacity>
          ) : (
            <View style={{ gap: 10 }}>
              <View style={s.codeBg}>
                <Text style={s.codeLabel}>{t("adminCoachCodeLabel")}</Text>
                <Text style={s.codeValue}>{code}</Text>
              </View>
              <TouchableOpacity
                style={[
                  s.btn,
                  { backgroundColor: copied ? "#f0fdf4" : C.slate100 },
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
    setModal({ title: t("adminInviteCoachModal"), content: <ModalContent /> });
  };

  const handleSaveSettings = async () => {
    const limit = parseInt(limitInput, 10);
    if (isNaN(limit) || limit < 0) {
      showToast(t("fillRequiredFields"));
      return;
    }
    setSaving(true);
    try {
      await apiFetch("/settings", {
        method: "PUT",
        body: { underageLimit: limit },
      });
      setAdminSettings({ underageLimit: limit });
      showToast(t("adminSavedOk"));
    } catch (err: any) {
      showToast("Failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView
      style={backgroundStyles.screen}
      contentContainerStyle={s.container}
    >
      {/* Header */}
      <View style={s.header}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Settings size={22} color={C.white} />
          <Text style={s.headerTitle}>{t("adminTitle")}</Text>
        </View>
        <Text style={s.headerSubtitle}>{t("adminSubtitle")}</Text>
      </View>

      {/* Underage setting */}
      <View style={s.card}>
        <Text style={s.cardTitle}>{t("adminUnderageTitle")}</Text>
        <Text style={s.desc}>{t("adminUnderageDesc")}</Text>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            marginTop: 12,
          }}
        >
          <TextInput
            style={s.numberInput}
            value={limitInput}
            onChangeText={setLimitInput}
            keyboardType="number-pad"
          />
          <TouchableOpacity
            style={s.saveBtn}
            onPress={handleSaveSettings}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.saveBtnText}>{t("adminSaveBtn")}</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={s.hintText}>{t("adminUnderageHint")}</Text>
      </View>

      {/* Coach code */}
      <View style={s.card}>
        <Text style={s.cardTitle}>{t("adminCoachTitle")}</Text>
        <Text style={s.desc}>{t("adminCoachDesc")}</Text>
        <TouchableOpacity
          style={[s.btn, { marginTop: 14 }]}
          onPress={openGenerateCoachCodeModal}
        >
          <View style={{ marginRight: 8 }}>
            <UserPlus size={16} color={C.white} />
          </View>
          <Text style={s.btnText}>{t("adminGenerateCoachBtn")}</Text>
        </TouchableOpacity>
      </View>

      <AppModal modal={modal} onClose={() => setModal(null)} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { padding: 16, paddingBottom: 60 },
  header: {
    backgroundColor: C.slate800,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
  },
  headerTitle: { fontSize: 20, fontWeight: "bold", color: theme.buttonText },
  headerSubtitle: { fontSize: 13, color: "#94a3b8", marginTop: 4 },
  card: {
    backgroundColor: theme.cardBg,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: C.slate200,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: theme.text,
    marginBottom: 4,
  },
  desc: { fontSize: 13, color: C.slate500, lineHeight: 18 },
  numberInput: {
    borderWidth: 2,
    borderColor: C.slate300,
    borderRadius: 12,
    padding: 10,
    width: 80,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "bold",
    color: theme.text,
  },
  saveBtn: {
    backgroundColor: C.slate800,
    borderRadius: 12,
    paddingHorizontal: 20,
    paddingVertical: 12,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 80,
  },
  saveBtnText: { color: theme.buttonText, fontWeight: "600", fontSize: 14 },
  hintText: { fontSize: 12, color: C.slate400, marginTop: 8, lineHeight: 17 },
  btn: buttonStyles.btnAdmin,
  btnText: buttonStyles.btnText,
  codeBg: {
    backgroundColor: C.slate800,
    borderRadius: 16,
    padding: 20,
    alignItems: "center",
  },
  codeLabel: { fontSize: 11, color: "#94a3b8", marginBottom: 8 },
  codeValue: {
    fontSize: 28,
    fontWeight: "bold",
    color: theme.buttonText,
    letterSpacing: 4,
  },
});
