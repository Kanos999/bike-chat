import React, { useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LinearGradient from 'react-native-linear-gradient';
import Svg, { Path } from 'react-native-svg';
import ConcentricRings from '../components/ConcentricRings';
import { accentFor, COLORS, FONT, HELMET_PATH } from '../components/bikerTheme';
import { useAppStore } from '../state/store';

const accent = accentFor('open');

const LoginScreen = () => {
  const authLoading = useAppStore((state) => state.authLoading);
  const authError = useAppStore((state) => state.authError);
  const requestPhoneOtp = useAppStore((state) => state.requestPhoneOtp);
  const verifyPhoneOtp = useAppStore((state) => state.verifyPhoneOtp);

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const canRequestOtp = useMemo(() => phone.trim().length >= 8, [phone]);
  const canVerifyOtp = useMemo(() => phone.trim().length >= 8 && code.trim().length >= 4, [phone, code]);
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
      setLocalError('Enter a valid phone number (ideally in E.164, e.g. +61400111222).');
      return;
    }
    try {
      await requestPhoneOtp(phone.trim());
      setStep('code');
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
      await verifyPhoneOtp(phone.trim(), code.trim());
    } catch {
      // handled by authError
    }
  };

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <ConcentricRings centreX={centre.x} centreY={centre.y} />

      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
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
              <Text style={styles.label}>Phone</Text>
              <TextInput
                style={styles.input}
                value={phone}
                onChangeText={setPhone}
                placeholder="+61400111222"
                placeholderTextColor="rgba(255,255,255,0.22)"
                autoCapitalize="none"
                keyboardType="phone-pad"
                editable={!authLoading && step === 'phone'}
              />

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
                  shadowColor: accent.base,
                  shadowOpacity: enabled ? 0.5 : 0,
                  shadowRadius: enabled ? 32 : 0,
                  elevation: enabled ? 8 : 0,
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
              <Pressable
                style={styles.linkWrap}
                disabled={authLoading}
                onPress={() => {
                  setLocalError(null);
                  setStep('phone');
                  setCode('');
                }}
              >
                <Text style={styles.link}>Use a different number</Text>
              </Pressable>
            ) : null}
          </View>
        </KeyboardAvoidingView>
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
    fontSize: 12,
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
    fontSize: 11,
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
  error: {
    marginTop: 12,
    fontFamily: FONT,
    fontSize: 12,
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

  linkWrap: { marginTop: 18, alignSelf: 'center' },
  link: {
    fontFamily: FONT,
    fontSize: 13,
    letterSpacing: 1.5,
    color: accent.base,
    textTransform: 'uppercase',
  },
});

export default LoginScreen;
