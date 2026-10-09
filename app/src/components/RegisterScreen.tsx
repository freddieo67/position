import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { api, User } from '../api';
import { saveUser } from '../session';
import i18n from '../i18n';

interface RegisterScreenProps {
  onRegistered: (user: User) => void;
}

// Första skärmen: vem är jag? Numret används för att vänner ska hitta en via sin telefonbok.
export default function RegisterScreen({ onRegistered }: RegisterScreenProps) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!name.trim() || phone.replace(/\D/g, '').length < 8) {
      setError(i18n.t('invalid_phone') + ' / ' + i18n.t('invalid_name'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const user = await api.register(phone, name.trim());
      await saveUser(user);
      onRegistered(user);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>{i18n.t('welcome', { defaultValue: 'Välkommen till Position' })}</Text>
      <Text style={styles.subtitle}>
        {i18n.t('privacy_policy_agree')}
      </Text>

      <TextInput
        style={styles.input}
        placeholder={i18n.t('enter_name')}
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
      />
      <TextInput
        style={styles.input}
        placeholder={i18n.t('enter_phone')}
        value={phone}
        onChangeText={setPhone}
        keyboardType="phone-pad"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity style={styles.button} onPress={submit} disabled={busy}>
        {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{i18n.t('continue')}</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: '#666',
    marginBottom: 24,
  },
  input: {
    backgroundColor: '#f0f0f0',
    padding: 14,
    borderRadius: 10,
    marginBottom: 12,
    fontSize: 16,
  },
  error: {
    color: '#ff3b30',
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
