import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAppStore } from '../state/store';

const LoginScreen = () => {
  const { authLoading, authError, loginWithEmail, signupWithEmail } = useAppStore((state) => ({
    authLoading: state.authLoading,
    authError: state.authError,
    loginWithEmail: state.loginWithEmail,
    signupWithEmail: state.signupWithEmail,
  }));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [localError, setLocalError] = useState<string | null>(null);

  const canSubmit = useMemo(() => email.trim().length > 4 && password.length >= 6, [email, password]);

  const onSubmit = async () => {
    setLocalError(null);
    if (!canSubmit) {
      setLocalError('Enter a valid email and at least 6-character password.');
      return;
    }
    try {
      if (mode === 'login') {
        await loginWithEmail(email.trim(), password);
      } else {
        await signupWithEmail(email.trim(), password);
      }
    } catch {
      // handled by authError
    }
  };

  return (
    <View className="flex-1 bg-bike-bg px-6 justify-center">
      <Text className="text-3xl font-bold text-bike-text mb-2">Bike Chat</Text>
      <Text className="text-bike-text-dim mb-6">Sign in to start proximity intercom rides.</Text>

      <TextInput
        className="text-base text-bike-text py-3 px-3 bg-bike-card rounded-md border border-bike-border mb-3"
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        placeholderTextColor="#6b5344"
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        className="text-base text-bike-text py-3 px-3 bg-bike-card rounded-md border border-bike-border mb-3"
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        placeholderTextColor="#6b5344"
        secureTextEntry
      />

      {(localError || authError) ? (
        <Text className="text-red-400 mb-3">{localError ?? authError}</Text>
      ) : null}

      <TouchableOpacity
        className={`py-3 px-4 rounded-md items-center ${canSubmit ? 'bg-bike-orange-muted' : 'bg-bike-border'}`}
        disabled={!canSubmit || authLoading}
        onPress={onSubmit}
      >
        {authLoading ? (
          <ActivityIndicator color="#111" />
        ) : (
          <Text className="text-bike-text font-bold">{mode === 'login' ? 'Sign in' : 'Create account'}</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity className="mt-4 self-center" onPress={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        <Text className="text-bike-orange-bright">
          {mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Sign in'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export default LoginScreen;
