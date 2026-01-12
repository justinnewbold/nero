import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Switch,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============ SUPABASE CONFIG ============
const SUPABASE_URL = 'https://wektbfkzbxvtxsremnnk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indla3RiZmt6Ynh2dHhzcmVtbm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NDcyNjMsImV4cCI6MjA4MTQyMzI2M30.-oLnJRoDBpqgzDZ7bM3fm6TXBNGH6SaRpnKDiHQZ3_4';

let supabase: SupabaseClient;
try {
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} catch (e) {
  console.error('Supabase init error:', e);
}

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

interface VoiceOption {
  id: string;
  name: string;
  description: string;
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
  sync: '#3b82f6',
};

const VOICE_OPTIONS: VoiceOption[] = [
  { id: 'Aoede', name: 'Aoede', description: 'Warm & friendly' },
  { id: 'Charon', name: 'Charon', description: 'Calm & steady' },
  { id: 'Fenrir', name: 'Fenrir', description: 'Direct & energetic' },
  { id: 'Kore', name: 'Kore', description: 'Gentle & supportive' },
  { id: 'Puck', name: 'Puck', description: 'Playful & light' },
];

const CHECKIN_MESSAGES = [
  "Hey, just checking in. How's it going?",
  "Thinking of you. What are you working on?",
  "Quick check - how are you feeling right now?",
  "You've been quiet. Everything okay?",
  "Just popping in. Need any help getting started on something?",
  "Hey. What's one small thing we could tackle together?",
];

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
- Shorter is better. This is a real conversation.`;

// ============ HELPERS ============
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const getDeviceId = async (): Promise<string> => {
  let deviceId = await AsyncStorage.getItem('@nero/deviceId');
  if (!deviceId) {
    deviceId = 'device_' + generateId();
    await AsyncStorage.setItem('@nero/deviceId', deviceId);
  }
  return deviceId;
};

const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
};

// ============ SUPABASE SERVICE ============
class SyncService {
  private userId: string | null = null;
  private deviceId: string | null = null;
  private syncEnabled: boolean = true;

  async initialize(): Promise<string | null> {
    try {
      this.deviceId = await getDeviceId();
      
      // Get or create user
      const { data: existing } = await supabase
        .from('nero_users')
        .select('id')
        .eq('device_id', this.deviceId)
        .single();

      if (existing) {
        this.userId = existing.id;
        await supabase
          .from('nero_users')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', this.userId);
      } else {
        const { data: newUser } = await supabase
          .from('nero_users')
          .insert({ device_id: this.deviceId })
          .select('id')
          .single();
        
        if (newUser) {
          this.userId = newUser.id;
        }
      }

      return this.userId;
    } catch (error) {
      console.error('Sync init error:', error);
      return null;
    }
  }

  async syncMemory(memory: UserMemory): Promise<void> {
    if (!this.userId || !this.syncEnabled) return;

    try {
      await supabase
        .from('nero_memory')
        .upsert({
          user_id: this.userId,
          name: memory.facts.name,
          total_conversations: memory.facts.totalConversations,
          commitments: memory.threads.commitments,
          struggles: memory.patterns.knownStruggles,
          remembered: memory.remembered,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
    } catch (error) {
      console.error('Memory sync error:', error);
    }
  }

  async loadMemory(): Promise<UserMemory | null> {
    if (!this.userId) return null;

    try {
      const { data } = await supabase
        .from('nero_memory')
        .select('*')
        .eq('user_id', this.userId)
        .single();

      if (data) {
        return {
          facts: {
            name: data.name,
            firstSeen: data.created_at || new Date().toISOString(),
            lastSeen: new Date().toISOString(),
            totalConversations: data.total_conversations || 0,
          },
          threads: {
            commitments: data.commitments || [],
            openLoops: [],
          },
          patterns: {
            knownStruggles: data.struggles || [],
            whatHelps: [],
          },
          remembered: data.remembered || [],
        };
      }
    } catch (error) {
      console.error('Load memory error:', error);
    }
    return null;
  }

  async syncMessage(message: Message): Promise<void> {
    if (!this.userId || !this.syncEnabled) return;

    try {
      await supabase
        .from('nero_messages')
        .insert({
          user_id: this.userId,
          role: message.role,
          content: message.content,
          is_voice: message.isVoice || false,
          created_at: message.timestamp,
        });
    } catch (error) {
      console.error('Message sync error:', error);
    }
  }

  async loadMessages(limit: number = 50): Promise<Message[]> {
    if (!this.userId) return [];

    try {
      const { data } = await supabase
        .from('nero_messages')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: true })
        .limit(limit);

      if (data) {
        return data.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          timestamp: m.created_at,
          isVoice: m.is_voice,
        }));
      }
    } catch (error) {
      console.error('Load messages error:', error);
    }
    return [];
  }

  async scheduleCheckin(hoursFromNow: number): Promise<void> {
    if (!this.userId) return;

    const scheduledFor = new Date();
    scheduledFor.setHours(scheduledFor.getHours() + hoursFromNow);

    try {
      await supabase
        .from('nero_checkins')
        .insert({
          user_id: this.userId,
          scheduled_for: scheduledFor.toISOString(),
          message: CHECKIN_MESSAGES[Math.floor(Math.random() * CHECKIN_MESSAGES.length)],
        });
    } catch (error) {
      console.error('Schedule checkin error:', error);
    }
  }

  async getPendingCheckin(): Promise<{ id: string; message: string } | null> {
    if (!this.userId) return null;

    try {
      const { data } = await supabase
        .from('nero_checkins')
        .select('id, message')
        .eq('user_id', this.userId)
        .is('sent_at', null)
        .lte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true })
        .limit(1)
        .single();

      if (data) {
        // Mark as sent
        await supabase
          .from('nero_checkins')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', data.id);
        
        return data;
      }
    } catch (error) {
      // No pending checkins is fine
    }
    return null;
  }

  setSyncEnabled(enabled: boolean) {
    this.syncEnabled = enabled;
  }
}

const syncService = new SyncService();

// ============ GEMINI LIVE SERVICE ============
class GeminiLiveService {
  private ws: WebSocket | null = null;
  private apiKey: string = '';
  private voiceName: string = 'Aoede';
  private audioContext: AudioContext | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private audioQueue: ArrayBuffer[] = [];
  private isPlaying: boolean = false;
  
  public isConnected: boolean = false;
  public onTranscript: ((text: string, isFinal: boolean) => void) | null = null;
  public onResponse: ((text: string) => void) | null = null;
  public onStateChange: ((state: 'idle' | 'listening' | 'thinking' | 'speaking') => void) | null = null;
  public onError: ((error: string) => void) | null = null;

  setApiKey(key: string) { this.apiKey = key; }
  setVoice(voice: string) { this.voiceName = voice; }

  async connect(systemPrompt: string): Promise<boolean> {
    if (!this.apiKey) {
      this.onError?.('No Gemini API key set');
      return false;
    }

    return new Promise((resolve) => {
      try {
        const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${this.apiKey}`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
          this.isConnected = true;
          
          const setupMessage = {
            setup: {
              model: 'models/gemini-2.5-flash-preview-native-audio-dialog',
              generationConfig: {
                responseModalities: ['AUDIO', 'TEXT'],
                speechConfig: {
                  voiceConfig: {
                    prebuiltVoiceConfig: {
                      voiceName: this.voiceName
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
            
            if (data.serverContent) {
              const content = data.serverContent;
              
              if (content.modelTurn?.parts) {
                for (const part of content.modelTurn.parts) {
                  if (part.text) {
                    this.onResponse?.(part.text);
                  }
                  if (part.inlineData?.mimeType?.startsWith('audio/')) {
                    const audioData = this.base64ToArrayBuffer(part.inlineData.data);
                    this.audioQueue.push(audioData);
                    this.playNextAudio();
                  }
                }
              }
              
              if (content.turnComplete) {
                this.onStateChange?.('idle');
              }
            }
            
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
            console.error('Parse error:', e);
          }
        };

        this.ws.onerror = () => {
          this.isConnected = false;
          this.onError?.('Connection error');
          resolve(false);
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.onStateChange?.('idle');
        };

      } catch (error) {
        this.onError?.('Failed to connect');
        resolve(false);
      }
    });
  }

  async startListening(): Promise<boolean> {
    if (!this.isConnected || !this.ws) return false;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });

      this.mediaRecorder.ondataavailable = async (event) => {
        if (event.data.size > 0 && this.ws?.readyState === WebSocket.OPEN) {
          const arrayBuffer = await event.data.arrayBuffer();
          const base64 = this.arrayBufferToBase64(arrayBuffer);
          
          this.ws.send(JSON.stringify({
            realtimeInput: {
              mediaChunks: [{
                mimeType: 'audio/webm;codecs=opus',
                data: base64
              }]
            }
          }));
        }
      };

      this.mediaRecorder.start(100);
      this.onStateChange?.('listening');
      return true;
    } catch (error) {
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
    
    this.ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text }] }],
        turnComplete: true
      }
    }));
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

const geminiLive = new GeminiLiveService();

// ============ TEXT API ============
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
          generationConfig: { maxOutputTokens: 300, temperature: 0.8 }
        })
      }
    );

    if (!response.ok) throw new Error('API error');

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm here. What's going on?";
  } catch (error) {
    return getFallbackResponse(messages, memory);
  }
};

const buildMemoryContext = (memory: UserMemory): string => {
  const parts: string[] = ['ABOUT THIS PERSON:'];
  if (memory.facts.name) parts.push(`- Name: ${memory.facts.name}`);
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
  const [settingsTab, setSettingsTab] = useState<'general' | 'voice' | 'sync'>('general');

  // Settings
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [checkinsEnabled, setCheckinsEnabled] = useState(true);
  const [checkinInterval, setCheckinInterval] = useState(4); // hours
  const [selectedVoice, setSelectedVoice] = useState('Aoede');
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('offline');

  // Live voice state
  const [liveState, setLiveState] = useState<'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [liveTranscript, setLiveTranscript] = useState('');
  const [isLiveMode, setIsLiveMode] = useState(false);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Pulse animation
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

  // Initialize
  useEffect(() => {
    initializeApp();
  }, []);

  // Check for proactive check-ins
  useEffect(() => {
    if (!checkinsEnabled) return;
    
    const checkForCheckins = async () => {
      const checkin = await syncService.getPendingCheckin();
      if (checkin) {
        addMessage('nero', checkin.message);
      }
    };

    const interval = setInterval(checkForCheckins, 60000); // Check every minute
    checkForCheckins();
    
    return () => clearInterval(interval);
  }, [checkinsEnabled]);

  // Save data when it changes
  useEffect(() => {
    if (!isLoading) {
      saveData();
      if (syncEnabled) {
        syncService.syncMemory(memory);
        setSyncStatus('synced');
      }
    }
  }, [messages, memory, geminiKey, syncEnabled, checkinsEnabled, checkinInterval, selectedVoice]);

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

  const initializeApp = async () => {
    try {
      // Load local settings first
      const [savedKey, savedSync, savedCheckins, savedInterval, savedVoice] = await Promise.all([
        AsyncStorage.getItem('@nero/geminiKey'),
        AsyncStorage.getItem('@nero/syncEnabled'),
        AsyncStorage.getItem('@nero/checkinsEnabled'),
        AsyncStorage.getItem('@nero/checkinInterval'),
        AsyncStorage.getItem('@nero/selectedVoice'),
      ]);

      if (savedKey) {
        const key = JSON.parse(savedKey);
        setGeminiKey(key);
        geminiLive.setApiKey(key);
      }
      if (savedSync !== null) setSyncEnabled(JSON.parse(savedSync));
      if (savedCheckins !== null) setCheckinsEnabled(JSON.parse(savedCheckins));
      if (savedInterval) setCheckinInterval(JSON.parse(savedInterval));
      if (savedVoice) {
        const voice = JSON.parse(savedVoice);
        setSelectedVoice(voice);
        geminiLive.setVoice(voice);
      }

      // Initialize sync
      setSyncStatus('syncing');
      const userId = await syncService.initialize();
      
      if (userId) {
        // Try to load from cloud first
        const cloudMemory = await syncService.loadMemory();
        const cloudMessages = await syncService.loadMessages();
        
        if (cloudMemory && cloudMessages.length > 0) {
          setMemory(cloudMemory);
          setMessages(cloudMessages);
          setSyncStatus('synced');
        } else {
          // Fall back to local
          await loadLocalData();
          setSyncStatus('synced');
        }
      } else {
        await loadLocalData();
        setSyncStatus('offline');
      }

      // Schedule next check-in if enabled
      if (checkinsEnabled) {
        syncService.scheduleCheckin(checkinInterval);
      }
    } catch (error) {
      console.error('Init error:', error);
      await loadLocalData();
      setSyncStatus('offline');
    } finally {
      setIsLoading(false);
    }
  };

  const loadLocalData = async () => {
    const [savedMessages, savedMemory] = await Promise.all([
      AsyncStorage.getItem('@nero/messages'),
      AsyncStorage.getItem('@nero/memory'),
    ]);

    if (savedMessages) setMessages(JSON.parse(savedMessages));
    
    if (savedMemory) {
      const parsed = JSON.parse(savedMemory);
      parsed.facts.lastSeen = new Date().toISOString();
      parsed.facts.totalConversations = (parsed.facts.totalConversations || 0) + 1;
      setMemory(parsed);
    } else {
      addMessage('nero', "Hey. I'm Nero. I'm here to help you actually do things, not just plan them. What's on your mind?");
    }
  };

  const saveData = async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem('@nero/messages', JSON.stringify(messages.slice(-100))),
        AsyncStorage.setItem('@nero/memory', JSON.stringify(memory)),
        AsyncStorage.setItem('@nero/geminiKey', JSON.stringify(geminiKey)),
        AsyncStorage.setItem('@nero/syncEnabled', JSON.stringify(syncEnabled)),
        AsyncStorage.setItem('@nero/checkinsEnabled', JSON.stringify(checkinsEnabled)),
        AsyncStorage.setItem('@nero/checkinInterval', JSON.stringify(checkinInterval)),
        AsyncStorage.setItem('@nero/selectedVoice', JSON.stringify(selectedVoice)),
      ]);
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const addMessage = useCallback((role: 'user' | 'nero', content: string, isVoice: boolean = false) => {
    const msg: Message = {
      id: generateId(),
      role,
      content,
      timestamp: new Date().toISOString(),
      isVoice,
    };
    
    setMessages(prev => [...prev, msg]);
    
    // Sync to cloud
    if (syncEnabled) {
      syncService.syncMessage(msg);
    }

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
      
      // Reschedule check-in since user is active
      if (checkinsEnabled) {
        syncService.scheduleCheckin(checkinInterval);
      }
    }
  }, [syncEnabled, checkinsEnabled, checkinInterval]);

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
    geminiLive.setVoice(selectedVoice);
    
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
        <Text style={styles.loadingText}>Loading...</Text>
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

        {/* Tabs */}
        <View style={styles.tabBar}>
          {(['general', 'voice', 'sync'] as const).map(tab => (
            <TouchableOpacity 
              key={tab} 
              style={[styles.tab, settingsTab === tab && styles.tabActive]}
              onPress={() => setSettingsTab(tab)}
            >
              <Text style={[styles.tabText, settingsTab === tab && styles.tabTextActive]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <ScrollView style={styles.settingsContent}>
          {/* General Tab */}
          {settingsTab === 'general' && (
            <>
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Gemini API Key</Text>
                <Text style={styles.settingsHint}>Required for AI responses</Text>
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
            </>
          )}

          {/* Voice Tab */}
          {settingsTab === 'voice' && (
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Nero's Voice</Text>
              <Text style={styles.settingsHint}>Choose how Nero sounds in live mode</Text>
              
              {VOICE_OPTIONS.map(voice => (
                <TouchableOpacity
                  key={voice.id}
                  style={[styles.voiceOption, selectedVoice === voice.id && styles.voiceOptionSelected]}
                  onPress={() => {
                    setSelectedVoice(voice.id);
                    geminiLive.setVoice(voice.id);
                  }}
                >
                  <View>
                    <Text style={styles.voiceOptionName}>{voice.name}</Text>
                    <Text style={styles.voiceOptionDesc}>{voice.description}</Text>
                  </View>
                  {selectedVoice === voice.id && (
                    <Text style={styles.checkmark}>✓</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Sync Tab */}
          {settingsTab === 'sync' && (
            <>
              <View style={styles.settingsSection}>
                <View style={styles.syncStatus}>
                  <View style={[styles.syncDot, { backgroundColor: syncStatus === 'synced' ? COLORS.speaking : syncStatus === 'syncing' ? COLORS.live : COLORS.textDim }]} />
                  <Text style={styles.syncStatusText}>
                    {syncStatus === 'synced' ? 'Synced to cloud' : syncStatus === 'syncing' ? 'Syncing...' : 'Offline'}
                  </Text>
                </View>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Cloud Sync</Text>
                <View style={styles.settingRow}>
                  <View>
                    <Text style={styles.settingRowText}>Sync across devices</Text>
                    <Text style={styles.settingRowHint}>Memory and conversations sync to cloud</Text>
                  </View>
                  <Switch
                    value={syncEnabled}
                    onValueChange={(v) => {
                      setSyncEnabled(v);
                      syncService.setSyncEnabled(v);
                    }}
                    trackColor={{ false: COLORS.surface, true: COLORS.primary }}
                  />
                </View>
              </View>

              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Proactive Check-ins</Text>
                <View style={styles.settingRow}>
                  <View>
                    <Text style={styles.settingRowText}>Nero checks on you</Text>
                    <Text style={styles.settingRowHint}>Get a message if you've been quiet</Text>
                  </View>
                  <Switch
                    value={checkinsEnabled}
                    onValueChange={setCheckinsEnabled}
                    trackColor={{ false: COLORS.surface, true: COLORS.primary }}
                  />
                </View>
                
                {checkinsEnabled && (
                  <View style={styles.intervalPicker}>
                    <Text style={styles.intervalLabel}>Check in every:</Text>
                    <View style={styles.intervalOptions}>
                      {[2, 4, 8, 12].map(hours => (
                        <TouchableOpacity
                          key={hours}
                          style={[styles.intervalOption, checkinInterval === hours && styles.intervalOptionSelected]}
                          onPress={() => setCheckinInterval(hours)}
                        >
                          <Text style={[styles.intervalOptionText, checkinInterval === hours && styles.intervalOptionTextSelected]}>
                            {hours}h
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </View>
            </>
          )}
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
          <Text style={styles.liveStatus}>
            {liveState === 'connecting' && 'Connecting...'}
            {liveState === 'listening' && 'Listening...'}
            {liveState === 'thinking' && 'Thinking...'}
            {liveState === 'speaking' && 'Speaking...'}
            {liveState === 'idle' && 'Tap to talk'}
          </Text>

          {liveTranscript && (
            <Text style={styles.liveTranscript}>{liveTranscript}</Text>
          )}

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

          <ScrollView style={styles.liveMessages}>
            {messages.slice(-6).map(msg => (
              <View key={msg.id} style={[styles.liveMsgBubble, msg.role === 'user' && styles.liveMsgUser]}>
                <Text style={styles.liveMsgText}>{msg.content}</Text>
              </View>
            ))}
          </ScrollView>

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
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Nero</Text>
            <View style={[styles.syncIndicator, { backgroundColor: syncStatus === 'synced' ? COLORS.speaking : syncStatus === 'syncing' ? COLORS.live : COLORS.textDim }]} />
          </View>
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
  loadingText: { color: COLORS.textMuted, marginTop: 12 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  syncIndicator: { width: 8, height: 8, borderRadius: 4 },
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
  tabBar: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: COLORS.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabActive: { borderBottomWidth: 2, borderBottomColor: COLORS.primary },
  tabText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: COLORS.primary },
  settingsContent: { flex: 1, padding: 20 },
  settingsSection: { marginBottom: 28 },
  settingsLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 },
  settingsHint: { fontSize: 13, color: COLORS.textDim, marginBottom: 12 },
  settingsInput: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, color: COLORS.text, fontSize: 16 },
  memoryItem: { color: COLORS.textMuted, fontSize: 14, marginBottom: 6 },
  dangerButton: { backgroundColor: 'rgba(239, 68, 68, 0.2)', borderRadius: 12, padding: 16, alignItems: 'center' },
  dangerButtonText: { color: '#ef4444', fontSize: 16 },

  // Voice options
  voiceOption: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, marginBottom: 8 },
  voiceOptionSelected: { borderWidth: 2, borderColor: COLORS.primary },
  voiceOptionName: { color: COLORS.text, fontSize: 16, fontWeight: '500' },
  voiceOptionDesc: { color: COLORS.textDim, fontSize: 13, marginTop: 2 },
  checkmark: { color: COLORS.primary, fontSize: 18, fontWeight: '600' },

  // Sync settings
  syncStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  syncDot: { width: 10, height: 10, borderRadius: 5 },
  syncStatusText: { color: COLORS.textMuted, fontSize: 14 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, marginBottom: 8 },
  settingRowText: { color: COLORS.text, fontSize: 16 },
  settingRowHint: { color: COLORS.textDim, fontSize: 13, marginTop: 2 },
  intervalPicker: { marginTop: 16 },
  intervalLabel: { color: COLORS.textMuted, fontSize: 14, marginBottom: 12 },
  intervalOptions: { flexDirection: 'row', gap: 8 },
  intervalOption: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 8, padding: 12, alignItems: 'center' },
  intervalOptionSelected: { backgroundColor: COLORS.primary },
  intervalOptionText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '500' },
  intervalOptionTextSelected: { color: COLORS.text },
});
