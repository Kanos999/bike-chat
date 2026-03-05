import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppStore } from '../state/store';

const LoginScreen = () => {
  const { authLoading, authError, requestPhoneOtp, verifyPhoneOtp } = useAppStore((state) => ({
    authLoading: state.authLoading,
    authError: state.authError,
    requestPhoneOtp: state.requestPhoneOtp,
    verifyPhoneOtp: state.verifyPhoneOtp,
  }));

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const canRequestOtp = useMemo(() => phone.trim().length >= 8, [phone]);
  const canVerifyOtp = useMemo(() => phone.trim().length >= 8 && code.trim().length >= 4, [phone, code]);

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
    <View className="flex-1 bg-bike-bg px-6 justify-center">
      <Text
        className="text-3xl font-bold text-bike-text mb-2"
        style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}
      >
        Bike Chat
      </Text>
      <Text className="text-bike-text-dim mb-6">Sign in with your phone number.</Text>

      <View className="bg-bike-orange p-1 relative rounded-sm mb-3">
        <View className="absolute top-0 bottom-0 left-3 right-3 z-10 bg-bike-bg" />
        <TextInput
          className="text-base text-bike-text py-3 px-3 z-20 bg-bike-bg rounded-sm"
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number (e.g. +61400111222)"
          placeholderTextColor="#6b5344"
          autoCapitalize="none"
          keyboardType="phone-pad"
          editable={!authLoading}
        />
      </View>

      {step === 'code' ? (
        <TextInput
          className="text-base text-bike-text py-3 px-3 bg-bike-card rounded-md border border-bike-border mb-3"
          value={code}
          onChangeText={setCode}
          placeholder="SMS code"
          placeholderTextColor="#6b5344"
          keyboardType="number-pad"
          editable={!authLoading}
        />
      ) : null}

      {(localError || authError) ? (
        <Text className="text-red-400 mb-3">{localError ?? authError}</Text>
      ) : null}

      <TouchableOpacity
        className={`py-3 px-4 rounded-md items-center ${(step === 'phone' ? canRequestOtp : canVerifyOtp) ? 'bg-bike-orange-muted' : 'bg-bike-border'}`}
        disabled={authLoading || (step === 'phone' ? !canRequestOtp : !canVerifyOtp)}
        onPress={step === 'phone' ? onRequestCode : onVerifyCode}
      >
        {authLoading ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text className="text-bike-text font-bold">{step === 'phone' ? 'Send code' : 'Verify code'}</Text>
        )}
      </TouchableOpacity>

      {step === 'code' ? (
        <TouchableOpacity
          className="mt-4 self-center"
          disabled={authLoading}
          onPress={() => {
            setLocalError(null);
            setStep('phone');
            setCode('');
          }}
        >
          <Text className="text-bike-orange-bright">Use a different phone number</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
};

export default LoginScreen;
