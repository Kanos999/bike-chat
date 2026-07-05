import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import { Accent, accentFor, COLORS, FONT } from './bikerTheme';

const IS_IOS = Platform.OS === 'ios';

const DEFAULT_ACCENT = accentFor('open');

/* ----- Card: dark rounded surface used for grouped content ----- */
export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/* ----- Section label: small uppercase muted heading ----- */
export function SectionLabel({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <Text style={[styles.sectionLabel, style as any]}>{children}</Text>;
}

/* ----- Body text helper ----- */
export function Muted({ children, numberOfLines }: { children: React.ReactNode; numberOfLines?: number }) {
  return (
    <Text style={styles.muted} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}

/* ----- TextField: matches the LoginScreen input ----- */
export function TextField(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor="rgba(255,255,255,0.34)"
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

/* ----- PrimaryButton: the glowing accent action (mirrors the ride button) ----- */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
  accent = DEFAULT_ACCENT,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accent?: Accent;
  style?: StyleProp<ViewStyle>;
}) {
  const enabled = !disabled && !loading;
  return (
    <Pressable
      onPress={onPress}
      disabled={!enabled}
      style={[
        styles.primaryButton,
        {
          borderColor: enabled ? accent.base : 'rgba(255,255,255,0.09)',
          // Glow via shadow* is iOS-only. On Android `elevation` renders a hard black
          // rectangle behind this translucent button (shadowColor is ignored), which
          // shows as a dark box — so no elevation here; the accent border carries it.
          shadowColor: accent.base,
          shadowOpacity: IS_IOS && enabled ? 0.4 : 0,
          shadowRadius: IS_IOS && enabled ? 24 : 0,
        },
        style,
      ]}
    >
      {enabled ? (
        <LinearGradient
          colors={[`${accent.base}22`, `${accent.base}08`]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {loading ? (
        <ActivityIndicator color={accent.base} />
      ) : (
        <Text style={[styles.primaryText, { color: enabled ? accent.base : 'rgba(255,255,255,0.50)' }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/* ----- GhostButton: outlined secondary action (optionally "danger" red) ----- */
export function GhostButton({
  label,
  onPress,
  disabled,
  danger,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const color = danger ? '#ff6b6b' : 'rgba(255,255,255,0.72)';
  const border = danger ? 'rgba(255,107,107,0.4)' : 'rgba(255,255,255,0.1)';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.ghostButton, { borderColor: border, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Text style={[styles.ghostText, { color }]}>{label}</Text>
    </Pressable>
  );
}

/* ----- ListRow: a tappable row inside a Card (label + optional right content) ----- */
export function ListRow({
  label,
  sub,
  right,
  onPress,
  accent = DEFAULT_ACCENT,
  highlight,
}: {
  label: string;
  sub?: string;
  right?: React.ReactNode;
  onPress?: () => void;
  accent?: Accent;
  highlight?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={styles.row}>
      <View style={styles.flexShrink}>
        <Text
          style={[styles.rowLabel, { color: highlight ? accent.base : '#fff' }]}
          numberOfLines={1}
        >
          {label}
        </Text>
        {sub ? (
          <Text style={styles.rowSub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/* ----- Chip: small pill, used for status / right-aligned tags ----- */
export function Chip({ label, accent, on }: { label: string; accent?: Accent; on?: boolean }) {
  const a = accent ?? DEFAULT_ACCENT;
  return (
    <View
      style={[
        styles.chip,
        {
          borderColor: on ? a.dim : 'rgba(255,255,255,0.08)',
          backgroundColor: on ? a.dim : 'rgba(255,255,255,0.04)',
        },
      ]}
    >
      <Text style={[styles.chipText, { color: on ? a.base : 'rgba(255,255,255,0.42)' }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flexShrink: { flexShrink: 1 },
  card: {
    backgroundColor: 'rgba(12,12,12,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: 16,
  },
  sectionLabel: {
    fontFamily: FONT,
    fontSize: 13,
    letterSpacing: 2.4,
    color: 'rgba(255,255,255,0.52)',
    textTransform: 'uppercase',
  },
  muted: {
    fontFamily: FONT,
    fontSize: 14,
    letterSpacing: 0.6,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.52)',
  },
  input: {
    backgroundColor: COLORS.innerA,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontFamily: FONT,
    fontSize: 18,
    letterSpacing: 1,
    color: '#fff',
  },
  primaryButton: {
    height: 56,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
  },
  primaryText: { fontFamily: FONT, fontSize: 16, letterSpacing: 2.4, textTransform: 'uppercase' },
  ghostButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { fontFamily: FONT, fontSize: 14, letterSpacing: 1.6, textTransform: 'uppercase' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    gap: 12,
  },
  rowLabel: { fontFamily: FONT, fontSize: 16, letterSpacing: 0.8, textTransform: 'uppercase' },
  rowSub: {
    marginTop: 2,
    fontFamily: FONT,
    fontSize: 12,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.42)',
    textTransform: 'uppercase',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipText: { fontFamily: FONT, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase' },
});
