import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============ TYPES ============
interface Message {
  id: string;
  role: 'user' | 'nero';
  content: string;
  timestamp: string;
  isVoice?: boolean;
}

interface UserMemory {
  facts: {
    name?: string;
    firstSeen: string;
    lastSeen: string;
    totalConversations: number;
  };
  threads: {
    commitments: string[];
    openLoops: string[];
  };
  patterns: {
    knownStruggles: string[];
    whatHelps: string[];
  };
  remembered: string[];
}

// ============ CONSTANTS ============
const COLORS = {
  bg: '#0a0a0f',
  surface: '#16161f',
  surfaceLight: '#1e1e2a',
  primary: '#6366f1',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  textDim: '#52525b',
  border: '#27272a',
  listening: '#ef4444',
  speaking: '#22c55e',
  live: '#f59e0b',
};

const NERO_PERSONA = `You are Nero, an AI companion for someone with ADHD.

PERSONALITY:
- Warm but real. Not fake positive.
- Direct. Short responses. No lectures.
- You remember everything about this person.
- You push back gently when needed.

RULES:
- ONE question max per response. Often zero.
- Keep it short. 1-3 sentences usually.
- No bullet points. No lists. Just talk.
- Never guilt or shame.
- Be specific to THIS person, not generic.

FOR VOICE:
- Speak naturally, conversationally.
- Shorter is better. This is a real conversation.
- React to their tone and energy.`;

// ============ HELPERS ============
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
};

// ============ GEMINI LIVE SERVICE ============
class GeminiLiveService {
  private ws: WebSocket | null = null;
  private apiKey: string = '';
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying: boolean = false;
  
  public isConnected: boolean = false;
  public onTranscript: ((text: string, isFinal: boolean) => void) | null = null;
  public onResponse: ((text: string) => void) | null = null;
  public onStateChange: ((state: 'idle' | 'listening' | 'thinking' | 'speaking') => void) | null = null;
  public onError: ((error: string) => void) | null = null;

  setApiKey(key: string) {
    this.apiKey = key;
  }

  async connect(systemPrompt: string): Promise<boolean> {
    if (!this.apiKey) {
      this.onError?.('No Gemini API key set');
      return false;
    }

    return new Promise((resolve) => {
      try {
        // Gemini Live API WebSocket endpoint
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          console.log('Gemini Live connected');
          this.isConnected = true;
          
          // Send setup message
          const setupMessage = {
            setup: {
              model: 'models/gemini-2.5-flash-preview-native-audio-dialog',
              generationConfig: {
                responseModalities: ['AUDIO', 'TEXT'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: 'Aoede' // Natural female voice
                    }
                  }
                }
              },
              systemInstruction: {
                parts: [{ text: systemPrompt }]
              }
            }
          };
          
          this.ws?.send(JSON.stringify(setupMessage));
          resolve(true);
        };

        this.ws.onmessage = async (event) => {
          try {
            const data = JSON.parse(event.data);
            
            // Handle different message types
            if (data.serverContent) {
              const content = data.serverContent;
              
              // Text response
              if (content.modelTurn?.parts) {
                for (const part of content.modelTurn.parts) {
                  if (part.text) {
                    this.onResponse?.(part.text);
                  }
                  if (part.inlineData?.mimeType?.startsWith('audio/')) {
                    // Queue audio for playback
                    const audioData = this.base64ToArrayBuffer(part.inlineData.data);
                    this.audioQueue.push(audioData);
                    this.playNextAudio();
                  }
                }
              }
              
              // Turn complete
              if (content.turnComplete) {
                this.onStateChange?.('idle');
              }
            }
            
            // Handle user transcript
            if (data.clientContent?.turns) {
              for (const turn of data.clientContent.turns) {
                if (turn.parts) {
                  for (const part of turn.parts) {
                    if (part.text) {
                      this.onTranscript?.(part.text, true);
                    }
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error parsing Gemini message:', e);
          }
        };

        this.ws.onerror = (error) => {
          console.error('Gemini WebSocket error:', error);
          this.isConnected = false;
          this.onError?.('Connection error');
          resolve(false);
        };

        this.ws.onclose = () => {
          console.log('Gemini Live disconnected');
          this.isConnected = false;
          this.onStateChange?.('idle');
        };

      } catch (error) {
        console.error('Failed to connect:', error);
        this.onError?.('Failed to connect');
        resolve(false);
      }
    });
  }

  async startListening(): Promise<boolean> {
    if (!this.isConnected || !this.ws) {
      return false;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      
      // Create MediaRecorder for audio capture
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
          const arrayBuffer = await event.data.arrayBuffer();
          const base64 = this.arrayBufferToBase64(arrayBuffer);
          
          // Send audio to Gemini
          const audioMessage = {
            realtimeInput: {
              mediaChunks: [{
                mimeType: 'audio/webm;codecs=opus',
                data: base64
              }]
            }
          };
          
          this.ws.send(JSON.stringify(audioMessage));
        }
      };

      this.mediaRecorder.start(100); // Send chunks every 100ms
      this.onStateChange?.('listening');
      return true;
    } catch (error) {
      console.error('Error starting microphone:', error);
      this.onError?.('Microphone access denied');
      return false;
    }
  }

  stopListening() {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      this.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }
    this.onStateChange?.('thinking');
  }

  private async playNextAudio() {
    if (this.isPlaying || this.audioQueue.length === 0) return;
    
    this.isPlaying = true;
    this.onStateChange?.('speaking');
    
    while (this.audioQueue.length > 0) {
      const audioData = this.audioQueue.shift()!;
      await this.playAudio(audioData);
    }
    
    this.isPlaying = false;
  }

  private playAudio(audioData: ArrayBuffer): Promise<void> {
    return new Promise((resolve) => {
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      
      this.audioContext.decodeAudioData(audioData, (buffer) => {
        const source = this.audioContext!.createBufferSource();
        source.buffer = buffer;
        source.connect(this.audioContext!.destination);
        source.onended = () => resolve();
        source.start(0);
      }, () => resolve());
    });
  }

  disconnect() {
    this.stopListening();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.isConnected = false;
    this.audioQueue = [];
  }

  sendText(text: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    
    const message = {
      clientContent: {
        turns: [{
          role: 'user',
          parts: [{ text }]
        }],
        turnComplete: true
      }
    };
    
    this.ws.send(JSON.stringify(message));
    this.onStateChange?.('thinking');
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

// Singleton
const geminiLive = new GeminiLiveService();

// ============ FALLBACK TEXT API ============
const callNeroText = async (
  messages: Message[],
  memory: UserMemory,
  geminiKey: string
): Promise<string> => {
  const memoryContext = buildMemoryContext(memory);
  
  if (!geminiKey) {
    return getFallbackResponse(messages, memory);
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-04-17:generateContent?key=${geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.slice(-20).map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          })),
          systemInstruction: {
            parts: [{ text: `${NERO_PERSONA}\n\n${memoryContext}` }]
          },
          generationConfig: {
            maxOutputTokens: 300,
            temperature: 0.8
          }
        })
      }
    );

    if (!response.ok) throw new Error('API error');

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here. What's going on?";
  } catch (error) {
    console.error('Gemini error:', error);
    return getFallbackResponse(messages, memory);
  }
};

const buildMemoryContext = (memory: UserMemory): string => {
  const parts: string[] = ['ABOUT THIS PERSON:'];

  if (memory.facts.name) {
    parts.push(`- Name: ${memory.facts.name}`);
  }
  parts.push(`- Conversations: ${memory.facts.totalConversations}`);

  if (memory.threads.commitments.length > 0) {
    parts.push('\nTHEY SAID THEY WOULD:');
    memory.threads.commitments.slice(-3).forEach(c => parts.push(`- ${c}`));
  }

  if (memory.patterns.knownStruggles.length > 0) {
    parts.push('\nTHEY STRUGGLE WITH:');
    memory.patterns.knownStruggles.slice(-3).forEach(s => parts.push(`- ${s}`));
  }

  if (memory.remembered.length > 0) {
    parts.push('\nREMEMBER:');
    memory.remembered.slice(-5).forEach(r => parts.push(`- ${r}`));
  }

  return parts.join('\n');
};

const getFallbackResponse = (messages: Message[], memory: UserMemory): string => {
  const lastMessage = messages[messages.length - 1]?.content.toLowerCase() || '';
  const name = memory.facts.name;
  const timeOfDay = getTimeOfDay();

  if (memory.facts.totalConversations === 0) {
    return "Hey. I'm Nero. I'm here to help you actually do things, not just plan them. What's on your mind?";
  }

  if (lastMessage.match(/^(hey|hi|hello)/i)) {
    return `Hey${name ? ` ${name}` : ''}. What's going on?`;
  }

  if (lastMessage.includes('what should')) {
    if (memory.threads.commitments.length > 0) {
      return `You mentioned wanting to ${memory.threads.commitments[0]}. Start there?`;
    }
    return "What's the one thing that would make today feel like a win?";
  }

  return "I'm here. What do you need?";
};

const extractMemories = (message: string): string[] => {
  const memories: string[] = [];
  const nameMatch = message.match(/(?:I'm|I am|my name is|call me)\s+([A-Z][a-z]+)/i);
  if (nameMatch) memories.push(`NAME: ${nameMatch[1]}`);
  
  const commitMatch = message.match(/I (?:need|have|want|should|will) (?:to )?(.+?)(?:\.|$)/i);
  if (commitMatch && commitMatch[1].length > 5) {
    memories.push(`COMMITMENT: ${commitMatch[1].trim()}`);
  }
  
  return memories;
};

// ============ MAIN APP ============
export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [memory, setMemory] = useState<UserMemory>({
    facts: { firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), totalConversations: 0 },
    threads: { commitments: [], openLoops: [] },
    patterns: { knownStruggles: [], whatHelps: [] },
    remembered: [],
  });
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [geminiKey, setGeminiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // Live voice state
  const [liveState, setLiveState] = useState<'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Pulse animation for live mode
  useEffect(() => {
    if (liveState === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [liveState]);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  // Save data
  useEffect(() => {
    if (!isLoading) saveData();
  }, [messages, memory, geminiKey]);

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  // Setup Gemini Live callbacks
  useEffect(() => {
    geminiLive.onTranscript = (text, isFinal) => {
      setLiveTranscript(text);
      if (isFinal && text.trim()) {
        addMessage('user', text, true);
        setLiveTranscript('');
      }
    };

    geminiLive.onResponse = (text) => {
      addMessage('nero', text);
    };

    geminiLive.onStateChange = (state) => {
      setLiveState(state);
    };

    geminiLive.onError = (error) => {
      console.error('Live error:', error);
      setLiveState('idle');
      setIsLiveMode(false);
    };

    return () => {
      geminiLive.disconnect();
    };
  }, []);

  const loadData = async () => {
    try {
      const [savedMessages, savedMemory, savedKey] = await Promise.all([
        AsyncStorage.getItem('@nero/messages'),
        AsyncStorage.getItem('@nero/memory'),
        AsyncStorage.getItem('@nero/geminiKey'),
      ]);

      if (savedMessages) setMessages(JSON.parse(savedMessages));
      if (savedKey) {
        const key = JSON.parse(savedKey);
        setGeminiKey(key);
        geminiLive.setApiKey(key);
      }

      if (savedMemory) {
        const parsed = JSON.parse(savedMemory);
        parsed.facts.lastSeen = new Date().toISOString();
        parsed.facts.totalConversations = (parsed.facts.totalConversations || 0) + 1;
        setMemory(parsed);
      } else {
        addMessage('nero', "Hey. I'm Nero. I'm here to help you actually do things, not just plan them. What's on your mind?");
      }
    } catch (error) {
      console.error('Load error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem('@nero/messages', JSON.stringify(messages.slice(-100))),
        AsyncStorage.setItem('@nero/memory', JSON.stringify(memory)),
        AsyncStorage.setItem('@nero/geminiKey', JSON.stringify(geminiKey)),
      ]);
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const addMessage = (role: 'user' | 'nero', content: string, isVoice: boolean = false) => {
    const msg: Message = {
      id: generateId(),
      role,
      content,
      timestamp: new Date().toISOString(),
      isVoice,
    };
    setMessages(prev => [...prev, msg]);

    // Extract memories from user messages
    if (role === 'user') {
      const newMems = extractMemories(content);
      if (newMems.length > 0) {
        setMemory(prev => {
          const updated = { ...prev };
          for (const mem of newMems) {
            if (mem.startsWith('NAME: ')) {
              updated.facts.name = mem.replace('NAME: ', '');
            } else if (mem.startsWith('COMMITMENT: ')) {
              const c = mem.replace('COMMITMENT: ', '');
              if (!updated.threads.commitments.includes(c)) {
                updated.threads.commitments = [...updated.threads.commitments.slice(-4), c];
              }
            }
          }
          return updated;
        });
      }
    }
  };

  const sendTextMessage = async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    addMessage('user', text);
    setInput('');
    setIsThinking(true);

    const response = await callNeroText([...messages, { id: '', role: 'user', content: text, timestamp: '' }], memory, geminiKey);
    addMessage('nero', response);
    setIsThinking(false);
  };

  const startLiveMode = async () => {
    if (!geminiKey) {
      alert('Add your Gemini API key in Settings to use live voice.');
      return;
    }

    setLiveState('connecting');
    geminiLive.setApiKey(geminiKey);
    
    const memoryContext = buildMemoryContext(memory);
    const connected = await geminiLive.connect(`${NERO_PERSONA}\n\n${memoryContext}`);
    
    if (connected) {
      setIsLiveMode(true);
      const started = await geminiLive.startListening();
      if (!started) {
        setLiveState('idle');
        setIsLiveMode(false);
      }
    } else {
      setLiveState('idle');
      alert('Could not connect. Check your API key.');
    }
  };

  const stopLiveMode = () => {
    geminiLive.disconnect();
    setIsLiveMode(false);
    setLiveState('idle');
    setLiveTranscript('');
  };

  const toggleListening = () => {
    if (liveState === 'listening') {
      geminiLive.stopListening();
    } else if (liveState === 'idle' || liveState === 'speaking') {
      geminiLive.startListening();
    }
  };

  // ============ RENDER ============

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  // Settings
  if (showSettings) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.settingsHeader}>
          <TouchableOpacity onPress={() => setShowSettings(false)}>
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.settingsTitle}>Settings</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView style={styles.settingsContent}>
          <View style={styles.settingsSection}>
            <Text style={styles.settingsLabel}>Gemini API Key</Text>
            <Text style={styles.settingsHint}>Required for live voice and smart responses</Text>
            <TextInput
              style={styles.settingsInput}
              value={geminiKey}
              onChangeText={(t) => {
                setGeminiKey(t);
                geminiLive.setApiKey(t);
              }}
              placeholder="AIza..."
              placeholderTextColor={COLORS.textDim}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.settingsSection}>
            <Text style={styles.settingsLabel}>What Nero Knows</Text>
            {memory.facts.name && <Text style={styles.memoryItem}>• Name: {memory.facts.name}</Text>}
            <Text style={styles.memoryItem}>• Conversations: {memory.facts.totalConversations}</Text>
            {memory.threads.commitments.map((c, i) => (
              <Text key={i} style={styles.memoryItem}>• Wants to: {c}</Text>
            ))}
          </View>

          <View style={styles.settingsSection}>
            <TouchableOpacity style={styles.dangerButton} onPress={async () => {
              await AsyncStorage.clear();
              setMessages([]);
              setMemory({
                facts: { firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), totalConversations: 0 },
                threads: { commitments: [], openLoops: [] },
                patterns: { knownStruggles: [], whatHelps: [] },
                remembered: [],
              });
              setShowSettings(false);
              addMessage('nero', "Hey. I'm Nero. Fresh start. What's on your mind?");
            }}>
              <Text style={styles.dangerButtonText}>Reset Everything</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Live Voice Mode
  if (isLiveMode) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.liveContainer}>
          {/* Status */}
          <Text style={styles.liveStatus}>
            {liveState === 'connecting' && 'Connecting...'}
            {liveState === 'listening' && 'Listening...'}
            {liveState === 'thinking' && 'Thinking...'}
            {liveState === 'speaking' && 'Speaking...'}
            {liveState === 'idle' && 'Tap to talk'}
          </Text>

          {/* Transcript */}
          {liveTranscript && (
            <Text style={styles.liveTranscript}>{liveTranscript}</Text>
          )}

          {/* Main Button */}
          <TouchableOpacity onPress={toggleListening} disabled={liveState === 'connecting' || liveState === 'thinking'}>
            <Animated.View style={[
              styles.liveButton,
              liveState === 'listening' && styles.liveButtonActive,
              liveState === 'speaking' && styles.liveButtonSpeaking,
              { transform: [{ scale: pulseAnim }] }
            ]}>
              <Text style={styles.liveButtonIcon}>
                {liveState === 'listening' ? '🎤' : liveState === 'speaking' ? '🔊' : '🎤'}
              </Text>
            </Animated.View>
          </TouchableOpacity>

          {/* Recent messages */}
          <ScrollView style={styles.liveMessages}>
            {messages.slice(-6).map(msg => (
              <View key={msg.id} style={[styles.liveMsgBubble, msg.role === 'user' && styles.liveMsgUser]}>
                <Text style={styles.liveMsgText}>{msg.content}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Exit */}
          <TouchableOpacity style={styles.exitButton} onPress={stopLiveMode}>
            <Text style={styles.exitButtonText}>Exit Voice Mode</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Main Chat
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nero</Text>
          <View style={styles.headerRight}>
            <TouchableOpacity onPress={startLiveMode} style={styles.liveIcon}>
              <Text style={styles.liveIconText}>🎙️</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsIcon}>
              <Text style={styles.settingsIconText}>⚙</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Messages */}
        <ScrollView ref={scrollRef} style={styles.messagesContainer} contentContainerStyle={styles.messagesContent}>
          {messages.map((msg) => (
            <View key={msg.id} style={[styles.messageBubble, msg.role === 'user' ? styles.userBubble : styles.neroBubble]}>
              <Text style={styles.messageText}>{msg.content}</Text>
              {msg.isVoice && <Text style={styles.voiceIndicator}>🎤</Text>}
            </View>
          ))}
          {isThinking && (
            <View style={[styles.messageBubble, styles.neroBubble]}>
              <Text style={styles.thinkingText}>...</Text>
            </View>
          )}
        </ScrollView>

        {/* Input */}
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.voiceButton} onPress={startLiveMode}>
            <Text style={styles.voiceButtonText}>🎙️</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Talk to Nero..."
            placeholderTextColor={COLORS.textDim}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isThinking) && styles.sendButtonDisabled]}
            onPress={sendTextMessage}
            disabled={!input.trim() || isThinking}
          >
            <Text style={styles.sendButtonText}>↑</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ============ STYLES ============
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  keyboardView: { flex: 1 },
  
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  headerRight: { flexDirection: 'row', gap: 8 },
  liveIcon: { padding: 8, backgroundColor: COLORS.live + '20', borderRadius: 20 },
  liveIconText: { fontSize: 18 },
  settingsIcon: { padding: 8 },
  settingsIconText: { fontSize: 20, color: COLORS.textMuted },

  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 20 },
  messageBubble: { maxWidth: '85%', padding: 14, borderRadius: 20, marginBottom: 12, position: 'relative' },
  neroBubble: { backgroundColor: COLORS.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  userBubble: { backgroundColor: COLORS.primary, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  messageText: { fontSize: 16, lineHeight: 22, color: COLORS.text },
  thinkingText: { color: COLORS.textMuted, fontSize: 18 },
  voiceIndicator: { position: 'absolute', top: -8, right: -8, fontSize: 12 },

  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 8 },
  voiceButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.live + '30', justifyContent: 'center', alignItems: 'center' },
  voiceButtonText: { fontSize: 20 },
  textInput: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12, color: COLORS.text, fontSize: 16, maxHeight: 120, minHeight: 48 },
  sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: COLORS.surfaceLight },
  sendButtonText: { color: COLORS.text, fontSize: 22, fontWeight: '600' },

  // Live Mode
  liveContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  liveStatus: { fontSize: 18, color: COLORS.textMuted, marginBottom: 20 },
  liveTranscript: { fontSize: 16, color: COLORS.text, textAlign: 'center', marginBottom: 30, paddingHorizontal: 20 },
  liveButton: { width: 120, height: 120, borderRadius: 60, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', marginBottom: 30 },
  liveButtonActive: { backgroundColor: COLORS.listening },
  liveButtonSpeaking: { backgroundColor: COLORS.speaking },
  liveButtonIcon: { fontSize: 40 },
  liveMessages: { flex: 1, width: '100%', marginTop: 20 },
  liveMsgBubble: { backgroundColor: COLORS.surface, padding: 12, borderRadius: 16, marginBottom: 8, alignSelf: 'flex-start', maxWidth: '80%' },
  liveMsgUser: { alignSelf: 'flex-end', backgroundColor: COLORS.primary + '60' },
  liveMsgText: { color: COLORS.text, fontSize: 14 },
  exitButton: { paddingVertical: 16, paddingHorizontal: 32 },
  exitButtonText: { color: COLORS.textMuted, fontSize: 16 },

  // Settings
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { color: COLORS.primary, fontSize: 16 },
  settingsTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  settingsContent: { flex: 1, padding: 20 },
  settingsSection: { marginBottom: 32 },
  settingsLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  settingsHint: { fontSize: 14, color: COLORS.textDim, marginBottom: 12 },
  settingsInput: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, color: COLORS.text, fontSize: 16 },
  memoryItem: { color: COLORS.textMuted, fontSize: 14, marginBottom: 6 },
  dangerButton: { backgroundColor: 'rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 16, alignItems: 'center' },
  dangerButtonText: { color: '#ef4444', fontSize: 16 },
});
