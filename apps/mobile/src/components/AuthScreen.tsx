import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ApiError, errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors } from '@/lib/theme';
import { Art } from '@/components/Art';
import { Body, Button, ErrorNote, Input, Title } from '@/components/ui';

export function AuthScreen({ mode }: { mode: 'login' | 'register' }) {
  const { signIn, register } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setPending(true);
    setError(null);
    try {
      if (mode === 'login') await signIn(email.trim(), password);
      else await register(name.trim(), email.trim(), password);
    } catch (e) {
      if (e instanceof ApiError && Array.isArray(e.details)) setError((e.details as { message: string }[]).map((d) => d.message).join(' '));
      else setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <View style={{ borderRadius: 28, overflow: 'hidden' }}><Art seed={3} height={150} /></View>
          <Title size="xl">{mode === 'login' ? 'Welcome back' : 'Meet Friday'}</Title>
          <Body muted>Plan. Learn. Stay informed. Be productive.</Body>
          {mode === 'register' ? <Input label="Your name" value={name} onChangeText={setName} autoComplete="given-name" textContentType="givenName" /> : null}
          <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
          <Input
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            textContentType={mode === 'login' ? 'password' : 'newPassword'}
          />
          {mode === 'register' ? <Body muted>At least 12 characters. A passphrase works well.</Body> : null}
          {error ? <ErrorNote message={error} /> : null}
          <Button variant="primary" title={mode === 'login' ? 'Sign in' : 'Create account'} onPress={submit} pending={pending} />
          <Link href={mode === 'login' ? '/register' : '/login'} style={{ color: colors.text, textDecorationLine: 'underline', paddingVertical: 12 }}>
            {mode === 'login' ? 'New here? Create an account' : 'Already have an account? Sign in'}
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
