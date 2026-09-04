/**
 * 共享 UI 组件 (Shared UI Components)
 * NavBtn / Toast / Modal / LoadingScreen / ErrorScreen / DatePickerField / LangSwitcher
 */
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import React, { useState } from "react";
import {
    ActivityIndicator,
    Image,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Modal as RNModal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { Lang, useLanguage } from "../i18n";
import { ModalConfig } from "../types";

const welcomeImage = require("../../welcome.png");

// ==========================================
// 颜色常量 (defined first — used by all components below)
// ==========================================
export const C = {
  blue: "#2563eb",
  blueLight: "#eff6ff",
  green: "#16a34a",
  greenLight: "#f0fdf4",
  red: "#dc2626",
  redLight: "#fef2f2",
  purple: "#7c3aed",
  purpleLight: "#f5f3ff",
  orange: "#ea580c",
  orangeLight: "#fff7ed",
  yellow: "#ca8a04",
  yellowLight: "#fefce8",
  slate800: "#1e293b",
  slate700: "#334155",
  slate600: "#475569",
  slate500: "#64748b",
  slate400: "#94a3b8",
  slate300: "#cbd5e1",
  slate200: "#e2e8f0",
  slate100: "#f1f5f9",
  slate50: "#f8fafc",
  white: "#ffffff",
};

// ==========================================
// 底部导航按钮 (Bottom Tab Button)
// ==========================================
interface NavBtnProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onPress: () => void;
  badge?: number;
}

export function NavBtn({ icon, label, active, onPress, badge }: NavBtnProps) {
  return (
    <TouchableOpacity
      style={styles.navBtn}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.navIconWrap}>
        {/* tint active icon blue */}
        <View style={{ opacity: active ? 1 : 0.4 }}>{icon}</View>
        {badge != null && badge > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </View>
      <Text style={[styles.navLabel, active && styles.navLabelActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// ==========================================
// 顶部 Toast 提示
// ==========================================
interface ToastProps {
  message: string | null;
}

export function Toast({ message }: ToastProps) {
  if (!message) return null;
  return (
    <View style={styles.toast} pointerEvents="none">
      <Text style={styles.toastText}>✓ {message}</Text>
    </View>
  );
}

// ==========================================
// 全屏 Modal 弹窗
// ==========================================
interface AppModalProps {
  modal: ModalConfig | null;
  onClose: () => void;
}

export function AppModal({ modal, onClose }: AppModalProps) {
  return (
    <RNModal
      visible={!!modal}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{modal?.title}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Text style={styles.modalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
              contentContainerStyle={{ paddingBottom: 8 }}
            >
              {modal?.content}
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

// ==========================================
// 加载中 / 错误屏幕
// ==========================================
export function LoadingScreen() {
  const { t } = useLanguage();
  return (
    <View style={styles.centeredScreen}>
      <Image
        source={welcomeImage}
        style={styles.welcomeImage}
        resizeMode="contain"
      />
      <View style={styles.welcomeBanner}>
        <Text style={styles.welcomeBannerText}>{t("loadingWelcomeBanner")}</Text>
      </View>
      <ActivityIndicator
        color="#2563eb"
        size="large"
        style={{ marginTop: 6 }}
      />
    </View>
  );
}

interface ErrorScreenProps {
  error: string;
  onRetry: () => void;
}

export function ErrorScreen({ error, onRetry }: ErrorScreenProps) {
  const { t } = useLanguage();
  return (
    <View style={styles.centeredScreen}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>⚠️</Text>
      <Text style={styles.errorTitle}>{t("cannotConnectTitle")}</Text>
      <Text style={styles.errorSubtitle}>
        {t("cannotConnectSub")}
        {"\n"}
        <Text style={styles.errorCode}>http://localhost:8000</Text>
      </Text>
      <Text style={styles.errorDetail}>{error}</Text>
      <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
        <Text style={styles.retryBtnText}>{t("retryBtn")}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ==========================================
// 语言切换器 (Language Switcher)
// ==========================================
export function LangSwitcher() {
  const { lang, setLang } = useLanguage();
  const options: { code: Lang; label: string }[] = [
    { code: "en", label: "EN" },
    { code: "zh", label: "中" },
    { code: "el", label: "ΕΛ" },
  ];
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: C.slate100,
        borderRadius: 10,
        overflow: "hidden",
      }}
    >
      {options.map((o) => (
        <TouchableOpacity
          key={o.code}
          onPress={() => setLang(o.code)}
          style={{
            paddingHorizontal: 8,
            paddingVertical: 5,
            backgroundColor: lang === o.code ? C.blue : "transparent",
            borderRadius: 10,
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: "600",
              color: lang === o.code ? C.white : C.slate500,
            }}
          >
            {o.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

// ==========================================
// 滚轮选择器 (Drum-roll Wheel Picker)
// ==========================================
// ==========================================
// 日历日期选择器 (Calendar Date Picker — replaces native spinner)
// ==========================================
export function DatePickerField({
  label,
  value,
  onChange,
  mode = "date",
  inputStyle,
  allowPast = false,
}: {
  label?: string;
  value: string;
  onChange: (iso: string) => void;
  mode?: "date" | "datetime";
  inputStyle?: object;
  allowPast?: boolean;
}) {
  const { t, lang } = useLanguage();

  const localeMap: Record<string, string> = {
    en: "en-US",
    zh: "zh-CN",
    el: "el-GR",
  };
  const locale = localeMap[lang] ?? "en-US";

  const pad = (n: number) => String(n).padStart(2, "0");
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const parseDate = (s: string): Date | null => {
    if (!s) return null;
    const d = new Date(s.length === 10 ? s + "T00:00:00" : s);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatISO = (d: Date): string => {
    const base = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    if (mode === "date") return base;
    return `${base}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const formatDisplay = (d: Date): string =>
    mode === "date"
      ? d.toLocaleDateString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
        })
      : d.toLocaleString(locale, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

  const parsed = parseDate(value);
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(
    parsed ? parsed.getFullYear() : today.getFullYear(),
  );
  const [viewMonth, setViewMonth] = useState(
    parsed ? parsed.getMonth() : today.getMonth(),
  );
  const [selDate, setSelDate] = useState<Date | null>(
    parsed
      ? new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
      : null,
  );
  const [selHour, setSelHour] = useState(parsed ? parsed.getHours() : 10);
  const [selMinute, setSelMinute] = useState(parsed ? parsed.getMinutes() : 0);
  // Display strings for the text inputs — updated freely while typing, padded on blur
  const [hourText, setHourText] = useState(
    pad(parsed ? parsed.getHours() : 10),
  );
  const [minuteText, setMinuteText] = useState(
    pad(parsed ? parsed.getMinutes() : 0),
  );

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else setViewMonth((m) => m + 1);
  };

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleString(locale, {
    month: "long",
    year: "numeric",
  });
  const dayHeadersRaw = t("calDays");
  const dayHeaders: string[] =
    Array.isArray(dayHeadersRaw) && dayHeadersRaw.length === 7
      ? dayHeadersRaw
      : ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Build calendar grid (Mon-first)
  const firstDay = new Date(viewYear, viewMonth, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // 0=Mon
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isDisabled = (day: number) => {
    if (allowPast) return false;
    const d = new Date(viewYear, viewMonth, day);
    d.setHours(0, 0, 0, 0);
    return d < today;
  };
  const isSelected = (day: number) =>
    selDate !== null &&
    selDate.getFullYear() === viewYear &&
    selDate.getMonth() === viewMonth &&
    selDate.getDate() === day;
  const isToday = (day: number) => {
    const now = new Date();
    return (
      now.getFullYear() === viewYear &&
      now.getMonth() === viewMonth &&
      now.getDate() === day
    );
  };

  const confirm = () => {
    if (!selDate) return;
    const final = new Date(selDate);
    if (mode === "datetime") {
      const h = Math.min(23, Math.max(0, parseInt(hourText, 10) || 0));
      const m = Math.min(59, Math.max(0, parseInt(minuteText, 10) || 0));
      final.setHours(h, m, 0, 0);
    }
    onChange(formatISO(final));
    setOpen(false);
  };

  if (Platform.OS === "web") {
    return (
      <View>
        {label && <Text style={dpStyles.label}>{label}</Text>}
        <TextInput
          style={[dpStyles.btn, inputStyle]}
          value={value}
          onChangeText={onChange}
          placeholder={mode === "datetime" ? "YYYY-MM-DDTHH:MM" : "YYYY-MM-DD"}
          placeholderTextColor={C.slate400}
        />
      </View>
    );
  }

  const displayParsed = parseDate(value);

  return (
    <View>
      {label && <Text style={dpStyles.label}>{label}</Text>}

      {/* Trigger button */}
      {displayParsed ? (
        <View style={[dpStyles.displayRow, inputStyle]}>
          <Text style={dpStyles.displayText}>
            {formatDisplay(displayParsed)}
          </Text>
          <TouchableOpacity
            onPress={() => setOpen(true)}
            style={dpStyles.changeBtn}
          >
            <Text style={dpStyles.changeBtnText}>{t("calChange")}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[dpStyles.btn, { borderStyle: "dashed" }, inputStyle]}
          onPress={() => setOpen(true)}
        >
          <Text style={dpStyles.placeholderText}>
            {mode === "datetime" ? t("calSelectDate") : t("calSelectDateOnly")}
          </Text>
        </TouchableOpacity>
      )}

      {/* Calendar Modal */}
      <RNModal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <Pressable style={calStyles.overlay} onPress={() => setOpen(false)}>
            <Pressable style={calStyles.sheet} onPress={() => {}}>
              {/* Handle bar */}
              <View style={calStyles.handle} />

              {/* Title */}
              <Text style={calStyles.title}>
                {mode === "datetime" ? t("calTitle") : t("calTitleDate")}
              </Text>

              {/* Month navigation */}
              <View style={calStyles.monthRow}>
                <TouchableOpacity onPress={prevMonth} style={calStyles.navBtn}>
                  {/* @ts-ignore */}
                  <ChevronLeft size={20} color={C.slate700} />
                </TouchableOpacity>
                <Text style={calStyles.monthText}>{monthName}</Text>
                <TouchableOpacity onPress={nextMonth} style={calStyles.navBtn}>
                  {/* @ts-ignore */}
                  <ChevronRight size={20} color={C.slate700} />
                </TouchableOpacity>
              </View>

              {/* Day headers */}
              <View style={calStyles.weekRow}>
                {dayHeaders.map((d, i) => (
                  <Text key={i} style={calStyles.weekDay}>
                    {d}
                  </Text>
                ))}
              </View>

              {/* Calendar cells */}
              <View style={calStyles.grid}>
                {cells.map((day, i) => {
                  if (!day) return <View key={i} style={calStyles.cell} />;
                  const disabled = isDisabled(day);
                  const selected = isSelected(day);
                  const todayMark = isToday(day);
                  return (
                    <TouchableOpacity
                      key={i}
                      style={[
                        calStyles.cell,
                        selected && calStyles.cellSelected,
                        !selected && todayMark && calStyles.cellToday,
                        disabled && calStyles.cellDisabled,
                      ]}
                      onPress={() =>
                        !disabled &&
                        setSelDate(new Date(viewYear, viewMonth, day))
                      }
                      activeOpacity={disabled ? 1 : 0.7}
                    >
                      <Text
                        style={[
                          calStyles.cellText,
                          selected && calStyles.cellTextSelected,
                          disabled && calStyles.cellTextDisabled,
                          todayMark && !selected && calStyles.cellTextToday,
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Time picker (datetime mode only) */}
              {mode === "datetime" && (
                <View style={calStyles.timeRow}>
                  <Text style={calStyles.timeLabel}>{t("calTime")}</Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 8,
                      marginTop: 12,
                    }}
                  >
                    <TextInput
                      style={calStyles.timeInput}
                      value={hourText}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      onChangeText={(v) => {
                        // Allow empty or digits while typing
                        if (v === "" || /^\d{1,2}$/.test(v)) setHourText(v);
                      }}
                      onBlur={() => {
                        const n = parseInt(hourText, 10);
                        const clamped = isNaN(n)
                          ? 0
                          : Math.min(23, Math.max(0, n));
                        setSelHour(clamped);
                        setHourText(pad(clamped));
                      }}
                    />
                    <Text
                      style={{
                        fontSize: 28,
                        fontWeight: "bold",
                        color: C.slate700,
                      }}
                    >
                      :
                    </Text>
                    <TextInput
                      style={calStyles.timeInput}
                      value={minuteText}
                      keyboardType="number-pad"
                      maxLength={2}
                      selectTextOnFocus
                      onChangeText={(v) => {
                        if (v === "" || /^\d{1,2}$/.test(v)) setMinuteText(v);
                      }}
                      onBlur={() => {
                        const n = parseInt(minuteText, 10);
                        const clamped = isNaN(n)
                          ? 0
                          : Math.min(59, Math.max(0, n));
                        setSelMinute(clamped);
                        setMinuteText(pad(clamped));
                      }}
                    />
                  </View>
                </View>
              )}

              {/* Confirm / Cancel */}
              <View style={calStyles.actions}>
                <TouchableOpacity
                  style={calStyles.cancelBtn}
                  onPress={() => setOpen(false)}
                >
                  <Text style={calStyles.cancelText}>{t("calCancel")}</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[calStyles.confirmBtn, !selDate && { opacity: 0.4 }]}
                  onPress={confirm}
                  disabled={!selDate}
                >
                  <Text style={calStyles.confirmText}>{t("calConfirm")}</Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </RNModal>
    </View>
  );
}

const dpStyles = StyleSheet.create({
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: C.slate700,
    marginBottom: 6,
  },
  btn: {
    borderWidth: 1.5,
    borderColor: C.slate300,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    backgroundColor: C.white,
    marginBottom: 4,
  },
  placeholderText: { fontSize: 14, color: C.slate400 },
  displayRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1.5,
    borderColor: C.blue,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#eff6ff",
    marginBottom: 4,
  },
  displayText: { fontSize: 14, color: C.slate800, fontWeight: "500", flex: 1 },
  changeBtn: {
    backgroundColor: C.blue,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginLeft: 8,
  },
  changeBtnText: { fontSize: 12, color: C.white, fontWeight: "600" },
});

const calStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.slate300,
    alignSelf: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 17,
    fontWeight: "bold",
    color: C.slate800,
    textAlign: "center",
    marginBottom: 16,
  },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  monthText: { fontSize: 15, fontWeight: "600", color: C.slate800 },
  navBtn: { padding: 6 },
  weekRow: { flexDirection: "row", marginBottom: 6 },
  weekDay: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: C.slate500,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: {
    width: `${100 / 7}%` as any,
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 2,
  },
  cellSelected: { backgroundColor: C.blue, borderRadius: 100 },
  cellToday: { borderRadius: 100, borderWidth: 2, borderColor: C.blue },
  cellDisabled: { opacity: 0.25 },
  cellText: { fontSize: 14, color: C.slate800 },
  cellTextSelected: { color: C.white, fontWeight: "bold" },
  cellTextDisabled: { color: C.slate400 },
  cellTextToday: { color: C.blue, fontWeight: "bold" },
  timeRow: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderColor: C.slate200,
  },
  timeLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: C.slate700,
    marginBottom: 8,
  },
  timeInput: {
    width: 64,
    height: 52,
    borderWidth: 1.5,
    borderColor: C.slate300,
    borderRadius: 12,
    backgroundColor: C.white,
    fontSize: 28,
    fontWeight: "600",
    color: C.slate800,
    textAlign: "center",
  },
  timePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.slate200,
    backgroundColor: C.white,
  },
  timePillSel: { backgroundColor: C.blue, borderColor: C.blue },
  timePillText: { fontSize: 13, color: C.slate700 },
  timePillTextSel: { color: C.white, fontWeight: "600" },
  actions: { flexDirection: "row", gap: 10, marginTop: 20 },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.slate300,
    alignItems: "center",
  },
  cancelText: { fontSize: 15, color: C.slate600, fontWeight: "500" },
  confirmBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: C.blue,
    alignItems: "center",
  },
  confirmText: { fontSize: 15, color: C.white, fontWeight: "600" },
});

const styles = StyleSheet.create({
  navBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 4,
  },
  navIconWrap: {
    position: "relative",
    marginBottom: 2,
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -8,
    backgroundColor: "#dc2626",
    borderRadius: 8,
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "bold",
  },
  navLabel: {
    fontSize: 11,
    color: C.slate400,
    textAlign: "center",
  },
  navLabelActive: {
    color: C.blue,
    fontWeight: "600",
  },
  toast: {
    position: "absolute",
    top: 80,
    alignSelf: "center",
    backgroundColor: C.slate800,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    zIndex: 100,
    flexDirection: "row",
    alignItems: "center",
    maxWidth: "85%",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  toastText: {
    color: "#fff",
    fontSize: 13,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 20,
  },
  modalCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 20,
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: C.slate800,
    flex: 1,
  },
  modalClose: {
    fontSize: 18,
    color: C.slate400,
    marginLeft: 8,
  },
  centeredScreen: {
    flex: 1,
    backgroundColor: C.slate50,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  welcomeImage: {
    width: 180,
    height: 180,
    marginBottom: 12,
  },
  welcomeBanner: {
    backgroundColor: C.blue,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 8,
    marginBottom: 18,
  },
  welcomeBannerText: {
    color: C.white,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: C.slate800,
    marginBottom: 8,
    textAlign: "center",
  },
  errorSubtitle: {
    fontSize: 13,
    color: C.slate500,
    textAlign: "center",
    marginBottom: 8,
  },
  errorCode: {
    fontFamily: "monospace",
    backgroundColor: C.slate100,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  errorDetail: {
    fontSize: 12,
    color: C.red,
    backgroundColor: C.redLight,
    padding: 8,
    borderRadius: 8,
    textAlign: "center",
    marginBottom: 16,
    width: "100%",
  },
  retryBtn: {
    width: "100%",
    paddingVertical: 14,
    backgroundColor: C.blue,
    borderRadius: 14,
    alignItems: "center",
  },
  retryBtnText: {
    color: C.white,
    fontWeight: "600",
    fontSize: 15,
  },
});
