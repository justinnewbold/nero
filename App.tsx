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
  PanResponder,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

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
  facts: { name?: string; timezone?: string; firstSeen: string; lastSeen: string; totalConversations: number; };
  threads: { recentTopics: string[]; openLoops: string[]; commitments: string[]; };
  patterns: { knownStruggles: string[]; whatHelps: string[]; whatDoesntHelp: string[]; };
  remembered: string[];
}

interface Task {
  id: string;
  description: string;
  status: 'open' | 'completed' | 'abandoned';
  createdAt: string;
  completedAt?: string;
  energyAtCreation?: number;
}

interface Pattern {
  id?: string;
  type: string;
  description: string;
  confidence: number;
}

interface TaskSuggestion {
  task: Task;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

interface BodyDoubleSession {
  taskId?: string;
  taskDescription?: string;
  startedAt: string;
  lastCheckIn: string;
  checkInCount: number;
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
  accent: '#22c55e',
  warning: '#f59e0b',
  suggestion: '#0ea5e9',
  bodyDouble: '#8b5cf6',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  textDim: '#52525b',
  border: '#27272a',
  recording: '#ef4444',
  energy1: '#ef4444',
  energy2: '#f97316',
  energy3: '#eab308',
  energy4: '#84cc16',
  energy5: '#22c55e',
  complete: '#22c55e',
  delete: '#ef4444',
};

const ENERGY_COLORS = [COLORS.energy1, COLORS.energy2, COLORS.energy3, COLORS.energy4, COLORS.energy5];
const ENERGY_LABELS = ['Struggling', 'Low', 'Okay', 'Good', 'Great'];
const MOOD_OPTIONS = ['rough', 'meh', 'okay', 'good', 'great'];

const BODY_DOUBLE_CHECK_INS = [
  "Still with you. How's it going?",
  "Just checking in. You good?",
  "I'm here. Making progress?",
  "How we doing?",
  "Still hanging out. Need anything?",
  "Checking in - everything okay?",
  "You're doing great. Keep going.",
  "Still here. Take your time.",
  "Just a gentle nudge. You got this.",
  "I'm not going anywhere. How's it feel?",
];

const NERO_SYSTEM_PROMPT = `You are Nero, an AI companion for someone with ADHD. Warm, direct, no judgment.

RULES:
- Short responses. One question max.
- No bullet points or lists.
- Casual like a friend.
- When in body doubling mode, be a calm presence.

BODY DOUBLING MODE:
When active, you're just there. Like a friend sitting nearby while they work.
- Don't over-check
- Celebrate small wins
- If they seem stuck, gently ask what's blocking them
- Never guilt or pressure`;

// ============ HELPERS ============
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
const generateDeviceId = () => 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
const getTimeOfDay = () => { const h = new Date().getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : h < 21 ? 'evening' : 'night'; };
const getDayOfWeek = () => new Date().getDay();

const getRelativeTime = (timestamp: string) => {
  const diffMs = Date.now() - new Date(timestamp).getTime();
  const mins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
};

const formatDuration = (ms: number) => {
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
};

const getTaskAge = (timestamp: string): number => (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);

// ============ TASK SUGGESTION ENGINE ============
const TaskSuggestionEngine = {
  suggestTask: (tasks: Task[], currentEnergy: number, patterns: Pattern[], completedTasks: Task[]): TaskSuggestion | null => {
    if (tasks.length === 0) return null;
    const timeOfDay = getTimeOfDay();
    const scoredTasks: { task: Task; score: number; reason: string }[] = [];
    const productiveTime = patterns.find(p => p.description.toLowerCase().includes('productive') || p.description.toLowerCase().includes('higher energy'));
    const isProductiveTime = productiveTime?.description.toLowerCase().includes(timeOfDay);
    
    for (const task of tasks) {
      let score = 50;
      let reasons: string[] = [];
      const taskAge = getTaskAge(task.createdAt);
      
      if (taskAge > 7) { score += 30; reasons.push("you've been putting this off"); }
      else if (taskAge > 3) { score += 20; reasons.push("this has been sitting"); }
      else if (taskAge > 1) score += 10;
      
      if (currentEnergy >= 4) {
        if (taskAge > 3) { score += 25; if (!reasons.length) reasons.push("good time to tackle something hard"); }
      } else if (currentEnergy >= 3) {
        if (taskAge >= 1 && taskAge <= 3) { score += 15; reasons.push("seems manageable"); }
      } else {
        if (taskAge < 2) { score += 20; reasons.push("something fresh and simple"); }
        if (taskAge > 3) score -= 15;
      }
      
      if (isProductiveTime && currentEnergy >= 3) score += 15;
      
      const recentCompletions = completedTasks.filter(t => (Date.now() - new Date(t.completedAt!).getTime()) / 3600000 < 2);
      if (recentCompletions.length > 0) { score += 10; if (!reasons.length) reasons.push("you're on a roll"); }
      
      scoredTasks.push({ task, score, reason: reasons[0] || "could be a good one" });
    }
    
    scoredTasks.sort((a, b) => b.score - a.score);
    const best = scoredTasks[0];
    if (!best) return null;
    return { task: best.task, reason: best.reason, confidence: best.score > 70 ? 'high' : best.score > 50 ? 'medium' : 'low' };
  },
  
  generateSuggestionMessage: (suggestion: TaskSuggestion | null, energy: number, name?: string): string => {
    if (!suggestion) {
      if (energy <= 2) return "Energy's low. No need to push. What's one tiny thing, or should we just rest?";
      return "Nothing tracked right now. What's on your mind?";
    }
    const task = suggestion.task.description;
    const taskAge = getTaskAge(suggestion.task.createdAt);
    
    if (energy >= 4) {
      if (taskAge > 5) return `Energy's great${name ? `, ${name}` : ''}. Perfect time to finally knock out "${task}".`;
      return `Good energy. What about "${task}"?`;
    }
    if (energy >= 3) return `Feeling okay? Maybe "${task}" - ${suggestion.reason}.`;
    if (energy === 2) return `Energy's low. If you want to do anything, "${task}" might be manageable. Or just rest.`;
    return `Rough one. No pressure. If you want one tiny win, "${task}" is there.`;
  }
};

// ============ VOICE SERVICE ============
const VoiceService = {
  recognition: null as any,
  synthesis: typeof window !== 'undefined' ? window.speechSynthesis : null,
  isSupported: () => typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window),
  isSpeechSupported: () => typeof window !== 'undefined' && 'speechSynthesis' in window,
  startListening: (onResult: (text: string) => void, onEnd: () => void, onError: (err: string) => void) => {
    if (typeof window === 'undefined') return;
    const SR = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { onError('Not supported'); return; }
    VoiceService.recognition = new SR();
    VoiceService.recognition.continuous = false;
    VoiceService.recognition.interimResults = false;
    VoiceService.recognition.lang = 'en-US';
    VoiceService.recognition.onresult = (e: any) => onResult(e.results[0][0].transcript);
    VoiceService.recognition.onend = () => onEnd();
    VoiceService.recognition.onerror = () => onEnd();
    VoiceService.recognition.start();
  },
  stopListening: () => { if (VoiceService.recognition) VoiceService.recognition.stop(); },
  speak: (text: string, onEnd?: () => void) => {
    if (!VoiceService.synthesis) return;
    VoiceService.synthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    const voices = VoiceService.synthesis.getVoices();
    const voice = voices.find((v: any) => v.name.includes('Samantha')) || voices.find((v: any) => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    if (onEnd) u.onend = onEnd;
    VoiceService.synthesis.speak(u);
  },
  stopSpeaking: () => { if (VoiceService.synthesis) VoiceService.synthesis.cancel(); }
};

// ============ SUPABASE SERVICE ============
const SupabaseService = {
  userId: null as string | null,
  
  async initialize(deviceId: string): Promise<string> {
    const { data: existing } = await supabase.from('nero_users').select('id').eq('device_id', deviceId).single();
    if (existing) { this.userId = existing.id; await supabase.from('nero_users').update({ last_seen: new Date().toISOString() }).eq('id', existing.id); return existing.id; }
    const { data: newUser, error } = await supabase.from('nero_users').insert({ device_id: deviceId }).select('id').single();
    if (error) throw error;
    this.userId = newUser.id;
    await supabase.from('nero_memory').insert({ user_id: newUser.id });
    return newUser.id;
  },
  
  async getMemory(): Promise<UserMemory | null> {
    if (!this.userId) return null;
    const { data } = await supabase.from('nero_memory').select('*').eq('user_id', this.userId).single();
    if (!data) return null;
    return {
      facts: { name: data.facts?.name, timezone: data.facts?.timezone, firstSeen: data.facts?.first_seen || new Date().toISOString(), lastSeen: data.facts?.last_seen || new Date().toISOString(), totalConversations: data.facts?.total_conversations || 0 },
      threads: { recentTopics: data.threads?.recent_topics || [], openLoops: data.threads?.open_loops || [], commitments: data.threads?.commitments || [] },
      patterns: { knownStruggles: data.patterns?.known_struggles || [], whatHelps: data.patterns?.what_helps || [], whatDoesntHelp: data.patterns?.what_doesnt_help || [] },
      remembered: data.remembered || [],
    };
  },
  
  async saveMemory(memory: UserMemory): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_memory').update({
      facts: { name: memory.facts.name, timezone: memory.facts.timezone, first_seen: memory.facts.firstSeen, last_seen: memory.facts.lastSeen, total_conversations: memory.facts.totalConversations },
      threads: { recent_topics: memory.threads.recentTopics, open_loops: memory.threads.openLoops, commitments: memory.threads.commitments },
      patterns: { known_struggles: memory.patterns.knownStruggles, what_helps: memory.patterns.whatHelps, what_doesnt_help: memory.patterns.whatDoesntHelp },
      remembered: memory.remembered, updated_at: new Date().toISOString(),
    }).eq('user_id', this.userId);
  },
  
  async getMessages(limit: number = 50): Promise<Message[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_messages').select('*').eq('user_id', this.userId).order('created_at', { ascending: true }).limit(limit);
    return (data || []).map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.created_at }));
  },
  
  async saveMessage(message: Message): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_messages').insert({ id: message.id, user_id: this.userId, role: message.role, content: message.content, created_at: message.timestamp });
  },

  async logEnergy(level: number, mood: string): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_energy_logs').insert({ user_id: this.userId, energy_level: level, mood, time_of_day: getTimeOfDay(), day_of_week: getDayOfWeek() });
  },
  
  async createTask(description: string, energyLevel?: number): Promise<string> {
    if (!this.userId) return '';
    const { data } = await supabase.from('nero_tasks').insert({ user_id: this.userId, description, energy_at_creation: energyLevel, time_of_day_created: getTimeOfDay() }).select('id').single();
    return data?.id || '';
  },
  
  async completeTask(taskId: string, energyLevel?: number): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_tasks').update({ status: 'completed', completed_at: new Date().toISOString(), energy_at_completion: energyLevel, time_of_day_completed: getTimeOfDay() }).eq('id', taskId);
  },

  async deleteTask(taskId: string): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_tasks').update({ status: 'abandoned' }).eq('id', taskId);
  },
  
  async getOpenTasks(): Promise<Task[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_tasks').select('*').eq('user_id', this.userId).eq('status', 'open').order('created_at', { ascending: true }).limit(20);
    return (data || []).map(t => ({ id: t.id, description: t.description, status: t.status, createdAt: t.created_at, energyAtCreation: t.energy_at_creation }));
  },
  
  async getCompletedTasks(days: number = 30): Promise<Task[]> {
    if (!this.userId) return [];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('nero_tasks').select('*').eq('user_id', this.userId).eq('status', 'completed').gte('completed_at', since).order('completed_at', { ascending: false });
    return (data || []).map(t => ({ id: t.id, description: t.description, status: t.status, createdAt: t.created_at, completedAt: t.completed_at }));
  },
  
  async getPatterns(): Promise<Pattern[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_patterns').select('*').eq('user_id', this.userId).gte('confidence', 0.4).order('confidence', { ascending: false }).limit(10);
    return (data || []).map(p => ({ id: p.id, type: p.pattern_type, description: p.description, confidence: p.confidence }));
  },
  
  async analyzePatterns(): Promise<void> {
    if (!this.userId) return;
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: energyLogs } = await supabase.from('nero_energy_logs').select('*').eq('user_id', this.userId).gte('created_at', since);
    if (energyLogs && energyLogs.length >= 5) {
      const byTime: { [key: string]: number[] } = {};
      energyLogs.forEach((e: any) => { if (!byTime[e.time_of_day]) byTime[e.time_of_day] = []; byTime[e.time_of_day].push(e.energy_level); });
      for (const [time, levels] of Object.entries(byTime)) {
        if (levels.length >= 3) {
          const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
          const desc = avg >= 3.5 ? `Higher energy in the ${time}` : avg <= 2.5 ? `Lower energy in the ${time}` : null;
          if (desc) {
            const { data: existing } = await supabase.from('nero_patterns').select('id').eq('user_id', this.userId).eq('description', desc).single();
            if (!existing) await supabase.from('nero_patterns').insert({ user_id: this.userId, pattern_type: 'energy', description: desc, confidence: Math.min(0.8, 0.4 + levels.length * 0.1) });
          }
        }
      }
    }
  },

  async getPendingNudges(): Promise<Nudge[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_nudges').select('*').eq('user_id', this.userId).is('sent_at', null).is('dismissed_at', null).lte('scheduled_for', new Date().toISOString());
    return (data || []).map(n => ({ id: n.id, message: n.message, scheduledFor: n.scheduled_for, type: n.nudge_type }));
  },
  
  async markNudgeSent(nudgeId: string): Promise<void> { await supabase.from('nero_nudges').update({ sent_at: new Date().toISOString() }).eq('id', nudgeId); },
  async dismissNudge(nudgeId: string): Promise<void> { await supabase.from('nero_nudges').update({ dismissed_at: new Date().toISOString() }).eq('id', nudgeId); },
  async clearMessages(): Promise<void> { if (!this.userId) return; await supabase.from('nero_messages').delete().eq('user_id', this.userId); },
};

// ============ AI SERVICE ============
const callNero = async (messages: Message[], memory: UserMemory, patterns: Pattern[], currentEnergy: number | null, openTasks: Task[], apiKey: string, isVoice: boolean = false, bodyDoubleMode: boolean = false): Promise<string> => {
  const parts: string[] = ['CONTEXT:'];
  if (memory.facts.name) parts.push(`- Name: ${memory.facts.name}`);
  if (currentEnergy !== null) parts.push(`- Energy: ${currentEnergy}/5`);
  if (bodyDoubleMode) parts.push(`- BODY DOUBLE MODE ACTIVE - be a calm presence`);
  if (memory.remembered.length > 0) { parts.push('\nREMEMBERED:'); memory.remembered.slice(-5).forEach(item => parts.push(`- ${item}`)); }
  if (openTasks.length > 0) { parts.push('\nOPEN TASKS:'); openTasks.slice(0, 4).forEach(t => parts.push(`- "${t.description}" (${getRelativeTime(t.createdAt)})`)); }
  
  const systemPrompt = isVoice ? NERO_SYSTEM_PROMPT + '\n\nVOICE: 2-3 sentences max.' : NERO_SYSTEM_PROMPT;
  const conversationHistory = messages.slice(-20).map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

  if (!apiKey) return getFallbackResponse(messages, memory, currentEnergy, bodyDoubleMode);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: isVoice ? 150 : 500, system: `${systemPrompt}\n\n${parts.join('\n')}`, messages: conversationHistory }),
    });
    if (!response.ok) throw new Error('API failed');
    const data = await response.json();
    return data.content[0]?.text || "I'm here. What's going on?";
  } catch { return getFallbackResponse(messages, memory, currentEnergy, bodyDoubleMode); }
};

const getFallbackResponse = (messages: Message[], memory: UserMemory, energy: number | null, bodyDoubleMode: boolean): string => {
  const lastMessage = messages[messages.length - 1]?.content.toLowerCase() || '';
  const name = memory.facts.name;
  
  if (bodyDoubleMode) {
    if (lastMessage.match(/(done|finished|completed)/i)) return "Nice work! Want to keep going or take a break?";
    if (lastMessage.match(/(stuck|help|hard)/i)) return "What's blocking you? Sometimes talking it out helps.";
    return BODY_DOUBLE_CHECK_INS[Math.floor(Math.random() * BODY_DOUBLE_CHECK_INS.length)];
  }
  
  if (memory.facts.totalConversations === 0) return "Hey. I'm Nero. I'm here to help you get things done - by actually knowing you. What's on your mind?";
  if (lastMessage.match(/^(hey|hi|hello)/i)) return `Hey${name ? ` ${name}` : ''}. What's going on?`;
  if (lastMessage.match(/(done|finished|completed)/i)) return "Nice. How do you feel?";
  if (lastMessage.match(/(stuck|overwhelmed|can't)/i)) return "What's one tiny thing we could do in 5 minutes?";
  return "I'm here. What do you need?";
};

const analyzeMessage = (message: string): { completions: string[], newTasks: string[], memories: string[] } => {
  const completions: string[] = [], newTasks: string[] = [], memories: string[] = [];
  const completionPatterns = [/(?:I |just |finally )(?:did|finished|completed|done with) (.+?)(?:\.|!|$)/gi];
  for (const p of completionPatterns) { let m; while ((m = p.exec(message)) !== null) { const t = m[1].trim(); if (t.length > 3 && t.length < 100) completions.push(t); } }
  const taskPatterns = [/I (?:need|have|want|should|will|'ll|gotta) (?:to )?(.+?)(?:\.|!|$)/gi];
  for (const p of taskPatterns) { let m; while ((m = p.exec(message)) !== null) { const t = m[1].trim(); if (t.length > 5 && t.length < 100 && !t.includes('?')) newTasks.push(t); } }
  const nameMatch = message.match(/(?:I'm|I am|my name is|call me)\s+([A-Z][a-z]+)/i);
  if (nameMatch) memories.push(`NAME: ${nameMatch[1]}`);
  return { completions, newTasks, memories };
};

// ============ SWIPEABLE TASK COMPONENT ============
const SwipeableTask = ({ task, onComplete, onDelete }: { task: Task; onComplete: () => void; onDelete: () => void }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiping, setSwiping] = useState<'none' | 'left' | 'right'>('none');
  
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dx) > 10,
      onPanResponderGrant: () => setSwiping('none'),
      onPanResponderMove: (_, gestureState) => {
        translateX.setValue(gestureState.dx);
        if (gestureState.dx > 50) setSwiping('right');
        else if (gestureState.dx < -50) setSwiping('left');
        else setSwiping('none');
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 100) {
          Animated.timing(translateX, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => onComplete());
        } else if (gestureState.dx < -100) {
          Animated.timing(translateX, { toValue: -400, duration: 200, useNativeDriver: true }).start(() => onDelete());
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
        setSwiping('none');
      },
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <View style={[styles.swipeBackground, styles.swipeBackgroundLeft]}>
        <Text style={styles.swipeText}>✓ Done</Text>
      </View>
      <View style={[styles.swipeBackground, styles.swipeBackgroundRight]}>
        <Text style={styles.swipeText}>✕ Remove</Text>
      </View>
      <Animated.View
        style={[
          styles.taskItem,
          { transform: [{ translateX }] },
          swiping === 'right' && styles.taskItemSwiping,
          swiping === 'left' && styles.taskItemSwipingDelete,
        ]}
        {...panResponder.panHandlers}
      >
        <Text style={styles.taskItemText} numberOfLines={2}>{task.description}</Text>
        <Text style={styles.taskItemAge}>{getRelativeTime(task.createdAt)}</Text>
      </Animated.View>
    </View>
  );
};

// ============ MAIN APP ============
export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [memory, setMemory] = useState<UserMemory>({
    facts: { firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), totalConversations: 0 },
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
  
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  
  const [pendingNudge, setPendingNudge] = useState<Nudge | null>(null);
  const [nudgesEnabled, setNudgesEnabled] = useState(true);
  
  const [currentEnergy, setCurrentEnergy] = useState<number | null>(null);
  const [showEnergyCheck, setShowEnergyCheck] = useState(false);
  const [showTaskSuggestion, setShowTaskSuggestion] = useState(false);
  const [taskSuggestion, setTaskSuggestion] = useState<TaskSuggestion | null>(null);
  const [suggestionMessage, setSuggestionMessage] = useState('');
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [lastEnergyCheck, setLastEnergyCheck] = useState<string | null>(null);
  
  // Body Double Mode
  const [bodyDoubleMode, setBodyDoubleMode] = useState(false);
  const [bodyDoubleSession, setBodyDoubleSession] = useState<BodyDoubleSession | null>(null);
  const [showBodyDoubleCheckIn, setShowBodyDoubleCheckIn] = useState(false);
  const bodyDoubleTimer = useRef<NodeJS.Timeout | null>(null);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { initializeApp(); }, []);

  // Breathing animation for body double mode
  useEffect(() => {
    if (bodyDoubleMode) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, { toValue: 1.1, duration: 2000, useNativeDriver: true }),
          Animated.timing(breatheAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
        ])
      ).start();
    } else {
      breatheAnim.setValue(1);
    }
  }, [bodyDoubleMode]);

  // Body double check-ins
  useEffect(() => {
    if (bodyDoubleMode && bodyDoubleSession) {
      bodyDoubleTimer.current = setInterval(() => {
        const timeSinceLastCheckIn = Date.now() - new Date(bodyDoubleSession.lastCheckIn).getTime();
        // Check in every 8-15 minutes (random to feel natural)
        const checkInInterval = (8 + Math.random() * 7) * 60 * 1000;
        if (timeSinceLastCheckIn > checkInInterval) {
          setShowBodyDoubleCheckIn(true);
          if (Platform.OS !== 'web') Vibration.vibrate(100);
        }
      }, 60000);
      
      return () => { if (bodyDoubleTimer.current) clearInterval(bodyDoubleTimer.current); };
    }
  }, [bodyDoubleMode, bodyDoubleSession]);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])).start();
    } else { pulseAnim.setValue(1); }
  }, [isRecording]);

  useEffect(() => {
    if (!nudgesEnabled || !syncEnabled) return;
    const check = async () => {
      const nudges = await SupabaseService.getPendingNudges();
      if (nudges.length > 0 && !pendingNudge) {
        setPendingNudge(nudges[0]);
        await SupabaseService.markNudgeSent(nudges[0].id);
      }
    };
    check();
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [nudgesEnabled, syncEnabled, pendingNudge]);

  useEffect(() => { setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100); }, [messages]);

  useEffect(() => {
    if (!isLoading && syncEnabled && !showEnergyCheck && !showTaskSuggestion && !bodyDoubleMode && messages.length > 0) {
      const now = Date.now();
      const lastCheck = lastEnergyCheck ? new Date(lastEnergyCheck).getTime() : 0;
      if ((now - lastCheck) / 3600000 > 4 && currentEnergy === null) {
        setTimeout(() => { if (!showSettings && !pendingNudge) setShowEnergyCheck(true); }, 2000);
      }
    }
  }, [isLoading, syncEnabled, messages.length, lastEnergyCheck, currentEnergy, bodyDoubleMode]);

  const initializeApp = async () => {
    try {
      let storedDeviceId = await AsyncStorage.getItem('@nero/deviceId');
      if (!storedDeviceId) { storedDeviceId = generateDeviceId(); await AsyncStorage.setItem('@nero/deviceId', storedDeviceId); }
      setDeviceId(storedDeviceId);

      const [savedApiKey, savedVoiceEnabled, savedAutoSpeak, savedNudgesEnabled, savedSyncEnabled, savedLastEnergy] = await Promise.all([
        AsyncStorage.getItem('@nero/apiKey'), AsyncStorage.getItem('@nero/voiceEnabled'), AsyncStorage.getItem('@nero/autoSpeak'),
        AsyncStorage.getItem('@nero/nudgesEnabled'), AsyncStorage.getItem('@nero/syncEnabled'), AsyncStorage.getItem('@nero/lastEnergyCheck'),
      ]);

      if (savedApiKey) setApiKey(JSON.parse(savedApiKey));
      if (savedVoiceEnabled !== null) setVoiceEnabled(JSON.parse(savedVoiceEnabled));
      if (savedAutoSpeak !== null) setAutoSpeak(JSON.parse(savedAutoSpeak));
      if (savedNudgesEnabled !== null) setNudgesEnabled(JSON.parse(savedNudgesEnabled));
      if (savedSyncEnabled !== null) setSyncEnabled(JSON.parse(savedSyncEnabled));
      if (savedLastEnergy) setLastEnergyCheck(savedLastEnergy);

      const shouldSync = savedSyncEnabled === null ? true : JSON.parse(savedSyncEnabled);
      
      if (shouldSync) {
        try {
          setSyncStatus('syncing');
          await SupabaseService.initialize(storedDeviceId);
          const [cloudMemory, cloudMessages, cloudPatterns, cloudTasks, cloudCompleted] = await Promise.all([
            SupabaseService.getMemory(), SupabaseService.getMessages(100), SupabaseService.getPatterns(),
            SupabaseService.getOpenTasks(), SupabaseService.getCompletedTasks(30),
          ]);
          if (cloudMemory) { cloudMemory.facts.totalConversations += 1; cloudMemory.facts.lastSeen = new Date().toISOString(); setMemory(cloudMemory); await SupabaseService.saveMemory(cloudMemory); }
          if (cloudMessages.length > 0) setMessages(cloudMessages);
          else {
            const welcome: Message = { id: generateId(), role: 'nero', content: "Hey. I'm Nero. I'm here to help you get things done - by actually knowing you. What's on your mind?", timestamp: new Date().toISOString() };
            setMessages([welcome]);
            await SupabaseService.saveMessage(welcome);
          }
          setPatterns(cloudPatterns); setOpenTasks(cloudTasks); setCompletedTasks(cloudCompleted);
          SupabaseService.analyzePatterns();
          setSyncStatus('synced');
        } catch { setSyncStatus('offline'); await loadLocalData(); }
      } else { setSyncStatus('offline'); await loadLocalData(); }
    } catch { setSyncStatus('offline'); await loadLocalData(); }
    finally { setIsLoading(false); }
  };

  const loadLocalData = async () => {
    const [savedMessages, savedMemory] = await Promise.all([AsyncStorage.getItem('@nero/messages'), AsyncStorage.getItem('@nero/memory')]);
    if (savedMessages) setMessages(JSON.parse(savedMessages));
    if (savedMemory) { const m = JSON.parse(savedMemory); m.facts.lastSeen = new Date().toISOString(); m.facts.totalConversations += 1; setMemory(m); }
    else {
      const welcome: Message = { id: generateId(), role: 'nero', content: "Hey. I'm Nero. I'm here to help you get things done - by actually knowing you. What's on your mind?", timestamp: new Date().toISOString() };
      setMessages([welcome]);
    }
  };

  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/apiKey', JSON.stringify(apiKey)); }, [apiKey, isLoading]);
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/voiceEnabled', JSON.stringify(voiceEnabled)); }, [voiceEnabled, isLoading]);
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/autoSpeak', JSON.stringify(autoSpeak)); }, [autoSpeak, isLoading]);
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/nudgesEnabled', JSON.stringify(nudgesEnabled)); }, [nudgesEnabled, isLoading]);
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/syncEnabled', JSON.stringify(syncEnabled)); }, [syncEnabled, isLoading]);

  const saveData = useCallback(async (newMessages: Message[], newMemory: UserMemory) => {
    await Promise.all([AsyncStorage.setItem('@nero/messages', JSON.stringify(newMessages.slice(-100))), AsyncStorage.setItem('@nero/memory', JSON.stringify(newMemory))]);
    if (syncEnabled && SupabaseService.userId) { try { setSyncStatus('syncing'); await SupabaseService.saveMemory(newMemory); setSyncStatus('synced'); } catch { setSyncStatus('offline'); } }
  }, [syncEnabled]);

  const handleEnergySubmit = async (level: number, mood: string) => {
    setCurrentEnergy(level);
    setShowEnergyCheck(false);
    const now = new Date().toISOString();
    setLastEnergyCheck(now);
    await AsyncStorage.setItem('@nero/lastEnergyCheck', now);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.logEnergy(level, mood);
    
    const suggestion = TaskSuggestionEngine.suggestTask(openTasks, level, patterns, completedTasks);
    setTaskSuggestion(suggestion);
    setSuggestionMessage(TaskSuggestionEngine.generateSuggestionMessage(suggestion, level, memory.facts.name));
    setShowTaskSuggestion(true);
  };

  const handleSuggestionAction = async (accepted: boolean) => {
    setShowTaskSuggestion(false);
    
    if (accepted && taskSuggestion) {
      // Start body double mode with this task
      startBodyDoubleMode(taskSuggestion.task);
    } else {
      const neroMessage: Message = {
        id: generateId(), role: 'nero',
        content: currentEnergy && currentEnergy <= 2 ? "No pressure. I'm here when you're ready." : "No worries. What else is on your mind?",
        timestamp: new Date().toISOString(),
      };
      const newMessages = [...messages, neroMessage];
      setMessages(newMessages);
      if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
      await saveData(newMessages, memory);
    }
  };

  const startBodyDoubleMode = async (task?: Task) => {
    const session: BodyDoubleSession = {
      taskId: task?.id,
      taskDescription: task?.description,
      startedAt: new Date().toISOString(),
      lastCheckIn: new Date().toISOString(),
      checkInCount: 0,
    };
    setBodyDoubleSession(session);
    setBodyDoubleMode(true);
    
    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: task 
        ? `Alright, let's do "${task.description}". I'm right here with you. Take your time - let me know when you're done or if you get stuck.`
        : "I'm here with you. Just going to hang out while you work. Let me know if you need anything.",
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    await saveData(newMessages, memory);
  };

  const handleBodyDoubleCheckIn = async (response: 'good' | 'stuck' | 'done' | 'break') => {
    setShowBodyDoubleCheckIn(false);
    
    if (bodyDoubleSession) {
      setBodyDoubleSession({
        ...bodyDoubleSession,
        lastCheckIn: new Date().toISOString(),
        checkInCount: bodyDoubleSession.checkInCount + 1,
      });
    }

    let content = '';
    if (response === 'good') {
      content = ["Nice, keep it up.", "You got this.", "Doing great.", "Still here with you."][Math.floor(Math.random() * 4)];
    } else if (response === 'stuck') {
      content = "What's blocking you? Sometimes it helps to talk it out.";
    } else if (response === 'done') {
      await endBodyDoubleMode(true);
      return;
    } else if (response === 'break') {
      content = "Good call. Take 5. I'll be here.";
    }

    const neroMessage: Message = { id: generateId(), role: 'nero', content, timestamp: new Date().toISOString() };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  const endBodyDoubleMode = async (completed: boolean = false) => {
    if (bodyDoubleSession?.taskId && completed && syncEnabled) {
      await SupabaseService.completeTask(bodyDoubleSession.taskId, currentEnergy || undefined);
      setOpenTasks(prev => prev.filter(t => t.id !== bodyDoubleSession.taskId));
    }

    const duration = bodyDoubleSession ? Date.now() - new Date(bodyDoubleSession.startedAt).getTime() : 0;
    const durationStr = formatDuration(duration);

    const content = completed
      ? `Done! ${durationStr} of focused work. ${bodyDoubleSession?.taskDescription ? `"${bodyDoubleSession.taskDescription}" - checked off.` : ''} How do you feel?`
      : `${durationStr} together. Good session. Rest up.`;

    setBodyDoubleMode(false);
    setBodyDoubleSession(null);
    if (bodyDoubleTimer.current) clearInterval(bodyDoubleTimer.current);

    const neroMessage: Message = { id: generateId(), role: 'nero', content, timestamp: new Date().toISOString() };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    await saveData(newMessages, memory);
    
    // Refresh tasks
    if (syncEnabled && SupabaseService.userId) {
      const freshTasks = await SupabaseService.getOpenTasks();
      setOpenTasks(freshTasks);
    }
  };

  const handleTaskComplete = async (task: Task) => {
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.completeTask(task.id, currentEnergy || undefined);
    }
    setOpenTasks(prev => prev.filter(t => t.id !== task.id));
    setCompletedTasks(prev => [{ ...task, status: 'completed', completedAt: new Date().toISOString() }, ...prev]);
    
    // Quick celebration message
    const celebrations = ["✓ Done!", "Nice one.", "Knocked out.", "✓"];
    const neroMessage: Message = { id: generateId(), role: 'nero', content: celebrations[Math.floor(Math.random() * celebrations.length)], timestamp: new Date().toISOString() };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  const handleTaskDelete = async (task: Task) => {
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.deleteTask(task.id);
    }
    setOpenTasks(prev => prev.filter(t => t.id !== task.id));
  };

  const sendMessage = async (text: string, isVoice: boolean = false) => {
    if (!text.trim() || isThinking) return;
    const userMessage: Message = { id: generateId(), role: 'user', content: text.trim(), timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    setIsThinking(true);

    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(userMessage);

    // Update body double check-in time if in that mode
    if (bodyDoubleMode && bodyDoubleSession) {
      setBodyDoubleSession({ ...bodyDoubleSession, lastCheckIn: new Date().toISOString() });
    }

    const analysis = analyzeMessage(text);
    let updatedMemory = { ...memory };
    
    for (const completion of analysis.completions) {
      const matchingTask = openTasks.find(t => t.description.toLowerCase().includes(completion.toLowerCase()) || completion.toLowerCase().includes(t.description.toLowerCase()));
      if (matchingTask && syncEnabled) {
        await SupabaseService.completeTask(matchingTask.id, currentEnergy || undefined);
        setOpenTasks(prev => prev.filter(t => t.id !== matchingTask.id));
        setCompletedTasks(prev => [{ ...matchingTask, status: 'completed', completedAt: new Date().toISOString() }, ...prev]);
        
        // If this was the body double task, celebrate
        if (bodyDoubleMode && bodyDoubleSession?.taskId === matchingTask.id) {
          await endBodyDoubleMode(true);
          setIsThinking(false);
          return;
        }
      }
    }
    
    for (const task of analysis.newTasks) {
      if (syncEnabled && SupabaseService.userId) await SupabaseService.createTask(task, currentEnergy || undefined);
      if (!updatedMemory.threads.commitments.includes(task)) updatedMemory.threads.commitments = [...updatedMemory.threads.commitments.slice(-4), task];
    }
    
    for (const mem of analysis.memories) {
      if (mem.startsWith('NAME: ')) updatedMemory.facts.name = mem.replace('NAME: ', '');
      else updatedMemory.remembered = [...updatedMemory.remembered.slice(-19), mem];
    }

    updatedMemory.facts.lastSeen = new Date().toISOString();
    setMemory(updatedMemory);

    if (syncEnabled && SupabaseService.userId) {
      const freshTasks = await SupabaseService.getOpenTasks();
      setOpenTasks(freshTasks);
    }

    const response = await callNero(newMessages, updatedMemory, patterns, currentEnergy, openTasks, apiKey, isVoice, bodyDoubleMode);
    const neroMessage: Message = { id: generateId(), role: 'nero', content: response, timestamp: new Date().toISOString() };
    const finalMessages = [...newMessages, neroMessage];
    setMessages(finalMessages);
    setIsThinking(false);

    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    await saveData(finalMessages, updatedMemory);

    if (isVoice && autoSpeak && VoiceService.isSpeechSupported()) { setIsSpeaking(true); VoiceService.speak(response, () => setIsSpeaking(false)); }
  };

  const handleVoicePress = () => {
    if (isRecording) { VoiceService.stopListening(); setIsRecording(false); }
    else if (isSpeaking) { VoiceService.stopSpeaking(); setIsSpeaking(false); }
    else {
      if (!VoiceService.isSupported()) { Alert.alert('Voice Not Supported'); return; }
      setIsRecording(true);
      VoiceService.startListening((transcript) => { setIsRecording(false); if (transcript.trim()) sendMessage(transcript, true); }, () => setIsRecording(false), () => setIsRecording(false));
    }
  };

  const dismissNudge = async () => { if (pendingNudge) { await SupabaseService.dismissNudge(pendingNudge.id); setPendingNudge(null); } };

  const clearHistory = async () => {
    if (syncEnabled && SupabaseService.userId) await SupabaseService.clearMessages();
    const confirm: Message = { id: generateId(), role: 'nero', content: "Fresh start. I still remember you.", timestamp: new Date().toISOString() };
    setMessages([confirm]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(confirm);
    setShowSettings(false);
  };

  // ============ RENDER ============
  if (isLoading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.loadingText}>Connecting...</Text></View>;
  }

  // Body Double Check-in
  if (showBodyDoubleCheckIn && bodyDoubleMode) {
    const checkInMessage = BODY_DOUBLE_CHECK_INS[Math.floor(Math.random() * BODY_DOUBLE_CHECK_INS.length)];
    return (
      <SafeAreaView style={[styles.container, styles.bodyDoubleContainer]}>
        <StatusBar style="light" />
        <View style={styles.checkInCard}>
          <Text style={styles.checkInMessage}>{checkInMessage}</Text>
          <View style={styles.checkInButtons}>
            <TouchableOpacity style={styles.checkInButton} onPress={() => handleBodyDoubleCheckIn('good')}><Text style={styles.checkInButtonText}>👍 Good</Text></TouchableOpacity>
            <TouchableOpacity style={styles.checkInButton} onPress={() => handleBodyDoubleCheckIn('stuck')}><Text style={styles.checkInButtonText}>😕 Stuck</Text></TouchableOpacity>
          </View>
          <View style={styles.checkInButtons}>
            <TouchableOpacity style={styles.checkInButton} onPress={() => handleBodyDoubleCheckIn('done')}><Text style={styles.checkInButtonText}>✓ Done!</Text></TouchableOpacity>
            <TouchableOpacity style={styles.checkInButton} onPress={() => handleBodyDoubleCheckIn('break')}><Text style={styles.checkInButtonText}>☕ Break</Text></TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Energy Check
  if (showEnergyCheck) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.energyContainer}>
          <View style={styles.energyCard}>
            <Text style={styles.energyTitle}>Hey{memory.facts.name ? `, ${memory.facts.name}` : ''}</Text>
            <Text style={styles.energySubtitle}>How's your energy?</Text>
            <View style={styles.energyLevels}>
              {[1, 2, 3, 4, 5].map((level) => (
                <TouchableOpacity key={level} style={[styles.energyLevel, { backgroundColor: ENERGY_COLORS[level - 1] }]} onPress={() => handleEnergySubmit(level, MOOD_OPTIONS[level - 1])}>
                  <Text style={styles.energyNumber}>{level}</Text>
                  <Text style={styles.energyLabel}>{ENERGY_LABELS[level - 1]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.skipButton} onPress={() => setShowEnergyCheck(false)}><Text style={styles.skipButtonText}>Skip</Text></TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Task Suggestion
  if (showTaskSuggestion) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.suggestionContainer}>
          <View style={styles.suggestionCard}>
            <View style={styles.suggestionHeader}>
              <View style={[styles.energyBadge, { backgroundColor: ENERGY_COLORS[(currentEnergy || 3) - 1] }]}><Text style={styles.energyBadgeText}>{currentEnergy}/5</Text></View>
              <Text style={styles.suggestionLabel}>Nero suggests</Text>
            </View>
            <Text style={styles.suggestionMessage}>{suggestionMessage}</Text>
            {taskSuggestion && (
              <View style={styles.suggestionTaskCard}>
                <Text style={styles.suggestionTaskText}>{taskSuggestion.task.description}</Text>
                <Text style={styles.suggestionTaskAge}>{getRelativeTime(taskSuggestion.task.createdAt)}</Text>
              </View>
            )}
            <View style={styles.suggestionActions}>
              <TouchableOpacity style={styles.suggestionButton} onPress={() => handleSuggestionAction(false)}><Text style={styles.suggestionButtonText}>{currentEnergy && currentEnergy <= 2 ? "Not now" : "Something else"}</Text></TouchableOpacity>
              {taskSuggestion && (
                <TouchableOpacity style={[styles.suggestionButton, styles.suggestionButtonPrimary]} onPress={() => handleSuggestionAction(true)}><Text style={styles.suggestionButtonTextPrimary}>Let's do it</Text></TouchableOpacity>
              )}
            </View>
            {!taskSuggestion && (
              <TouchableOpacity style={[styles.suggestionButton, { marginTop: 12 }]} onPress={() => { setShowTaskSuggestion(false); startBodyDoubleMode(); }}>
                <Text style={styles.suggestionButtonText}>Just hang with me</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Nudge
  if (pendingNudge && !bodyDoubleMode) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.nudgeContainer}>
          <View style={styles.nudgeCard}>
            <Text style={styles.nudgeLabel}>Nero</Text>
            <Text style={styles.nudgeMessage}>{pendingNudge.message}</Text>
            <View style={styles.nudgeActions}>
              <TouchableOpacity style={styles.nudgeButton} onPress={dismissNudge}><Text style={styles.nudgeButtonText}>I'm good</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.nudgeButton, styles.nudgeButtonPrimary]} onPress={dismissNudge}><Text style={styles.nudgeButtonTextPrimary}>Let's talk</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Settings with swipeable tasks
  if (showSettings) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.settingsContainer}>
          <View style={styles.settingsHeader}>
            <TouchableOpacity onPress={() => setShowSettings(false)}><Text style={styles.backButton}>← Back</Text></TouchableOpacity>
            <Text style={styles.settingsTitle}>Settings</Text>
            <View style={{ width: 50 }} />
          </View>
          <ScrollView style={styles.settingsContent}>
            {currentEnergy && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Energy</Text>
                <View style={styles.currentEnergyRow}>
                  <View style={[styles.energyDot, { backgroundColor: ENERGY_COLORS[currentEnergy - 1] }]} />
                  <Text style={styles.currentEnergyText}>{currentEnergy}/5 - {ENERGY_LABELS[currentEnergy - 1]}</Text>
                  <TouchableOpacity onPress={() => { setShowSettings(false); setCurrentEnergy(null); setShowEnergyCheck(true); }}><Text style={styles.updateLink}>Update</Text></TouchableOpacity>
                </View>
              </View>
            )}
            
            {openTasks.length > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Tasks ({openTasks.length}) — Swipe to complete or remove</Text>
                {openTasks.map((task) => (
                  <SwipeableTask key={task.id} task={task} onComplete={() => handleTaskComplete(task)} onDelete={() => handleTaskDelete(task)} />
                ))}
              </View>
            )}

            {patterns.length > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Patterns</Text>
                {patterns.slice(0, 5).map((p, i) => (
                  <View key={i} style={styles.patternRow}><Text style={styles.patternText}>{p.description}</Text></View>
                ))}
              </View>
            )}

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Body Double Mode</Text>
              <TouchableOpacity style={styles.bodyDoubleButton} onPress={() => { setShowSettings(false); startBodyDoubleMode(); }}>
                <Text style={styles.bodyDoubleButtonText}>🧘 Start Focus Session</Text>
              </TouchableOpacity>
              <Text style={styles.settingsHint}>Nero stays with you while you work, with gentle check-ins</Text>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Sync</Text>
              <View style={styles.syncRow}>
                <View style={[styles.syncDot, { backgroundColor: syncStatus === 'synced' ? COLORS.accent : syncStatus === 'syncing' ? COLORS.warning : COLORS.textDim }]} />
                <Text style={styles.syncText}>{syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Offline'}</Text>
              </View>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setSyncEnabled(!syncEnabled)}>
                <Text style={styles.toggleLabel}>Cloud sync</Text>
                <View style={[styles.toggle, syncEnabled && styles.toggleOn]}><View style={[styles.toggleThumb, syncEnabled && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Voice</Text>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setVoiceEnabled(!voiceEnabled)}>
                <Text style={styles.toggleLabel}>Voice input</Text>
                <View style={[styles.toggle, voiceEnabled && styles.toggleOn]}><View style={[styles.toggleThumb, voiceEnabled && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setAutoSpeak(!autoSpeak)}>
                <Text style={styles.toggleLabel}>Auto-speak</Text>
                <View style={[styles.toggle, autoSpeak && styles.toggleOn]}><View style={[styles.toggleThumb, autoSpeak && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>API Key</Text>
              <TextInput style={styles.settingsInput} value={apiKey} onChangeText={setApiKey} placeholder="sk-ant-..." placeholderTextColor={COLORS.textDim} secureTextEntry autoCapitalize="none" />
            </View>

            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.settingsButton} onPress={clearHistory}><Text style={styles.settingsButtonText}>Clear History</Text></TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </SafeAreaView>
    );
  }

  // Main Chat (with body double mode indicator)
  return (
    <SafeAreaView style={[styles.container, bodyDoubleMode && styles.bodyDoubleContainer]}>
      <StatusBar style="light" />
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[styles.header, bodyDoubleMode && styles.headerBodyDouble]}>
          <View style={styles.headerLeft}>
            {bodyDoubleMode ? (
              <Animated.View style={{ transform: [{ scale: breatheAnim }] }}>
                <Text style={styles.headerTitle}>🧘 Focus Mode</Text>
              </Animated.View>
            ) : (
              <>
                <Text style={styles.headerTitle}>Nero</Text>
                {syncEnabled && <View style={[styles.syncIndicator, { backgroundColor: syncStatus === 'synced' ? COLORS.accent : COLORS.warning }]} />}
              </>
            )}
            {currentEnergy && !bodyDoubleMode && (
              <TouchableOpacity onPress={() => { setCurrentEnergy(null); setShowEnergyCheck(true); }}>
                <View style={[styles.energyIndicator, { backgroundColor: ENERGY_COLORS[currentEnergy - 1] }]}><Text style={styles.energyIndicatorText}>{currentEnergy}</Text></View>
              </TouchableOpacity>
            )}
            {openTasks.length > 0 && !bodyDoubleMode && (
              <View style={styles.taskCountBadge}><Text style={styles.taskCountText}>{openTasks.length}</Text></View>
            )}
          </View>
          <View style={styles.headerRight}>
            {bodyDoubleMode && (
              <TouchableOpacity onPress={() => endBodyDoubleMode(false)} style={styles.endSessionButton}>
                <Text style={styles.endSessionText}>End</Text>
              </TouchableOpacity>
            )}
            {bodyDoubleMode && bodyDoubleSession && (
              <Text style={styles.sessionTimer}>{formatDuration(Date.now() - new Date(bodyDoubleSession.startedAt).getTime())}</Text>
            )}
            {!bodyDoubleMode && (
              <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsIcon}><Text style={styles.settingsIconText}>⚙</Text></TouchableOpacity>
            )}
          </View>
        </View>

        {bodyDoubleMode && bodyDoubleSession?.taskDescription && (
          <View style={styles.focusTaskBanner}>
            <Text style={styles.focusTaskLabel}>Working on:</Text>
            <Text style={styles.focusTaskText}>{bodyDoubleSession.taskDescription}</Text>
          </View>
        )}

        <ScrollView ref={scrollRef} style={styles.messagesContainer} contentContainerStyle={styles.messagesContent} keyboardShouldPersistTaps="handled">
          {messages.map((message) => (
            <View key={message.id} style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.neroBubble]}>
              <Text style={[styles.messageText, message.role === 'user' ? styles.userText : styles.neroText]}>{message.content}</Text>
            </View>
          ))}
          {isThinking && <View style={[styles.messageBubble, styles.neroBubble]}><Text style={styles.thinkingText}>...</Text></View>}
        </ScrollView>

        <View style={styles.inputContainer}>
          {voiceEnabled && VoiceService.isSupported() && (
            <Animated.View style={{ transform: [{ scale: isRecording ? pulseAnim : 1 }] }}>
              <TouchableOpacity style={[styles.voiceButton, isRecording && styles.voiceButtonRecording, isSpeaking && styles.voiceButtonSpeaking]} onPress={handleVoicePress}>
                <Text style={styles.voiceButtonText}>{isRecording ? '●' : isSpeaking ? '◼' : '🎤'}</Text>
              </TouchableOpacity>
            </Animated.View>
          )}
          <TextInput style={styles.textInput} value={input} onChangeText={setInput} placeholder={bodyDoubleMode ? "Need anything?" : "Talk to Nero..."} placeholderTextColor={COLORS.textDim} multiline maxLength={2000} onSubmitEditing={() => sendMessage(input)} blurOnSubmit={false} editable={!isRecording} />
          <TouchableOpacity style={[styles.sendButton, (!input.trim() || isThinking) && styles.sendButtonDisabled]} onPress={() => sendMessage(input)} disabled={!input.trim() || isThinking}>
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
  bodyDoubleContainer: { backgroundColor: '#0d0a14' },
  center: { justifyContent: 'center', alignItems: 'center' },
  keyboardView: { flex: 1 },
  loadingText: { color: COLORS.textMuted, marginTop: 12 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerBodyDouble: { borderBottomColor: COLORS.bodyDouble + '40' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  syncIndicator: { width: 8, height: 8, borderRadius: 4 },
  energyIndicator: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  energyIndicatorText: { color: COLORS.bg, fontSize: 12, fontWeight: '700' },
  taskCountBadge: { backgroundColor: COLORS.suggestion, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  taskCountText: { color: COLORS.text, fontSize: 12, fontWeight: '600' },
  settingsIcon: { padding: 8 },
  settingsIconText: { fontSize: 20, color: COLORS.textMuted },
  endSessionButton: { backgroundColor: COLORS.bodyDouble, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 12 },
  endSessionText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },
  sessionTimer: { color: COLORS.bodyDouble, fontSize: 14, fontWeight: '600' },

  focusTaskBanner: { backgroundColor: COLORS.bodyDouble + '20', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.bodyDouble + '40' },
  focusTaskLabel: { color: COLORS.bodyDouble, fontSize: 12, fontWeight: '600', marginBottom: 4 },
  focusTaskText: { color: COLORS.text, fontSize: 15 },

  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 20 },
  messageBubble: { maxWidth: '85%', padding: 14, borderRadius: 20, marginBottom: 12 },
  neroBubble: { backgroundColor: COLORS.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  userBubble: { backgroundColor: COLORS.primary, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  messageText: { fontSize: 16, lineHeight: 22 },
  neroText: { color: COLORS.text },
  userText: { color: COLORS.text },
  thinkingText: { color: COLORS.textMuted, fontSize: 18 },

  inputContainer: { flexDirection: 'row', alignItems: 'flex-end', paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: COLORS.border, gap: 10 },
  textInput: { flex: 1, backgroundColor: COLORS.surface, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 12, color: COLORS.text, fontSize: 16, maxHeight: 120, minHeight: 48 },
  sendButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  sendButtonDisabled: { backgroundColor: COLORS.surfaceLight },
  sendButtonText: { color: COLORS.text, fontSize: 22, fontWeight: '600' },
  
  voiceButton: { width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.border },
  voiceButtonRecording: { backgroundColor: COLORS.recording, borderColor: COLORS.recording },
  voiceButtonSpeaking: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  voiceButtonText: { fontSize: 20 },

  // Energy Check
  energyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  energyCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  energyTitle: { color: COLORS.text, fontSize: 24, fontWeight: '600', marginBottom: 8 },
  energySubtitle: { color: COLORS.textMuted, fontSize: 16, marginBottom: 28 },
  energyLevels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 20 },
  energyLevel: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  energyNumber: { color: COLORS.bg, fontSize: 24, fontWeight: '700' },
  energyLabel: { color: COLORS.bg, fontSize: 9, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  skipButton: { padding: 12, alignItems: 'center' },
  skipButtonText: { color: COLORS.textDim, fontSize: 14 },

  // Task Suggestion
  suggestionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  suggestionCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  suggestionHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  energyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  energyBadgeText: { color: COLORS.bg, fontSize: 12, fontWeight: '700' },
  suggestionLabel: { color: COLORS.textMuted, fontSize: 14 },
  suggestionMessage: { color: COLORS.text, fontSize: 18, lineHeight: 26, marginBottom: 20 },
  suggestionTaskCard: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: COLORS.suggestion },
  suggestionTaskText: { color: COLORS.text, fontSize: 16, fontWeight: '500', marginBottom: 4 },
  suggestionTaskAge: { color: COLORS.textDim, fontSize: 13 },
  suggestionActions: { flexDirection: 'row', gap: 12 },
  suggestionButton: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  suggestionButtonPrimary: { backgroundColor: COLORS.suggestion },
  suggestionButtonText: { color: COLORS.textMuted, fontSize: 16, fontWeight: '500' },
  suggestionButtonTextPrimary: { color: COLORS.text, fontSize: 16, fontWeight: '500' },

  // Body Double Check-in
  checkInCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '90%', maxWidth: 380 },
  checkInMessage: { color: COLORS.text, fontSize: 20, lineHeight: 28, marginBottom: 24, textAlign: 'center' },
  checkInButtons: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  checkInButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  checkInButtonText: { color: COLORS.text, fontSize: 16 },

  // Nudge
  nudgeContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  nudgeCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 },
  nudgeLabel: { color: COLORS.primary, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  nudgeMessage: { color: COLORS.text, fontSize: 20, lineHeight: 28, marginBottom: 24 },
  nudgeActions: { flexDirection: 'row', gap: 12 },
  nudgeButton: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  nudgeButtonPrimary: { backgroundColor: COLORS.primary },
  nudgeButtonText: { color: COLORS.textMuted, fontSize: 16, fontWeight: '500' },
  nudgeButtonTextPrimary: { color: COLORS.text, fontSize: 16, fontWeight: '500' },

  // Settings
  settingsContainer: { flex: 1 },
  settingsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  backButton: { color: COLORS.primary, fontSize: 16 },
  settingsTitle: { fontSize: 18, fontWeight: '600', color: COLORS.text },
  settingsContent: { flex: 1, padding: 20 },
  settingsSection: { marginBottom: 28 },
  settingsLabel: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  settingsInput: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, color: COLORS.text, fontSize: 16 },
  settingsButton: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, alignItems: 'center' },
  settingsButtonText: { color: COLORS.text, fontSize: 16 },
  settingsHint: { color: COLORS.textDim, fontSize: 13, marginTop: 8 },
  
  syncRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  syncDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  syncText: { color: COLORS.textMuted, fontSize: 14 },
  
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  toggleLabel: { color: COLORS.text, fontSize: 16 },
  toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: COLORS.surfaceLight, padding: 2 },
  toggleOn: { backgroundColor: COLORS.primary },
  toggleThumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.textDim },
  toggleThumbOn: { backgroundColor: COLORS.text, transform: [{ translateX: 20 }] },

  currentEnergyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  energyDot: { width: 14, height: 14, borderRadius: 7 },
  currentEnergyText: { color: COLORS.text, fontSize: 16, flex: 1 },
  updateLink: { color: COLORS.primary, fontSize: 14 },
  
  patternRow: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  patternText: { color: COLORS.text, fontSize: 14 },

  bodyDoubleButton: { backgroundColor: COLORS.bodyDouble, borderRadius: 12, padding: 16, alignItems: 'center' },
  bodyDoubleButtonText: { color: COLORS.text, fontSize: 16, fontWeight: '500' },

  // Swipeable Task
  swipeContainer: { marginBottom: 8, position: 'relative', overflow: 'hidden', borderRadius: 12 },
  swipeBackground: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center', paddingHorizontal: 20 },
  swipeBackgroundLeft: { left: 0, backgroundColor: COLORS.complete },
  swipeBackgroundRight: { right: 0, backgroundColor: COLORS.delete },
  swipeText: { color: COLORS.text, fontWeight: '600' },
  taskItem: { backgroundColor: COLORS.surface, padding: 14, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  taskItemSwiping: { backgroundColor: COLORS.complete + '30' },
  taskItemSwipingDelete: { backgroundColor: COLORS.delete + '30' },
  taskItemText: { color: COLORS.text, fontSize: 15, flex: 1, marginRight: 10 },
  taskItemAge: { color: COLORS.textDim, fontSize: 12 },
});
