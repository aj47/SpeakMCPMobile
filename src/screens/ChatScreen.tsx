import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
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
  KeyboardAvoidingView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventEmitter } from 'expo-modules-core';
import { useConfigContext, saveConfig } from '../store/config';
import { useSessionContext } from '../store/sessions';
import { OpenAIClient, ChatMessage } from '../lib/openaiClient';
import { ChatMessage as SessionMessage, generateMessageId } from '../types/session';
import * as Speech from 'expo-speech';
import { useHeaderHeight } from '@react-navigation/elements';
import { theme } from '../ui/theme';

// Convert session messages to OpenAI format
function sessionToOpenAIMessages(messages: SessionMessage[]): ChatMessage[] {
  return messages.map(m => ({
    id: m.id,
    role: m.role,
    content: m.content,
  }));
}

// Convert OpenAI message to session message
function openAIToSessionMessage(msg: ChatMessage): SessionMessage {
  return {
    id: msg.id || generateMessageId(),
    role: msg.role,
    content: msg.content || '',
    timestamp: Date.now(),
  };
}

export default function ChatScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { config, setConfig } = useConfigContext();
  const sessionStore = useSessionContext();
  const handsFree = !!config.handsFree;
  const handsFreeRef = useRef<boolean>(handsFree);
  useEffect(() => { handsFreeRef.current = !!config.handsFree; }, [config.handsFree]);

  // Get current session and its messages
  const currentSession = sessionStore.getCurrentSession();
  const sessionId = currentSession?.id;

  // IMPORTANT: Use refs to store latest values that need to be accessible from stale closures
  // Voice recognition callbacks capture old closures, so we use refs to get the latest values
  const serverConversationIdRef = useRef<string | undefined>(currentSession?.serverConversationId);
  const sessionIdRef = useRef<string | undefined>(sessionId);
  const sessionStoreRef = useRef(sessionStore);

  // Keep refs updated with latest values
  useEffect(() => {
    serverConversationIdRef.current = currentSession?.serverConversationId;
    sessionIdRef.current = sessionId;
    sessionStoreRef.current = sessionStore;
    console.log('[ChatScreen] Refs updated:', {
      sessionId: sessionId,
      serverConversationId: currentSession?.serverConversationId || 'NONE',
    });
  }, [currentSession?.serverConversationId, sessionId, sessionStore]);

  const toggleHandsFree = async () => {
    const next = !handsFreeRef.current;
    const nextCfg = { ...config, handsFree: next } as any;
    setConfig(nextCfg);
    try { await saveConfig(nextCfg); } catch {}
  };

  // Create client early so it's available for handleKillSwitch
  const client = new OpenAIClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  });

  const handleKillSwitch = async () => {
    console.log('[ChatScreen] Kill switch button pressed');

    // Alert.alert doesn't work on web, use window.confirm for web platform
    if (Platform.OS === 'web') {
      const confirmed = window.confirm(
        '⚠️ Emergency Stop\n\nAre you sure you want to stop all agent sessions on the remote server? This will immediately terminate any running tasks.'
      );
      if (confirmed) {
        console.log('[ChatScreen] Kill switch confirmed (web), calling API...');
        try {
          const result = await client.killSwitch();
          console.log('[ChatScreen] Kill switch result:', result);
          if (result.success) {
            window.alert(result.message || 'All sessions stopped');
          } else {
            window.alert('Error: ' + (result.error || 'Failed to stop sessions'));
          }
        } catch (e: any) {
          console.error('[ChatScreen] Kill switch error:', e);
          window.alert('Error: ' + (e.message || 'Failed to connect to server'));
        }
      }
      return;
    }

    // Native platforms use Alert.alert
    Alert.alert(
      '⚠️ Emergency Stop',
      'Are you sure you want to stop all agent sessions on the remote server? This will immediately terminate any running tasks.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Stop All',
          style: 'destructive',
          onPress: async () => {
            console.log('[ChatScreen] Kill switch confirmed, calling API...');
            try {
              const result = await client.killSwitch();
              console.log('[ChatScreen] Kill switch result:', result);
              if (result.success) {
                Alert.alert('Success', result.message || 'All sessions stopped');
              } else {
                Alert.alert('Error', result.error || 'Failed to stop sessions');
              }
            } catch (e: any) {
              console.error('[ChatScreen] Kill switch error:', e);
              Alert.alert('Error', e.message || 'Failed to connect to server');
            }
          },
        },
      ],
    );
  };

  useLayoutEffect(() => {
    navigation?.setOptions?.({
      title: currentSession?.title || 'Chat',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity
            onPress={handleKillSwitch}
            accessibilityRole="button"
            accessibilityLabel="Emergency stop - kill all agent sessions"
            style={{ paddingHorizontal: 8, paddingVertical: 6 }}
          >
            <View style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: theme.colors.danger,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Text style={{ fontSize: 14, color: '#FFFFFF' }}>⏹</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={toggleHandsFree}
            accessibilityRole="button"
            accessibilityLabel={`Toggle hands-free (currently ${handsFree ? 'on' : 'off'})`}
            style={{ paddingHorizontal: 12, paddingVertical: 6 }}
          >
            <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 18 }}>🎙️</Text>
              {!handsFree && (
                <View
                  style={{
                    position: 'absolute',
                    width: 20,
                    height: 2,
                    backgroundColor: theme.colors.danger,
                    transform: [{ rotate: '45deg' }],
                    borderRadius: 1,
                  }}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>
      ),
    });
  }, [navigation, handsFree, handleKillSwitch, currentSession?.title]);


  // Initialize messages from current session
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    if (currentSession) {
      return sessionToOpenAIMessages(currentSession.messages);
    }
    return [];
  });
  const [input, setInput] = useState('');
  const [listening, setListening] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [responding, setResponding] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string>('');

  // Sync messages when session changes
  useEffect(() => {
    if (currentSession) {
      setMessages(sessionToOpenAIMessages(currentSession.messages));
    } else {
      setMessages([]);
    }
  }, [sessionId]); // Only re-sync when session ID changes

  // Redirect to sessions list if no current session
  useEffect(() => {
    if (!sessionId && !sessionStore.isLoading) {
      navigation.navigate('Sessions');
    }
  }, [sessionId, sessionStore.isLoading, navigation]);

  const [willCancel, setWillCancel] = useState(false);
  const startYRef = useRef<number | null>(null);

  // Web fallback state/refs
  const webRecognitionRef = useRef<any>(null);
  const webFinalRef = useRef<string>('');
  const liveTranscriptRef = useRef<string>('');
  const willCancelRef = useRef<boolean>(false);
  useEffect(() => { liveTranscriptRef.current = liveTranscript; }, [liveTranscript]);
  useEffect(() => { willCancelRef.current = willCancel; }, [willCancel]);

  // Debounce/guard and timing refs for voice interaction
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const lastGrantTimeRef = useRef(0);
  const minHoldMs = 200;

  // Native SR event handling (lazy-loaded to avoid Expo Go crash)
  const srEmitterRef = useRef<any>(null);
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

  const send = async (text: string) => {
    if (!text.trim()) return;

    // IMPORTANT: Use refs to get the latest values - this avoids stale closure issues
    // when this function is called from voice recognition callbacks that captured old closures
    const freshSessionId = sessionIdRef.current;
    const freshServerConversationId = serverConversationIdRef.current;
    const store = sessionStoreRef.current;

    if (!freshSessionId) {
      console.warn('[ChatScreen] No active session, cannot send message');
      return;
    }

    console.log('[ChatScreen] ====== SENDING MESSAGE ======');
    console.log('[ChatScreen] Message:', text);
    console.log('[ChatScreen] Local Session ID (from ref):', freshSessionId);
    console.log('[ChatScreen] Server Conversation ID (from ref):', freshServerConversationId || 'NONE (will create new)');

    setDebugInfo(`Starting request to ${config.baseUrl}...`);

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages((m) => [...m, userMsg, { role: 'assistant', content: '' }]);
    setResponding(true);

    // Persist user message to session store (use store from ref)
    store.addMessageToSession(freshSessionId, 'user', text);

    setInput('');
    try {
      let full = '';
      console.log('[ChatScreen] Starting chat request with', messages.length + 1, 'messages');
      setDebugInfo('Request sent, waiting for response...');

      // Pass the server conversation ID to continue the same conversation on the server
      // Use freshServerConversationId to avoid stale closure issues
      const chatResponse = await client.chat(
        [...messages, userMsg],
        (tok) => {
          full += tok;
          setDebugInfo(`Receiving tokens... (${full.length} chars so far)`);

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
        },
        freshServerConversationId // Use fresh value, not captured currentSession
      );

      const finalText = chatResponse.content || full;
      console.log('[ChatScreen] ====== RESPONSE RECEIVED ======');
      console.log('[ChatScreen] Response length:', finalText?.length || 0);
      console.log('[ChatScreen] Server conversation ID from response:', chatResponse.conversationId || 'NONE');
      setDebugInfo(`Completed! Received ${finalText?.length || 0} characters`);

      // Store the server conversation ID for future messages in this session
      if (chatResponse.conversationId && chatResponse.conversationId !== freshServerConversationId) {
        console.log('[ChatScreen] STORING new server conversation ID:', chatResponse.conversationId);
        store.setServerConversationId(freshSessionId, chatResponse.conversationId);
        // Also update the ref immediately so subsequent messages in the same batch use it
        serverConversationIdRef.current = chatResponse.conversationId;
      } else {
        console.log('[ChatScreen] NOT storing conversation ID - already have:', freshServerConversationId);
      }

      if (finalText) {
        setMessages((m) => {
          const copy = [...m];
          for (let i = copy.length - 1; i >= 0; i--) {
            if (copy[i].role === 'assistant') {
              copy[i] = { ...copy[i], content: finalText };
              break;
            }
          }
          return copy;
        });
        // Persist assistant response to session store (use store from ref)
        store.addMessageToSession(freshSessionId, 'assistant', finalText);
        Speech.speak(finalText, { language: 'en-US' });
      }
    } catch (e: any) {
      console.error('[ChatScreen] Chat error:', e);
      setDebugInfo(`Error: ${e.message}`);
      const errorMsg = `Error: ${e.message}`;
      setMessages((m) => [...m, { role: 'assistant', content: errorMsg }]);
      // Persist error message to session store (use store from ref)
      store.addMessageToSession(freshSessionId, 'assistant', errorMsg);
    } finally {
      console.log('[ChatScreen] Chat request finished');
      setResponding(false);
      setTimeout(() => setDebugInfo(''), 3000); // Clear debug info after 3 seconds
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
      rec.continuous = handsFreeRef.current;
      rec.onstart = () => {};
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
        if (finalText) {
          if (handsFreeRef.current) {
            setLiveTranscript('');
            webFinalRef.current = '';
            const toSend = finalText.trim();
            if (toSend) send(toSend);
          } else {
            webFinalRef.current += finalText;
          }
        }
      };
      rec.onend = () => {
        const finalText = (webFinalRef.current || '').trim() || (liveTranscriptRef.current || '').trim();
        setListening(false);
        setLiveTranscript('');
        const willEdit = willCancelRef.current;
        if (!handsFreeRef.current && finalText) {
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
    if (startingRef.current || listening) { return; }
    startingRef.current = true;
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
              if (event?.isFinal && t) {
                if (handsFreeRef.current) {
                  const final = t.trim();
                  nativeFinalRef.current = '';
                  setLiveTranscript('');
                  if (final) send(final);
                } else {
                  nativeFinalRef.current = t;
                }
              }
            });
            const subError = srEmitterRef.current.addListener('error', (event: any) => {
              console.warn('[Voice] recognition error', event);
            });
            const subEnd = srEmitterRef.current.addListener('end', () => {
              setListening(false);
              const finalText = (nativeFinalRef.current || liveTranscriptRef.current || '').trim();
              setLiveTranscript('');
              const willEdit = willCancelRef.current;
              if (!handsFreeRef.current && finalText) {
                if (willEdit) setInput((t) => (t ? `${t} ${finalText}` : finalText));
                else send(finalText);
              }
              nativeFinalRef.current = '';
            });
            srSubsRef.current.push(subResult, subError, subEnd);

            // Permissions flow
            try {
              const perm = await SR.ExpoSpeechRecognitionModule.getPermissionsAsync();
              if (!perm?.granted) {
                const req = await SR.ExpoSpeechRecognitionModule.requestPermissionsAsync();
                if (!req?.granted) {
                  console.warn('[Voice] microphone/speech permission not granted; aborting');
                  setListening(false);
                  startingRef.current = false;
                  return;
                }
              }
            } catch (perr) {
              console.warn('[Voice] permission check/request failed', perr);
            }

            // Start recognition
            try {
              SR.ExpoSpeechRecognitionModule.start({ lang: 'en-US', interimResults: true, continuous: handsFreeRef.current, volumeChangeEventOptions: { enabled: handsFreeRef.current, intervalMillis: 250 } });
            } catch (serr) {
              console.warn('[Voice] native start error', serr);
              setListening(false);
            }
            startingRef.current = false;
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
          if (webRecognitionRef.current) {
            try { webRecognitionRef.current.continuous = handsFreeRef.current; } catch {}
          }
          webRecognitionRef.current?.start();
          startingRef.current = false;
        } catch (err) {
          console.warn('[Voice] web start error', err);
          setListening(false);
          startingRef.current = false;
        }
      } else {
        setListening(false);
        startingRef.current = false;
      }
    } catch (err) {
      console.warn('[Voice] startRecording error', err);
      setListening(false);
      startingRef.current = false;
    }
  };

  const stopRecordingAndHandle = async () => {
    if (stoppingRef.current) { return; }
    stoppingRef.current = true;
    try {
      // If nothing is recording, ignore
      const hasWeb = Platform.OS === 'web' && webRecognitionRef.current;
      if (!listening && !hasWeb) return;

      if (Platform.OS !== 'web') {
        try {
          const SR: any = await import('expo-speech-recognition');
          if (SR?.ExpoSpeechRecognitionModule?.stop) {
            SR.ExpoSpeechRecognitionModule.stop();
            // Finalization handled in 'end' listener
          }
        } catch (err) {
          console.warn('[Voice] native stop unavailable (likely Expo Go):', (err as any)?.message || err);
        }
      }

      if (Platform.OS === 'web' && webRecognitionRef.current) {
        try {
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
      stoppingRef.current = false;
    }
  };


  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={headerHeight}
    >
      <View style={{ flex: 1 }}>
        <ScrollView
          style={{ flex: 1, padding: theme.spacing.lg }}
          contentContainerStyle={{ paddingBottom: insets.bottom }}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {messages.map((m, i) => (
            <View key={i} style={[styles.msg, m.role === 'user' ? styles.user : styles.assistant]}>
              <Text style={styles.role}>{m.role}</Text>
              {m.role === 'assistant' && (!m.content || m.content.length === 0) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <ActivityIndicator size="small" color={theme.colors.text} />
                  <Text>Assistant is thinking</Text>
                </View>
              ) : (
                <Text>{m.content}</Text>
              )}
            </View>
          ))}
          {debugInfo && (
            <View style={styles.debugInfo}>
              <Text style={styles.debugText}>{debugInfo}</Text>
            </View>
          )}
        </ScrollView>
        {listening && (
          <View style={[styles.overlay, { bottom: 72 + insets.bottom }]} pointerEvents="none">
            <Text style={styles.overlayText}>
              {handsFree ? 'Listening...' : (willCancel ? 'Release to edit' : 'Release to send')}
            </Text>
            {!!liveTranscript && (
              <Text style={styles.overlayTranscript} numberOfLines={2}>
                {liveTranscript}
              </Text>
            )}
          </View>
        )}
        <View style={[styles.inputRow, { paddingBottom: 12 + insets.bottom }]}>
          <View style={styles.micWrapper}>
            <TouchableOpacity
              style={[styles.mic, listening && styles.micOn]}
              activeOpacity={0.7}
              delayPressIn={0}
              onPressIn={!handsFree ? (e: GestureResponderEvent) => {
                lastGrantTimeRef.current = Date.now();
                if (!listening) startRecording(e);
              } : undefined}
              onPressOut={!handsFree ? () => {
                const now = Date.now();
                const dt = now - lastGrantTimeRef.current;
                const delay = Math.max(0, minHoldMs - dt);
                if (delay > 0) {
                  setTimeout(() => { if (listening) stopRecordingAndHandle(); }, delay);
                } else {
                  if (listening) stopRecordingAndHandle();
                }
              } : undefined}
              onPress={handsFree ? () => {
                if (!listening) startRecording(); else stopRecordingAndHandle();
              } : undefined}
            >
              <Text style={{ color: listening ? '#FFFFFF' : theme.colors.text }}>
                {handsFree ? (listening ? 'Listening… Tap to Stop' : 'Tap to Talk') : (listening ? 'Recording…' : 'Hold to Talk')}
              </Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder={handsFree ? (listening ? 'Listening…' : 'Type a message or tap the mic') : (listening ? 'Listening…' : 'Type a message or hold the mic')}
            multiline
          />
          <Button title="Send" onPress={() => send(input)} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  msg: { padding: theme.spacing.md, borderRadius: 12, marginBottom: theme.spacing.sm, maxWidth: '85%' },
  user: { backgroundColor: theme.colors.primarySoft, alignSelf: 'flex-end' },
  assistant: { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border, alignSelf: 'flex-start' },
  role: { ...theme.typography.caption, marginBottom: theme.spacing.xs },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm, padding: theme.spacing.md, borderTopWidth: theme.hairline, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  input: { ...theme.input, flex: 1, maxHeight: 120 },
  micWrapper: { borderRadius: 10 },
  mic: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface },
  micOn: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  debugInfo: {
    backgroundColor: '#f0f0f0',
    padding: theme.spacing.sm,
    margin: theme.spacing.sm,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#007AFF'
  },
  debugText: {
    fontSize: 12,
    color: '#666',
    fontFamily: 'monospace'
  },
  overlay: { position: 'absolute', left: 0, right: 0, bottom: 72, alignItems: 'center', padding: theme.spacing.md },
  overlayText: { ...theme.typography.caption, backgroundColor: 'rgba(0,0,0,0.75)', color: '#FFFFFF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, marginBottom: 6 },
  overlayTranscript: { backgroundColor: 'rgba(0,0,0,0.6)', color: '#FFFFFF', padding: 10, borderRadius: 10, maxWidth: '90%' },
});
