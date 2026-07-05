import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import ConcentricRings from '../components/ConcentricRings';
import { accentFor, COLORS, FONT, HELMET_PATH } from '../components/bikerTheme';
import { useAppStore } from '../state/store';

const accent = accentFor('open');

// Auth is fixed to Australian numbers. The user enters their national number
// (e.g. 0400 111 222) and we build the E.164 form (+61 400 111 222) for Supabase —
// the leading trunk "0" is dropped, per E.164.
const AU_DIAL_CODE = '+61';
const nationalDigits = (local: string): string => {
  let d = local.replace(/\D/g, '').replace(/^0+/, '');
  // Guard against a user who typed the country code too (e.g. +61 / 0061), which
  // would otherwise double up to +6161…. AU national numbers never start with 61.
  if (d.startsWith('61') && d.length > 9) d = d.slice(2);
  return d;
};
const toE164AU = (local: string): string => `${AU_DIAL_CODE}${nationalDigits(local)}`;

const LoginScreen = () => {
  const authLoading = useAppStore((state) => state.authLoading);
  const authError = useAppStore((state) => state.authError);
  const requestPhoneOtp = useAppStore((state) => state.requestPhoneOtp);
  const verifyPhoneOtp = useAppStore((state) => state.verifyPhoneOtp);

  // Smoothly lift the centred form as the keyboard animates in, instead of the hard
  // re-centre the OS resize produces. Driven by the live keyboard height.
  const keyboard = useAnimatedKeyboard();
  const keyboardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboard.height.value * 0.5 }],
  }));

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  // Cooldown (seconds) before the SMS code can be resent, so users don't spam it.
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // AU mobiles have 9 significant digits (4xx xxx xxx) once the trunk 0 is dropped.
  const canRequestOtp = useMemo(() => nationalDigits(phone).length >= 9, [phone]);
  const canVerifyOtp = useMemo(
    () => nationalDigits(phone).length >= 9 && code.trim().length >= 4,
    [phone, code]
  );
  const enabled = step === 'phone' ? canRequestOtp : canVerifyOtp;

  // Centre the full-bleed ring backdrop on the hero helmet bubble.
  const [centre, setCentre] = useState({ x: 0, y: 0 });
  const heroRef = useRef<View>(null);
  const onHeroLayout = (_e: LayoutChangeEvent) => {
    heroRef.current?.measureInWindow((px, py, w, h) => {
      setCentre({ x: px + w / 2, y: py + h / 2 });
    });
  };

  const onRequestCode = async () => {
    setLocalError(null);
    if (!canRequestOtp) {
      setLocalError('Enter a valid Australian mobile number, e.g. 0400 111 222.');
      return;
    }
    try {
      await requestPhoneOtp(toE164AU(phone));
      setStep('code');
      setResendIn(30);
    } catch {
      // handled by authError
    }
  };

  const onResend = async () => {
    if (resendIn > 0 || authLoading) return;
    setLocalError(null);
    try {
      await requestPhoneOtp(toE164AU(phone));
      setResendIn(30);
    } catch {
      // handled by authError
    }
  };

  const onVerifyCode = async () => {
    setLocalError(null);
    if (!canVerifyOtp) {
      setLocalError('Enter the SMS code you received.');
      return;
    }
    try {
      await verifyPhoneOtp(toE164AU(phone), code.trim());
    } catch {
      // handled by authError
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ConcentricRings centreX={centre.x} centreY={centre.y} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <Animated.View style={[styles.flex, keyboardStyle]}>
          <View style={styles.content}>
            {/* Hero */}
            <View style={styles.hero}>
              <View ref={heroRef} onLayout={onHeroLayout} style={styles.heroBubble}>
                <Svg width={30} height={30} viewBox="0 0 24 24">
                  <Path d={HELMET_PATH} fill={accent.base} />
                </Svg>
              </View>
              <Text style={styles.title}>Bike Chat</Text>
              <Text style={styles.tagline}>Open Comms · Sign in to go live</Text>
            </View>

            {/* Form card */}
            <View style={styles.card}>
              <Text style={styles.label}>Mobile</Text>
              <View style={styles.phoneRow}>
                <View style={styles.ccBox}>
                  <Text style={styles.ccText}>+61</Text>
                </View>
                <TextInput
                  style={[styles.input, styles.phoneInput]}
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="0400 111 222"
                  placeholderTextColor="rgba(255,255,255,0.22)"
                  autoCapitalize="none"
                  keyboardType="phone-pad"
                  editable={!authLoading && step === 'phone'}
                />
              </View>

              {step === 'code' ? (
                <>
                  <Text style={[styles.label, styles.labelSpaced]}>Access Code</Text>
                  <TextInput
                    style={styles.input}
                    value={code}
                    onChangeText={setCode}
                    placeholder="SMS code"
                    placeholderTextColor="rgba(255,255,255,0.22)"
                    keyboardType="number-pad"
                    editable={!authLoading}
                    autoFocus
                  />
                </>
              ) : null}

              {localError || authError ? (
                <Text style={styles.error}>{localError ?? authError}</Text>
              ) : null}
            </View>

            {/* Primary action — mirrors the Start/End ride button */}
            <Pressable
              onPress={step === 'phone' ? onRequestCode : onVerifyCode}
              disabled={authLoading || !enabled}
              style={[
                styles.button,
                {
                  borderColor: enabled ? accent.base : 'rgba(255,255,255,0.09)',
                  // iOS-only glow; on Android elevation renders a hard black box behind
                  // this translucent button, so we drop it and let the border carry it.
                  shadowColor: accent.base,
                  shadowOpacity: Platform.OS === 'ios' && enabled ? 0.5 : 0,
                  shadowRadius: Platform.OS === 'ios' && enabled ? 32 : 0,
                },
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
              {authLoading ? (
                <ActivityIndicator color={accent.base} />
              ) : (
                <Text
                  style={[
                    styles.buttonText,
                    { color: enabled ? accent.base : 'rgba(255,255,255,0.38)' },
                  ]}
                >
                  {step === 'phone' ? 'Send Code' : 'Verify Code'}
                </Text>
              )}
            </Pressable>

            {step === 'code' ? (
              <View style={styles.codeLinks}>
                <Pressable disabled={authLoading || resendIn > 0} onPress={onResend} hitSlop={8}>
                  <Text style={[styles.link, resendIn > 0 ? styles.linkDim : null]}>
                    {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                  </Text>
                </Pressable>
                <Pressable
                  disabled={authLoading}
                  hitSlop={8}
                  onPress={() => {
                    setLocalError(null);
                    setStep('phone');
                    setCode('');
                    setResendIn(0);
                  }}
                >
                  <Text style={styles.link}>Use a different number</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        </Animated.View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  safe: { flex: 1 },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },

  hero: { alignItems: 'center', marginBottom: 36 },
  heroBubble: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
    borderColor: accent.base,
    backgroundColor: COLORS.innerA,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: accent.base,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 26,
    elevation: 10,
  },
  title: {
    marginTop: 18,
    fontFamily: FONT,
    fontSize: 38,
    color: '#fff',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tagline: {
    marginTop: 4,
    fontFamily: FONT,
    fontSize: 13,
    letterSpacing: 1.8,
    color: 'rgba(255,255,255,0.28)',
    textTransform: 'uppercase',
  },

  card: {
    backgroundColor: 'rgba(12,12,12,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    padding: 16,
  },
  label: {
    fontFamily: FONT,
    fontSize: 12,
    letterSpacing: 2,
    color: 'rgba(255,255,255,0.4)',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  labelSpaced: { marginTop: 16 },
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
  phoneRow: { flexDirection: 'row', alignItems: 'stretch' },
  ccBox: {
    backgroundColor: COLORS.innerA,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8,
    paddingHorizontal: 14,
    justifyContent: 'center',
    marginRight: 8,
  },
  ccText: {
    fontFamily: FONT,
    fontSize: 18,
    letterSpacing: 1,
    color: 'rgba(255,255,255,0.7)',
  },
  phoneInput: { flex: 1 },
  error: {
    marginTop: 12,
    fontFamily: FONT,
    fontSize: 13,
    letterSpacing: 1,
    color: '#ff6b6b',
    textTransform: 'uppercase',
  },

  button: {
    marginTop: 18,
    height: 64,
    borderRadius: 14,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.03)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 0 },
  },
  buttonText: { fontFamily: FONT, fontSize: 17, letterSpacing: 2.4, textTransform: 'uppercase' },

  codeLinks: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  link: {
    fontFamily: FONT,
    fontSize: 14,
    letterSpacing: 1.5,
    color: accent.base,
    textTransform: 'uppercase',
  },
  linkDim: { color: 'rgba(255,255,255,0.35)' },
});

export default LoginScreen;
