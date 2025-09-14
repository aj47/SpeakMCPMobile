import { useEffect, useState } from 'react';
import { View, Text, TextInput, Button, Switch, StyleSheet, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppConfig, saveConfig, useConfigContext } from '../store/config';
import { theme } from '../ui/theme';

export default function SettingsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const { config, setConfig, ready } = useConfigContext();
  const [local, setLocal] = useState(config.env === 'local');
  const [draft, setDraft] = useState<AppConfig>(config);

  useEffect(() => {
    setDraft(config);
    setLocal(config.env === 'local');
  }, [ready]);

  const onSave = async () => {
    const toSave: AppConfig = { ...draft, env: local ? 'local' : 'cloud' };
    setConfig(toSave);
    await saveConfig(toSave);
    navigation.navigate('Agents');
  };

  if (!ready) return null;

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + theme.spacing.md }]}>
      <Text style={styles.h1}>Inkeep Settings</Text>

      <Text style={styles.label}>API Key</Text>
      <TextInput style={styles.input} value={draft.apiKey} onChangeText={(t)=>setDraft({ ...draft, apiKey: t })} placeholder="sk_*" autoCapitalize='none' />

      <Text style={styles.label}>Tenant ID</Text>
      <TextInput style={styles.input} value={draft.tenantId} onChangeText={(t)=>setDraft({ ...draft, tenantId: t })} autoCapitalize='none' />

      <Text style={styles.label}>Project ID</Text>
      <TextInput style={styles.input} value={draft.projectId} onChangeText={(t)=>setDraft({ ...draft, projectId: t })} autoCapitalize='none' />

      <Text style={styles.label}>Graph ID</Text>
      <TextInput style={styles.input} value={draft.graphId} onChangeText={(t)=>setDraft({ ...draft, graphId: t })} autoCapitalize='none' />

      <Text style={styles.label}>Model (Run API)</Text>
      <TextInput style={styles.input} value={draft.model} onChangeText={(t)=>setDraft({ ...draft, model: t })} placeholder='gpt-4o-mini' autoCapitalize='none' />

      <View style={styles.row}>
        <Text style={styles.label}>Use Local</Text>
        <Switch value={local} onValueChange={setLocal} />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Hands-free Voice Mode</Text>
        <Switch value={!!draft.handsFree} onValueChange={(v)=>setDraft({ ...draft, handsFree: v })} />
      </View>

      <Text style={styles.label}>Run API Base URL (Cloud)</Text>
      <TextInput style={styles.input} value={draft.runBaseUrlCloud} onChangeText={(t)=>setDraft({ ...draft, runBaseUrlCloud: t })} placeholder='https://run-api.example.com' autoCapitalize='none' />

      <Text style={styles.label}>Run API Base URL (Local)</Text>
      <TextInput style={styles.input} value={draft.runBaseUrlLocal} onChangeText={(t)=>setDraft({ ...draft, runBaseUrlLocal: t })} placeholder='http://localhost:3003' autoCapitalize='none' />

      <Text style={styles.label}>Manage API Base URL (Cloud)</Text>
      <TextInput style={styles.input} value={draft.manageBaseUrlCloud} onChangeText={(t)=>setDraft({ ...draft, manageBaseUrlCloud: t })} placeholder='https://manage-api.example.com' autoCapitalize='none' />

      <Text style={styles.label}>Manage API Base URL (Local)</Text>
      <TextInput style={styles.input} value={draft.manageBaseUrlLocal} onChangeText={(t)=>setDraft({ ...draft, manageBaseUrlLocal: t })} placeholder='http://localhost:3002' autoCapitalize='none' />

      <Button title="Save & Continue" onPress={onSave} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: theme.spacing.lg, gap: theme.spacing.md },
  h1: { ...theme.typography.h1, marginBottom: theme.spacing.xs },
  label: { ...theme.typography.label, marginTop: theme.spacing.sm },
  input: { ...theme.input },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: theme.spacing.sm },
});
