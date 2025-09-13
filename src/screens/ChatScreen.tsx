import { useRef, useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useConfigContext } from '../store/config';
import { InkeepClient, ChatMessage } from '../lib/inkeepClient';
import * as Speech from 'expo-speech';
import * as SpeechRecognition from 'expo-speech-recognition';

export default function ChatScreen({ route }: any) {
  const { agentId } = route.params as { agentId: string };
  const { config, activeManageBaseUrl, activeRunBaseUrl } = useConfigContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const convoRef = useRef<string | undefined>(undefined);

  const client = new InkeepClient({
    manageBaseUrl: activeManageBaseUrl,
    runBaseUrl: activeRunBaseUrl,
    apiKey: config.apiKey,
    tenantId: config.tenantId,
    projectId: config.projectId,
    graphId: config.graphId,
    model: config.model,
  });

  const send = async (text: string) => {
    if (!text.trim()) return;
    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((m) => [...m, userMsg, { role: 'assistant', content: '' }]);
    setInput('');
    try {
      let full = '';
      const reply = await client.chat([...messages, userMsg], convoRef.current, (tok) => {
        full += tok;
        setMessages((m) => {
          const copy = [...m];
          // Update the last assistant message incrementally
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === 'assistant') {
              copy[i] = { ...copy[i], content: (copy[i].content || '') + tok };
              break;
            }
          }
          return copy;
        });
      });
      const finalText = reply || full;
      if (finalText) {
        Speech.speak(finalText, { language: 'en-US' });
      }
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: `Error: ${e.message}` }]);
    }
  };

  const toggleListen = async () => {
    const SR: any = SpeechRecognition as any;
    try {
      if (!listening) {
        setListening(true);
        if (SR?.startAsync) {
          await SR.startAsync({ lang: 'en-US' });
        }
      } else {
        let text = '';
        if (SR?.stopAsync) {
          const res = await SR.stopAsync();
          text = res?.text ?? res?.transcript ?? '';
        }
        setListening(false);
        if (text) setInput((t) => (t ? t + ' ' + text : text));
      }
    } catch (e) {
      setListening(false);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={{ flex: 1, padding: 16 }}>
        {messages.map((m, i) => (
          <View key={i} style={[styles.msg, m.role === 'user' ? styles.user : styles.assistant]}>
            <Text style={styles.role}>{m.role}</Text>
            <Text>{m.content}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.inputRow}>
        <TouchableOpacity style={[styles.mic, listening && styles.micOn]} onPress={toggleListen}>
          <Text style={{ color: listening ? 'white' : '#333' }}>{listening ? 'Stop' : 'Mic'}</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder="Type a message or use the mic..."
          multiline
        />
        <Button title="Send" onPress={() => send(input)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  msg: { padding: 10, borderRadius: 8, marginBottom: 8 },
  user: { backgroundColor: '#e6f2ff', alignSelf: 'flex-end', maxWidth: '85%' },
  assistant: { backgroundColor: '#f2f2f2', alignSelf: 'flex-start', maxWidth: '85%' },
  role: { fontSize: 10, color: '#666', marginBottom: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderTopWidth: StyleSheet.hairlineWidth, borderColor: '#ddd' },
  input: { flex: 1, borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, maxHeight: 120 },
  mic: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' },
  micOn: { backgroundColor: '#1f7aec', borderColor: '#1f7aec' },
});

