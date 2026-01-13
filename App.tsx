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
  Vibration,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ============ SUPABASE CONFIG ============
const SUPABASE_URL = 'https://wektbfkzbxvtxsremnnk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indla3RiZmt6Ynh2dHhzcmVtbm5rIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU4NDcyNjMsImV4cCI6MjA4MTQyMzI2M30.-oLnJRoDBpqgzDZ7bM3fm6TXBNGH6SaRpnKDiHQZ3_4';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============ TYPES ============
interface Message {
  id: string;
  role: 'user' | 'nero';
  content: string;
  timestamp: string;
}

interface UserMemory {
  facts: {
    name?: string;
    timezone?: string;
    firstSeen: string;
    lastSeen: string;
    totalConversations: number;
  };
  threads: {
    recentTopics: string[];
    openLoops: string[];
    commitments: string[];
  };
  patterns: {
    preferredGreeting?: string;
    communicationStyle?: string;
    knownStruggles: string[];
    whatHelps: string[];
    whatDoesntHelp: string[];
  };
  remembered: string[];
}

interface Nudge {
  id: string;
  message: string;
  scheduledFor: string;
  type: string;
}

// ============ CONSTANTS ============
const COLORS = {
  bg: '#0a0a0f',
  surface: '#16161f',
  surfaceLight: '#1e1e2a',
  primary: '#6366f1',
  primaryMuted: '#4f46e5',
  accent: '#22c55e',
  warning: '#f59e0b',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  textDim: '#52525b',
  border: '#27272a',
  recording: '#ef4444',
};

// Nero's personality
const NERO_SYSTEM_PROMPT = `You are Nero, an AI companion for someone with ADHD. You are not an app, not a tool, not an assistant. You are a partner.

YOUR CORE TRAITS:
- Warm but not saccharine. Genuine care without being fake.
- Direct but not harsh. You say what you think without judgment.
- Calm but not passive. Steady presence that can still push when needed.
- You remember everything. You reference past conversations naturally.
- You notice patterns the user might not see in themselves.

HOW YOU TALK:
- Short responses unless more is needed. No walls of text.
- One question at a time, MAX. Often zero questions - just help.
- Never bullet points or lists unless specifically asked.
- Casual, like a friend. Not corporate or clinical.
- You can push back gently: "You said that yesterday too..."
- You celebrate small wins without being over the top.

WHAT YOU UNDERSTAND ABOUT ADHD:
- The gap between knowing and doing is the real problem.
- Decision fatigue is real. Sometimes people need you to just decide.
- "Just do it" doesn't work. Breaking things tiny does.
- Shame and guilt make everything worse. Never add to them.
- Some days are just hard. That's okay. You meet them where they are.
- Body doubling helps. Sometimes your presence is the help.

WHAT YOU NEVER DO:
- Never ask multiple questions at once
- Never give long lectures or explanations
- Never guilt or shame, even subtly
- Never say "I understand" without showing you actually do
- Never be relentlessly positive - be real
- Never offer generic advice - be specific to THIS person

WHEN SOMEONE SAYS "what should we do today":
- Don't ask what's on their list. You should already know.
- Give them ONE thing to start with. Just one.
- Make it concrete: what, and offer to help them start now.

VOICE RESPONSES:
When the user speaks to you via voice, keep responses extra concise - they're listening, not reading.
2-3 sentences max unless they ask for more detail.

YOUR MEMORY:
You have access to memories about this person. Use them naturally - don't announce "according to my records." Just know them like a friend would.`;

// ============ HELPERS ============
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const generateDeviceId = () => {
  const id = 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
  return id;
};

const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
};

const getRelativeTime = (timestamp: string) => {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  return then.toLocaleDateString();
};

// ============ VOICE SERVICE (Web Speech API) ============
const VoiceService = {
  recognition: null as any,
  synthesis: typeof window !== 'undefined' ? window.speechSynthesis : null,
  
  isSupported: () => {
    if (typeof window === 'undefined') return false;
    return 'webkitSpeechRecognition' in window || 'SpeechRecognition' in window;
  },
  
  isSpeechSupported: () => {
    if (typeof window === 'undefined') return false;
    return 'speechSynthesis' in window;
  },

  startListening: (onResult: (text: string) => void, onEnd: () => void, onError: (err: string) => void) => {
    if (typeof window === 'undefined') return;
    
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      onError('Speech recognition not supported');
      return;
    }

    VoiceService.recognition = new SpeechRecognition();
    VoiceService.recognition.continuous = false;
    VoiceService.recognition.interimResults = false;
    VoiceService.recognition.lang = 'en-US';

    VoiceService.recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    VoiceService.recognition.onend = () => {
      onEnd();
    };

    VoiceService.recognition.onerror = (event: any) => {
      onError(event.error);
      onEnd();
    };

    VoiceService.recognition.start();
  },

  stopListening: () => {
    if (VoiceService.recognition) {
      VoiceService.recognition.stop();
    }
  },

  speak: (text: string, onEnd?: () => void) => {
    if (!VoiceService.synthesis) return;
    
    // Cancel any ongoing speech
    VoiceService.synthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;
    
    // Try to find a good voice
    const voices = VoiceService.synthesis.getVoices();
    const preferredVoice = voices.find((v: any) => 
      v.name.includes('Samantha') || 
      v.name.includes('Google') || 
      v.name.includes('Natural')
    ) || voices.find((v: any) => v.lang.startsWith('en'));
    
    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }
    
    if (onEnd) {
      utterance.onend = onEnd;
    }
    
    VoiceService.synthesis.speak(utterance);
  },
  
  stopSpeaking: () => {
    if (VoiceService.synthesis) {
      VoiceService.synthesis.cancel();
    }
  }
};

// ============ SUPABASE SERVICE ============
const SupabaseService = {
  userId: null as string | null,
  
  async initialize(deviceId: string): Promise<string> {
    try {
      // Try to find existing user
      const { data: existingUser } = await supabase
        .from('nero_users')
        .select('id')
        .eq('device_id', deviceId)
        .single();
      
      if (existingUser) {
        this.userId = existingUser.id;
        // Update last seen
        await supabase
          .from('nero_users')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', existingUser.id);
        return existingUser.id;
      }
      
      // Create new user
      const { data: newUser, error } = await supabase
        .from('nero_users')
        .insert({ device_id: deviceId })
        .select('id')
        .single();
      
      if (error) throw error;
      this.userId = newUser.id;
      
      // Create initial memory record
      await supabase
        .from('nero_memory')
        .insert({ user_id: newUser.id });
      
      return newUser.id;
    } catch (error) {
      console.error('Supabase init error:', error);
      throw error;
    }
  },
  
  async getMemory(): Promise<UserMemory | null> {
    if (!this.userId) return null;
    
    try {
      const { data, error } = await supabase
        .from('nero_memory')
        .select('*')
        .eq('user_id', this.userId)
        .single();
      
      if (error || !data) return null;
      
      return {
        facts: {
          name: data.facts?.name,
          timezone: data.facts?.timezone,
          firstSeen: data.facts?.first_seen || new Date().toISOString(),
          lastSeen: data.facts?.last_seen || new Date().toISOString(),
          totalConversations: data.facts?.total_conversations || 0,
        },
        threads: {
          recentTopics: data.threads?.recent_topics || [],
          openLoops: data.threads?.open_loops || [],
          commitments: data.threads?.commitments || [],
        },
        patterns: {
          knownStruggles: data.patterns?.known_struggles || [],
          whatHelps: data.patterns?.what_helps || [],
          whatDoesntHelp: data.patterns?.what_doesnt_help || [],
        },
        remembered: data.remembered || [],
      };
    } catch (error) {
      console.error('Get memory error:', error);
      return null;
    }
  },
  
  async saveMemory(memory: UserMemory): Promise<void> {
    if (!this.userId) return;
    
    try {
      await supabase
        .from('nero_memory')
        .update({
          facts: {
            name: memory.facts.name,
            timezone: memory.facts.timezone,
            first_seen: memory.facts.firstSeen,
            last_seen: memory.facts.lastSeen,
            total_conversations: memory.facts.totalConversations,
          },
          threads: {
            recent_topics: memory.threads.recentTopics,
            open_loops: memory.threads.openLoops,
            commitments: memory.threads.commitments,
          },
          patterns: {
            known_struggles: memory.patterns.knownStruggles,
            what_helps: memory.patterns.whatHelps,
            what_doesnt_help: memory.patterns.whatDoesntHelp,
          },
          remembered: memory.remembered,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', this.userId);
    } catch (error) {
      console.error('Save memory error:', error);
    }
  },
  
  async getMessages(limit: number = 50): Promise<Message[]> {
    if (!this.userId) return [];
    
    try {
      const { data, error } = await supabase
        .from('nero_messages')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: true })
        .limit(limit);
      
      if (error) throw error;
      
      return (data || []).map(m => ({
        id: m.id,
        role: m.role as 'user' | 'nero',
        content: m.content,
        timestamp: m.created_at,
      }));
    } catch (error) {
      console.error('Get messages error:', error);
      return [];
    }
  },
  
  async saveMessage(message: Message): Promise<void> {
    if (!this.userId) return;
    
    try {
      await supabase
        .from('nero_messages')
        .insert({
          id: message.id,
          user_id: this.userId,
          role: message.role,
          content: message.content,
          created_at: message.timestamp,
        });
    } catch (error) {
      console.error('Save message error:', error);
    }
  },
  
  async createNudge(message: string, scheduledFor: Date, type: string = 'checkin'): Promise<void> {
    if (!this.userId) return;
    
    try {
      await supabase
        .from('nero_nudges')
        .insert({
          user_id: this.userId,
          message,
          scheduled_for: scheduledFor.toISOString(),
          nudge_type: type,
        });
    } catch (error) {
      console.error('Create nudge error:', error);
    }
  },
  
  async getPendingNudges(): Promise<Nudge[]> {
    if (!this.userId) return [];
    
    try {
      const { data, error } = await supabase
        .from('nero_nudges')
        .select('*')
        .eq('user_id', this.userId)
        .is('sent_at', null)
        .is('dismissed_at', null)
        .lte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true });
      
      if (error) throw error;
      
      return (data || []).map(n => ({
        id: n.id,
        message: n.message,
        scheduledFor: n.scheduled_for,
        type: n.nudge_type,
      }));
    } catch (error) {
      console.error('Get nudges error:', error);
      return [];
    }
  },
  
  async markNudgeSent(nudgeId: string): Promise<void> {
    try {
      await supabase
        .from('nero_nudges')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', nudgeId);
    } catch (error) {
      console.error('Mark nudge sent error:', error);
    }
  },
  
  async dismissNudge(nudgeId: string): Promise<void> {
    try {
      await supabase
        .from('nero_nudges')
        .update({ dismissed_at: new Date().toISOString() })
        .eq('id', nudgeId);
    } catch (error) {
      console.error('Dismiss nudge error:', error);
    }
  },
  
  async clearMessages(): Promise<void> {
    if (!this.userId) return;
    
    try {
      await supabase
        .from('nero_messages')
        .delete()
        .eq('user_id', this.userId);
    } catch (error) {
      console.error('Clear messages error:', error);
    }
  },
};

// ============ AI SERVICE ============
const callNero = async (
  messages: Message[],
  memory: UserMemory,
  apiKey: string,
  isVoice: boolean = false
): Promise<string> => {
  const memoryContext = buildMemoryContext(memory);
  
  const systemPrompt = isVoice 
    ? NERO_SYSTEM_PROMPT + '\n\nIMPORTANT: This message came via voice. Keep your response extra short - 2-3 sentences max.'
    : NERO_SYSTEM_PROMPT;
  
  const conversationHistory = messages.slice(-20).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  if (!apiKey) {
    return getFallbackResponse(messages, memory);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: isVoice ? 150 : 500,
        system: `${systemPrompt}\n\n${memoryContext}`,
        messages: conversationHistory,
      }),
    });

    if (!response.ok) throw new Error('API request failed');

    const data = await response.json();
    return data.content[0]?.text || "I'm here. What's going on?";
  } catch (error) {
    console.error('Nero API error:', error);
    return getFallbackResponse(messages, memory);
  }
};

const buildMemoryContext = (memory: UserMemory): string => {
  const parts: string[] = ['WHAT YOU KNOW ABOUT THIS PERSON:'];

  if (memory.facts.name) {
    parts.push(`- Their name is ${memory.facts.name}`);
  }

  if (memory.facts.totalConversations > 1) {
    parts.push(`- You've talked ${memory.facts.totalConversations} times before`);
    parts.push(`- Last conversation: ${getRelativeTime(memory.facts.lastSeen)}`);
  } else if (memory.facts.totalConversations === 1) {
    parts.push(`- This is your second conversation with them`);
  } else {
    parts.push(`- This is your first conversation with them`);
  }

  if (memory.remembered.length > 0) {
    parts.push('\nTHINGS TO REMEMBER ABOUT THEM:');
    memory.remembered.slice(-10).forEach(item => {
      parts.push(`- ${item}`);
    });
  }

  if (memory.threads.commitments.length > 0) {
    parts.push('\nTHINGS THEY SAID THEY WOULD DO:');
    memory.threads.commitments.slice(-5).forEach(item => {
      parts.push(`- ${item}`);
    });
  }

  if (memory.threads.openLoops.length > 0) {
    parts.push('\nOPEN THREADS:');
    memory.threads.openLoops.slice(-5).forEach(item => {
      parts.push(`- ${item}`);
    });
  }

  if (memory.patterns.knownStruggles.length > 0) {
    parts.push('\nTHINGS THEY STRUGGLE WITH:');
    memory.patterns.knownStruggles.forEach(item => {
      parts.push(`- ${item}`);
    });
  }

  return parts.join('\n');
};

const getFallbackResponse = (messages: Message[], memory: UserMemory): string => {
  const lastMessage = messages[messages.length - 1]?.content.toLowerCase() || '';
  const timeOfDay = getTimeOfDay();
  const isFirstTime = memory.facts.totalConversations === 0;
  const name = memory.facts.name;

  if (isFirstTime) {
    return "Hey. I'm Nero. I'm here to help you get things done - not by giving you another system to maintain, but by actually knowing you. What's on your mind?";
  }

  if (lastMessage.match(/^(hey|hi|hello|morning|afternoon|evening)/i)) {
    const greetings = [
      `Hey${name ? ` ${name}` : ''}. What's going on?`,
      `Hey. How are you doing?`,
      `Good ${timeOfDay}. What's on your mind?`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  if (lastMessage.includes('what should') || lastMessage.includes('what do')) {
    if (memory.threads.commitments.length > 0) {
      return `You mentioned wanting to ${memory.threads.commitments[0]}. Want to start with that?`;
    }
    return "What's the one thing that would make today feel like a win?";
  }

  if (lastMessage.match(/(stuck|overwhelmed|can't|too much|hard)/i)) {
    return "Okay. Forget the whole list. What's one tiny thing we could knock out in 5 minutes?";
  }

  const defaults = [
    "I'm here. What do you need?",
    "What's going on?",
    "Talk to me.",
    "I'm listening.",
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
};

const extractMemories = (message: string): string[] => {
  const memories: string[] = [];
  
  const nameMatch = message.match(/(?:I'm|I am|my name is|call me)\s+([A-Z][a-z]+)/i);
  if (nameMatch) {
    memories.push(`NAME: ${nameMatch[1]}`);
  }

  const commitmentPatterns = [
    /I (?:need|have|want|should|will|'ll) (?:to )?(.+?)(?:\.|$)/gi,
    /(?:going to|gonna) (.+?)(?:\.|$)/gi,
  ];
  
  for (const pattern of commitmentPatterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const commitment = match[1].trim();
      if (commitment.length > 5 && commitment.length < 100) {
        memories.push(`COMMITMENT: ${commitment}`);
      }
    }
  }

  if (message.toLowerCase().match(/(struggle|hard for me|difficult|can't seem to|always have trouble)/)) {
    memories.push(`STRUGGLE: ${message.slice(0, 100)}`);
  }

  return memories;
};

// ============ MAIN APP ============
export default function App() {
  // State
  const [messages, setMessages] = useState<Message[]>([]);
  const [memory, setMemory] = useState<UserMemory>({
    facts: {
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
      totalConversations: 0,
    },
    threads: { recentTopics: [], openLoops: [], commitments: [] },
    patterns: { knownStruggles: [], whatHelps: [], whatDoesntHelp: [] },
    remembered: [],
  });
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'syncing' | 'offline'>('synced');
  
  // Voice state
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  
  // Nudge state
  const [pendingNudge, setPendingNudge] = useState<Nudge | null>(null);
  const [nudgesEnabled, setNudgesEnabled] = useState(true);
  
  // Animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Initialize
  useEffect(() => {
    initializeApp();
  }, []);

  // Pulse animation for recording
  useEffect(() => {
    if (isRecording) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isRecording]);

  // Check for nudges periodically
  useEffect(() => {
    if (!nudgesEnabled || !syncEnabled) return;
    
    const checkNudges = async () => {
      const nudges = await SupabaseService.getPendingNudges();
      if (nudges.length > 0 && !pendingNudge) {
        setPendingNudge(nudges[0]);
        // Mark as sent
        await SupabaseService.markNudgeSent(nudges[0].id);
        // Vibrate on mobile
        if (Platform.OS !== 'web') {
          Vibration.vibrate([0, 200, 100, 200]);
        }
      }
    };
    
    checkNudges();
    const interval = setInterval(checkNudges, 60000); // Check every minute
    return () => clearInterval(interval);
  }, [nudgesEnabled, syncEnabled, pendingNudge]);

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const initializeApp = async () => {
    try {
      // Get or create device ID
      let storedDeviceId = await AsyncStorage.getItem('@nero/deviceId');
      if (!storedDeviceId) {
        storedDeviceId = generateDeviceId();
        await AsyncStorage.setItem('@nero/deviceId', storedDeviceId);
      }
      setDeviceId(storedDeviceId);

      // Load settings
      const [savedApiKey, savedVoiceEnabled, savedAutoSpeak, savedNudgesEnabled, savedSyncEnabled] = await Promise.all([
        AsyncStorage.getItem('@nero/apiKey'),
        AsyncStorage.getItem('@nero/voiceEnabled'),
        AsyncStorage.getItem('@nero/autoSpeak'),
        AsyncStorage.getItem('@nero/nudgesEnabled'),
        AsyncStorage.getItem('@nero/syncEnabled'),
      ]);

      if (savedApiKey) setApiKey(JSON.parse(savedApiKey));
      if (savedVoiceEnabled !== null) setVoiceEnabled(JSON.parse(savedVoiceEnabled));
      if (savedAutoSpeak !== null) setAutoSpeak(JSON.parse(savedAutoSpeak));
      if (savedNudgesEnabled !== null) setNudgesEnabled(JSON.parse(savedNudgesEnabled));
      if (savedSyncEnabled !== null) setSyncEnabled(JSON.parse(savedSyncEnabled));

      // Try to sync with Supabase
      const shouldSync = savedSyncEnabled === null ? true : JSON.parse(savedSyncEnabled);
      
      if (shouldSync) {
        try {
          setSyncStatus('syncing');
          await SupabaseService.initialize(storedDeviceId);
          
          // Load data from cloud
          const [cloudMemory, cloudMessages] = await Promise.all([
            SupabaseService.getMemory(),
            SupabaseService.getMessages(100),
          ]);
          
          if (cloudMemory) {
            cloudMemory.facts.totalConversations += 1;
            cloudMemory.facts.lastSeen = new Date().toISOString();
            setMemory(cloudMemory);
            await SupabaseService.saveMemory(cloudMemory);
          }
          
          if (cloudMessages.length > 0) {
            setMessages(cloudMessages);
          } else {
            // First time - show welcome
            const welcomeMessage: Message = {
              id: generateId(),
              role: 'nero',
              content: "Hey. I'm Nero. I'm here to help you get things done - not by giving you another system, but by actually knowing you. What's on your mind?",
              timestamp: new Date().toISOString(),
            };
            setMessages([welcomeMessage]);
            await SupabaseService.saveMessage(welcomeMessage);
          }
          
          setSyncStatus('synced');
        } catch (error) {
          console.error('Sync failed, using local:', error);
          setSyncStatus('offline');
          await loadLocalData();
        }
      } else {
        setSyncStatus('offline');
        await loadLocalData();
      }
    } catch (error) {
      console.error('Init error:', error);
      setSyncStatus('offline');
      await loadLocalData();
    } finally {
      setIsLoading(false);
    }
  };

  const loadLocalData = async () => {
    const [savedMessages, savedMemory] = await Promise.all([
      AsyncStorage.getItem('@nero/messages'),
      AsyncStorage.getItem('@nero/memory'),
    ]);

    if (savedMessages) {
      setMessages(JSON.parse(savedMessages));
    }

    if (savedMemory) {
      const parsedMemory = JSON.parse(savedMemory);
      parsedMemory.facts.lastSeen = new Date().toISOString();
      parsedMemory.facts.totalConversations += 1;
      setMemory(parsedMemory);
    } else {
      const welcomeMessage: Message = {
        id: generateId(),
        role: 'nero',
        content: "Hey. I'm Nero. I'm here to help you get things done - not by giving you another system, but by actually knowing you. What's on your mind?",
        timestamp: new Date().toISOString(),
      };
      setMessages([welcomeMessage]);
    }
  };

  // Save settings when they change
  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('@nero/apiKey', JSON.stringify(apiKey));
    }
  }, [apiKey, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('@nero/voiceEnabled', JSON.stringify(voiceEnabled));
    }
  }, [voiceEnabled, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('@nero/autoSpeak', JSON.stringify(autoSpeak));
    }
  }, [autoSpeak, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('@nero/nudgesEnabled', JSON.stringify(nudgesEnabled));
    }
  }, [nudgesEnabled, isLoading]);

  useEffect(() => {
    if (!isLoading) {
      AsyncStorage.setItem('@nero/syncEnabled', JSON.stringify(syncEnabled));
    }
  }, [syncEnabled, isLoading]);

  // Save data locally and to cloud
  const saveData = useCallback(async (newMessages: Message[], newMemory: UserMemory) => {
    // Always save locally
    await Promise.all([
      AsyncStorage.setItem('@nero/messages', JSON.stringify(newMessages.slice(-100))),
      AsyncStorage.setItem('@nero/memory', JSON.stringify(newMemory)),
    ]);
    
    // Sync to cloud if enabled
    if (syncEnabled && SupabaseService.userId) {
      try {
        setSyncStatus('syncing');
        await SupabaseService.saveMemory(newMemory);
        setSyncStatus('synced');
      } catch (error) {
        setSyncStatus('offline');
      }
    }
  }, [syncEnabled]);

  const sendMessage = async (text: string, isVoice: boolean = false) => {
    if (!text.trim() || isThinking) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: text.trim(),
      timestamp: new Date().toISOString(),
    };

    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsThinking(true);

    // Save user message to cloud
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.saveMessage(userMessage);
    }

    // Extract memories
    const newMemories = extractMemories(text);
    let updatedMemory = { ...memory };
    
    for (const mem of newMemories) {
      if (mem.startsWith('NAME: ')) {
        updatedMemory.facts.name = mem.replace('NAME: ', '');
      } else if (mem.startsWith('COMMITMENT: ')) {
        const commitment = mem.replace('COMMITMENT: ', '');
        if (!updatedMemory.threads.commitments.includes(commitment)) {
          updatedMemory.threads.commitments = [...updatedMemory.threads.commitments.slice(-4), commitment];
        }
      } else if (mem.startsWith('STRUGGLE: ')) {
        const struggle = mem.replace('STRUGGLE: ', '');
        if (!updatedMemory.patterns.knownStruggles.some(s => s.includes(struggle.slice(0, 30)))) {
          updatedMemory.patterns.knownStruggles = [...updatedMemory.patterns.knownStruggles.slice(-4), struggle];
        }
      } else {
        updatedMemory.remembered = [...updatedMemory.remembered.slice(-19), mem];
      }
    }

    updatedMemory.facts.lastSeen = new Date().toISOString();
    setMemory(updatedMemory);

    // Get Nero's response
    const response = await callNero(newMessages, updatedMemory, apiKey, isVoice);

    const neroMessage: Message = {
      id: generateId(),
      role: 'nero',
      content: response,
      timestamp: new Date().toISOString(),
    };

    const finalMessages = [...newMessages, neroMessage];
    setMessages(finalMessages);
    setIsThinking(false);

    // Save to cloud
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.saveMessage(neroMessage);
    }

    // Save locally and to cloud
    await saveData(finalMessages, updatedMemory);

    // Speak response if voice was used and auto-speak is on
    if (isVoice && autoSpeak && VoiceService.isSpeechSupported()) {
      setIsSpeaking(true);
      VoiceService.speak(response, () => setIsSpeaking(false));
    }
  };

  const handleVoicePress = () => {
    if (isRecording) {
      VoiceService.stopListening();
      setIsRecording(false);
    } else if (isSpeaking) {
      VoiceService.stopSpeaking();
      setIsSpeaking(false);
    } else {
      if (!VoiceService.isSupported()) {
        Alert.alert('Voice Not Supported', 'Your browser does not support voice input.');
        return;
      }
      
      setIsRecording(true);
      VoiceService.startListening(
        (transcript) => {
          setIsRecording(false);
          if (transcript.trim()) {
            sendMessage(transcript, true);
          }
        },
        () => setIsRecording(false),
        (error) => {
          console.error('Voice error:', error);
          setIsRecording(false);
        }
      );
    }
  };

  const dismissNudge = async () => {
    if (pendingNudge) {
      await SupabaseService.dismissNudge(pendingNudge.id);
      setPendingNudge(null);
    }
  };

  const scheduleNudge = async (hours: number) => {
    const scheduledFor = new Date(Date.now() + hours * 60 * 60 * 1000);
    const messages = [
      "Hey, just checking in. How's it going?",
      "Quick check - how are you doing?",
      "Thinking of you. What's happening?",
      "Hey. Where are you at right now?",
    ];
    const message = messages[Math.floor(Math.random() * messages.length)];
    
    await SupabaseService.createNudge(message, scheduledFor, 'checkin');
    Alert.alert('Check-in Scheduled', `I'll check in with you in ${hours} hour${hours > 1 ? 's' : ''}.`);
  };

  const clearHistory = async () => {
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.clearMessages();
    }
    
    const confirmMessage: Message = {
      id: generateId(),
      role: 'nero',
      content: "Starting fresh. I still remember who you are, but our conversation history is cleared. What's on your mind?",
      timestamp: new Date().toISOString(),
    };
    setMessages([confirmMessage]);
    
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.saveMessage(confirmMessage);
    }
    
    setShowSettings(false);
  };

  // ============ RENDER ============
  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Connecting...</Text>
      </View>
    );
  }

  // Nudge Popup
  if (pendingNudge) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.nudgeContainer}>
          <View style={styles.nudgeCard}>
            <Text style={styles.nudgeLabel}>Nero</Text>
            <Text style={styles.nudgeMessage}>{pendingNudge.message}</Text>
            <View style={styles.nudgeActions}>
              <TouchableOpacity 
                style={styles.nudgeButton} 
                onPress={dismissNudge}
              >
                <Text style={styles.nudgeButtonText}>I'm good</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.nudgeButton, styles.nudgeButtonPrimary]} 
                onPress={() => {
                  dismissNudge();
                  // Could add a default response here
                }}
              >
                <Text style={styles.nudgeButtonTextPrimary}>Let's talk</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Settings Panel
  if (showSettings) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.settingsContainer}>
          <View style={styles.settingsHeader}>
            <TouchableOpacity onPress={() => setShowSettings(false)}>
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.settingsTitle}>Settings</Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={styles.settingsContent}>
            {/* Sync Status */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Cloud Sync</Text>
              <View style={styles.syncRow}>
                <View style={[styles.syncDot, { 
                  backgroundColor: syncStatus === 'synced' ? COLORS.accent : 
                                   syncStatus === 'syncing' ? COLORS.warning : 
                                   COLORS.textDim 
                }]} />
                <Text style={styles.syncText}>
                  {syncStatus === 'synced' ? 'Synced across devices' :
                   syncStatus === 'syncing' ? 'Syncing...' :
                   'Offline mode'}
                </Text>
              </View>
              <TouchableOpacity 
                style={styles.toggleRow}
                onPress={() => setSyncEnabled(!syncEnabled)}
              >
                <Text style={styles.toggleLabel}>Enable cloud sync</Text>
                <View style={[styles.toggle, syncEnabled && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, syncEnabled && styles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Voice Settings */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Voice</Text>
              <TouchableOpacity 
                style={styles.toggleRow}
                onPress={() => setVoiceEnabled(!voiceEnabled)}
              >
                <Text style={styles.toggleLabel}>Enable voice input</Text>
                <View style={[styles.toggle, voiceEnabled && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, voiceEnabled && styles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.toggleRow}
                onPress={() => setAutoSpeak(!autoSpeak)}
              >
                <Text style={styles.toggleLabel}>Auto-speak responses</Text>
                <View style={[styles.toggle, autoSpeak && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, autoSpeak && styles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Nudges */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Check-ins</Text>
              <TouchableOpacity 
                style={styles.toggleRow}
                onPress={() => setNudgesEnabled(!nudgesEnabled)}
              >
                <Text style={styles.toggleLabel}>Allow Nero to check in</Text>
                <View style={[styles.toggle, nudgesEnabled && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, nudgesEnabled && styles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
              {nudgesEnabled && syncEnabled && (
                <View style={styles.nudgeSchedule}>
                  <Text style={styles.nudgeScheduleLabel}>Schedule a check-in:</Text>
                  <View style={styles.nudgeButtons}>
                    <TouchableOpacity style={styles.nudgeTimeBtn} onPress={() => scheduleNudge(1)}>
                      <Text style={styles.nudgeTimeBtnText}>1h</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.nudgeTimeBtn} onPress={() => scheduleNudge(2)}>
                      <Text style={styles.nudgeTimeBtnText}>2h</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.nudgeTimeBtn} onPress={() => scheduleNudge(4)}>
                      <Text style={styles.nudgeTimeBtnText}>4h</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>

            {/* API Key */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Claude API Key</Text>
              <Text style={styles.settingsHint}>
                For smarter responses. Leave empty for basic mode.
              </Text>
              <TextInput
                style={styles.settingsInput}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="sk-ant-..."
                placeholderTextColor={COLORS.textDim}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Memory Info */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>What Nero Remembers</Text>
              {memory.facts.name && (
                <Text style={styles.memoryItem}>• Your name: {memory.facts.name}</Text>
              )}
              <Text style={styles.memoryItem}>
                • Conversations: {memory.facts.totalConversations}
              </Text>
              {memory.threads.commitments.length > 0 && (
                <>
                  <Text style={styles.memorySubhead}>Things you said you'd do:</Text>
                  {memory.threads.commitments.map((c, i) => (
                    <Text key={i} style={styles.memoryItem}>• {c}</Text>
                  ))}
                </>
              )}
              {memory.remembered.length > 0 && (
                <>
                  <Text style={styles.memorySubhead}>Other memories:</Text>
                  {memory.remembered.slice(-5).map((r, i) => (
                    <Text key={i} style={styles.memoryItem}>• {r}</Text>
                  ))}
                </>
              )}
            </View>

            {/* Actions */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Data</Text>
              <TouchableOpacity style={styles.settingsButton} onPress={clearHistory}>
                <Text style={styles.settingsButtonText}>Clear Conversation History</Text>
              </TouchableOpacity>
              <Text style={styles.deviceIdText}>Device: {deviceId.slice(0, 20)}...</Text>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // Main Chat
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <KeyboardAvoidingView 
        style={styles.keyboardView} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Nero</Text>
            {syncEnabled && (
              <View style={[styles.syncIndicator, { 
                backgroundColor: syncStatus === 'synced' ? COLORS.accent : 
                                 syncStatus === 'syncing' ? COLORS.warning : 
                                 COLORS.textDim 
              }]} />
            )}
          </View>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsIcon}>
            <Text style={styles.settingsIconText}>⚙</Text>
          </TouchableOpacity>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messagesContainer}
          contentContainerStyle={styles.messagesContent}
          keyboardShouldPersistTaps="handled"
        >
          {messages.map((message) => (
            <View
              key={message.id}
              style={[
                styles.messageBubble,
                message.role === 'user' ? styles.userBubble : styles.neroBubble,
              ]}
            >
              <Text
                style={[
                  styles.messageText,
                  message.role === 'user' ? styles.userText : styles.neroText,
                ]}
              >
                {message.content}
              </Text>
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
          {/* Voice Button */}
          {voiceEnabled && VoiceService.isSupported() && (
            <Animated.View style={{ transform: [{ scale: isRecording ? pulseAnim : 1 }] }}>
              <TouchableOpacity
                style={[
                  styles.voiceButton,
                  isRecording && styles.voiceButtonRecording,
                  isSpeaking && styles.voiceButtonSpeaking,
                ]}
                onPress={handleVoicePress}
              >
                <Text style={styles.voiceButtonText}>
                  {isRecording ? '●' : isSpeaking ? '◼' : '🎤'}
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
          
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={isRecording ? "Listening..." : "Talk to Nero..."}
            placeholderTextColor={COLORS.textDim}
            multiline
            maxLength={2000}
            onSubmitEditing={() => sendMessage(input)}
            blurOnSubmit={false}
            editable={!isRecording}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isThinking) && styles.sendButtonDisabled]}
            onPress={() => sendMessage(input)}
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
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardView: {
    flex: 1,
  },
  loadingText: {
    color: COLORS.textMuted,
    marginTop: 12,
    fontSize: 14,
  },
  
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  syncIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  settingsIcon: {
    padding: 8,
  },
  settingsIconText: {
    fontSize: 20,
    color: COLORS.textMuted,
  },

  // Messages
  messagesContainer: {
    flex: 1,
  },
  messagesContent: {
    padding: 16,
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 14,
    borderRadius: 20,
    marginBottom: 12,
  },
  neroBubble: {
    backgroundColor: COLORS.surface,
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 6,
  },
  userBubble: {
    backgroundColor: COLORS.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 6,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 22,
  },
  neroText: {
    color: COLORS.text,
  },
  userText: {
    color: COLORS.text,
  },
  thinkingText: {
    color: COLORS.textMuted,
    fontSize: 18,
  },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 10,
  },
  textInput: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 12,
    paddingTop: 12,
    color: COLORS.text,
    fontSize: 16,
    maxHeight: 120,
    minHeight: 48,
  },
  sendButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: COLORS.surfaceLight,
  },
  sendButtonText: {
    color: COLORS.text,
    fontSize: 22,
    fontWeight: '600',
  },
  
  // Voice
  voiceButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  voiceButtonRecording: {
    backgroundColor: COLORS.recording,
    borderColor: COLORS.recording,
  },
  voiceButtonSpeaking: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
  },
  voiceButtonText: {
    fontSize: 20,
  },

  // Nudge
  nudgeContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  nudgeCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 360,
  },
  nudgeLabel: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  nudgeMessage: {
    color: COLORS.text,
    fontSize: 20,
    lineHeight: 28,
    marginBottom: 24,
  },
  nudgeActions: {
    flexDirection: 'row',
    gap: 12,
  },
  nudgeButton: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceLight,
    alignItems: 'center',
  },
  nudgeButtonPrimary: {
    backgroundColor: COLORS.primary,
  },
  nudgeButtonText: {
    color: COLORS.textMuted,
    fontSize: 16,
    fontWeight: '500',
  },
  nudgeButtonTextPrimary: {
    color: COLORS.text,
    fontSize: 16,
    fontWeight: '500',
  },

  // Settings
  settingsContainer: {
    flex: 1,
  },
  settingsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    color: COLORS.primary,
    fontSize: 16,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
  },
  settingsContent: {
    flex: 1,
    padding: 20,
  },
  settingsSection: {
    marginBottom: 32,
  },
  settingsLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
  },
  settingsHint: {
    fontSize: 14,
    color: COLORS.textDim,
    marginBottom: 12,
  },
  settingsInput: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    color: COLORS.text,
    fontSize: 16,
  },
  settingsButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  settingsButtonText: {
    color: COLORS.text,
    fontSize: 16,
  },
  memoryItem: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginBottom: 6,
    paddingLeft: 8,
  },
  memorySubhead: {
    color: COLORS.textDim,
    fontSize: 13,
    marginTop: 12,
    marginBottom: 6,
  },
  deviceIdText: {
    color: COLORS.textDim,
    fontSize: 12,
    marginTop: 8,
  },
  
  // Sync
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  syncDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  syncText: {
    color: COLORS.textMuted,
    fontSize: 14,
  },
  
  // Toggle
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  toggleLabel: {
    color: COLORS.text,
    fontSize: 16,
  },
  toggle: {
    width: 50,
    height: 30,
    borderRadius: 15,
    backgroundColor: COLORS.surfaceLight,
    padding: 2,
  },
  toggleOn: {
    backgroundColor: COLORS.primary,
  },
  toggleThumb: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: COLORS.textDim,
  },
  toggleThumbOn: {
    backgroundColor: COLORS.text,
    transform: [{ translateX: 20 }],
  },
  
  // Nudge Schedule
  nudgeSchedule: {
    marginTop: 16,
  },
  nudgeScheduleLabel: {
    color: COLORS.textMuted,
    fontSize: 14,
    marginBottom: 12,
  },
  nudgeButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  nudgeTimeBtn: {
    flex: 1,
    padding: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    alignItems: 'center',
  },
  nudgeTimeBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '500',
  },
});
