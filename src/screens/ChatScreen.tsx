import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Button,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  GestureResponderEvent,
  Platform,
} from 'react-native';
import { EventEmitter } from 'expo-modules-core';
import { useConfigContext } from '../store/config';
import { InkeepClient, ChatMessage } from '../lib/inkeepClient';
import * as Speech from 'expo-speech';

export default function ChatScreen({ route }: any) {
  const { agentId } = route.params as { agentId: string };
  const { config, activeManageBaseUrl, activeRunBaseUrl } = useConfigContext();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [willCancel, setWillCancel] = useState(false);
  const startYRef = useRef<number | null>(null);

  // Web fallback state/refs
  const webRecognitionRef = useRef<any>(null);
  const webFinalRef = useRef<string>('');
  const liveTranscriptRef = useRef<string>('');
  const willCancelRef = useRef<boolean>(false);
  useEffect(() => { liveTranscriptRef.current = liveTranscript; }, [liveTranscript]);
  useEffect(() => { willCancelRef.current = willCancel; }, [willCancel]);

  // Native SR event handling (lazy-loaded to avoid Expo Go crash)
  const srEmitterRef = useRef<EventEmitter | null>(null);
  const srSubsRef = useRef<any[]>([]);
  const nativeFinalRef = useRef<string>('');
  const cleanupNativeSubs = () => {
    srSubsRef.current.forEach((sub) => sub?.remove?.());
    srSubsRef.current = [];
  };
  // Cleanup native subscriptions on unmount
  useEffect(() => {
    return () => {
      cleanupNativeSubs();
    };
  }, []);


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

  // Real-time speech results (web handled in ensureWebRecognizer; native listeners are attached on start)

  // Ensure Web Speech API recognizer exists and is wired
  const ensureWebRecognizer = () => {
    if (Platform.OS !== 'web') return false;
    // @ts-ignore
    const SRClass = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SRClass) {
      console.warn('[Voice] Web Speech API not available (use Chrome/Edge over HTTPS).');
      return false;
    }
    if (!webRecognitionRef.current) {
      const rec = new SRClass();
      rec.lang = 'en-US';
      rec.interimResults = true;
      rec.continuous = false;
      rec.onstart = () => console.log('[Voice] web recognition start');
      rec.onerror = (ev: any) => console.warn('[Voice] web recognition error', ev?.error || ev);
      rec.onresult = (ev: any) => {
        let interim = '';
        let finalText = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const res = ev.results[i];
          const txt = res[0]?.transcript || '';
          if (res.isFinal) finalText += txt;
          else interim += txt;
        }
        if (interim) setLiveTranscript(interim);
        if (finalText) webFinalRef.current += finalText;
      };
      rec.onend = () => {
        console.log('[Voice] web recognition end');
        const finalText = (webFinalRef.current || '').trim() || (liveTranscriptRef.current || '').trim();
        setListening(false);
        setLiveTranscript('');
        const willEdit = willCancelRef.current;
        if (finalText) {
          if (willEdit) setInput((t) => (t ? `${t} ${finalText}` : finalText));
          else send(finalText);
        }
        webFinalRef.current = '';
      };
      webRecognitionRef.current = rec;
    }
    return true;
  };

  // Native 'end' event handled via lazy listener; web handled in ensureWebRecognizer onend

  const startRecording = async (e?: GestureResponderEvent) => {
    if (listening) return;
    try {
      setWillCancel(false);
      setLiveTranscript('');
      setListening(true);
      nativeFinalRef.current = '';
      if (e) startYRef.current = e.nativeEvent.pageY;

      // Try native first via dynamic import (avoids Expo Go crash when module is unavailable)
      if (Platform.OS !== 'web') {
        try {
          const SR: any = await import('expo-speech-recognition');
          if (SR?.ExpoSpeechRecognitionModule?.start) {
            // Attach listeners
            if (!srEmitterRef.current) {
              srEmitterRef.current = new EventEmitter(SR.ExpoSpeechRecognitionModule);
            }
            cleanupNativeSubs();
            const subResult = srEmitterRef.current.addListener('result', (event: any) => {
              const t = event?.results?.[0]?.transcript ?? event?.text ?? event?.transcript ?? '';
              if (t) setLiveTranscript(t);
              if (event?.isFinal && t) nativeFinalRef.current = t;
            });
            const subEnd = srEmitterRef.current.addListener('end', () => {
              setListening(false);
              const finalText = (nativeFinalRef.current || liveTranscriptRef.current || '').trim();
              setLiveTranscript('');
              const willEdit = willCancelRef.current;
              if (finalText) {
                if (willEdit) setInput((t) => (t ? `${t} ${finalText}` : finalText));
                else send(finalText);
              }
              nativeFinalRef.current = '';
            });
            srSubsRef.current.push(subResult, subEnd);

            console.log('[Voice] native start');
            SR.ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true });
            return;
          }
        } catch (err) {
          console.warn('[Voice] native SR unavailable (likely Expo Go):', (err as any)?.message || err);
        }
      }

      // Web fallback
      if (ensureWebRecognizer()) {
        try {
          webFinalRef.current = '';
          webRecognitionRef.current?.start();
          console.log('[Voice] web start');
        } catch (err) {
          console.warn('[Voice] web start error', err);
          setListening(false);
        }
      } else {
        setListening(false);
      }
    } catch (err) {
      console.warn('[Voice] startRecording error', err);
      setListening(false);
    }
  };

  const stopRecordingAndHandle = async () => {
    try {
      // If nothing is recording, ignore
      const hasWeb = Platform.OS === 'web' && webRecognitionRef.current;
      if (!listening && !hasWeb) return;

      if (Platform.OS !== 'web') {
        try {
          const SR: any = await import('expo-speech-recognition');
          if (SR?.ExpoSpeechRecognitionModule?.stop) {
            console.log('[Voice] native stop');
            SR.ExpoSpeechRecognitionModule.stop();
            // Finalization handled in 'end' listener
          }
        } catch (err) {
          console.warn('[Voice] native stop unavailable (likely Expo Go):', (err as any)?.message || err);
        }
      }

      if (Platform.OS === 'web' && webRecognitionRef.current) {
        try {
          console.log('[Voice] web stop');
          webRecognitionRef.current.stop();
          // onend will finalize
        } catch (err) {
          console.warn('[Voice] web stop error', err);
          setListening(false);
        }
      }
    } catch (err) {
      console.warn('[Voice] stopRecording error', err);
      setListening(false);
    } finally {
      startYRef.current = null;
      setWillCancel(false);
    }
  };

  const handleResponderMove = (e: GestureResponderEvent) => {
    if (startYRef.current == null) return;
    const dy = e.nativeEvent.pageY - startYRef.current;
    // Slide up to cancel when moved up by 40px
    const cancel = dy < -40;
    if (cancel !== willCancel) setWillCancel(cancel);
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
      {listening && (
        <View style={styles.overlay} pointerEvents="none">
          <Text style={styles.overlayText}>{willCancel ? 'Release to edit' : 'Release to send'}</Text>
          {!!liveTranscript && (
            <Text style={styles.overlayTranscript} numberOfLines={2}>
              {liveTranscript}
            </Text>
          )}
        </View>
      )}
      <View style={styles.inputRow}>
        <View
          style={styles.micWrapper}
          onStartShouldSetResponder={() => true}
          onResponderGrant={startRecording}
          onResponderMove={handleResponderMove}
          onResponderRelease={stopRecordingAndHandle}
        >
          <TouchableOpacity
            style={[styles.mic, listening && styles.micOn]}
            activeOpacity={0.7}
            onPressIn={(e) => { if (!listening) startRecording(e as any); }}
            onPressOut={() => { if (listening) stopRecordingAndHandle(); }}
          >
            <Text style={{ color: listening ? 'white' : '#333' }}>{listening ? 'Recording…' : 'Hold to Talk'}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          placeholder={listening ? 'Listening…' : 'Type a message or hold the mic'}
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
  micWrapper: { borderRadius: 10 },
  mic: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#ccc' },
  micOn: { backgroundColor: '#1f7aec', borderColor: '#1f7aec' },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 72, alignItems: 'center', padding: 12 },
  overlayText: { backgroundColor: 'rgba(0,0,0,0.75)', color: 'white', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, marginBottom: 6, fontSize: 12 },
  overlayTranscript: { backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', padding: 8, borderRadius: 8, maxWidth: '90%' },
});
