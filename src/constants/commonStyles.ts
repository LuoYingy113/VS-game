import { StyleSheet } from "react-native";
import { C } from "./palette";

// Central place to tweak button and background styling across all screens.

export const theme = {
  screenBg: "#dcbbf1",
  headerBg: C.white,
  bottomNavBg: C.white,
  cardBg: "#f4edb6",
  primary: C.blue,
  accent: C.purple,
  adminPrimary: C.purple,
  primaryText: C.white,
  buttonText: C.white,
  text: C.slate800,
  disabledBg: C.slate200,
  disabledBgAlt: C.slate300,
  buttonRadius: 12,
};

export const backgroundStyles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.screenBg },
});

const baseBtn = {
  borderRadius: theme.buttonRadius,
  paddingVertical: 13,
  alignItems: "center" as const,
  shadowOpacity: 0.2,
  shadowRadius: 6,
  elevation: 3,
};

export const buttonStyles = StyleSheet.create({
  btn: {
    ...baseBtn,
    backgroundColor: theme.primary,
    shadowColor: theme.primary,
  },
  btnAdmin: {
    ...baseBtn,
    backgroundColor: theme.adminPrimary,
    shadowColor: theme.adminPrimary,
    flexDirection: "row",
    justifyContent: "center",
  },
  btnDisabled: { backgroundColor: theme.disabledBg, shadowOpacity: 0 },
  btnDisabledAlt: {
    backgroundColor: theme.disabledBgAlt,
    shadowOpacity: 0,
    elevation: 0,
  },
  btnText: { color: theme.primaryText, fontWeight: "700", fontSize: 14 },
  primaryBtn: {
    width: "100%",
    paddingVertical: 15,
    backgroundColor: theme.primary,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 12,
    shadowColor: theme.primary,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  primaryBtnText: { color: theme.primaryText, fontWeight: "700", fontSize: 15 },
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
});
