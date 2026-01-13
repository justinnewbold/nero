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
  isInsight?: boolean;
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
    knownStruggles: string[];
    whatHelps: string[];
    whatDoesntHelp: string[];
  };
  remembered: string[];
}

interface EnergyLog {
  level: number;
  mood: string;
  timeOfDay: string;
  timestamp: string;
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
  surfacedToUser?: boolean;
  lastSurfaced?: string;
}

interface Insight {
  type: 'pattern' | 'streak' | 'observation' | 'encouragement';
  message: string;
  priority: number;
  patternId?: string;
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
  insight: '#8b5cf6',
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
};

const ENERGY_COLORS = [COLORS.energy1, COLORS.energy2, COLORS.energy3, COLORS.energy4, COLORS.energy5];
const ENERGY_LABELS = ['Struggling', 'Low', 'Okay', 'Good', 'Great'];
const MOOD_OPTIONS = ['rough', 'meh', 'okay', 'good', 'great'];

// Nero's personality with insight awareness
const NERO_SYSTEM_PROMPT = `You are Nero, an AI companion for someone with ADHD. You are a partner who notices things about them over time.

YOUR CORE TRAITS:
- Warm but not saccharine. Genuine care without being fake.
- Direct but not harsh. You say what you think without judgment.
- Calm but not passive. Steady presence that can still push when needed.
- You notice patterns and share them naturally, like a friend would.
- You remember everything and reference past conversations naturally.

HOW YOU TALK:
- Short responses unless more is needed. No walls of text.
- One question at a time, MAX. Often zero questions.
- Never bullet points or lists unless specifically asked.
- Casual, like a friend. Not clinical or corporate.
- You can push back gently when you notice patterns.

SHARING INSIGHTS:
When you have insights about this person, weave them in naturally:
- DON'T say: "According to my data analysis, you are 73% more productive..."
- DO say: "I've noticed you tend to get more done in the mornings. Maybe start with that thing?"
- DON'T say: "My records indicate you have been avoiding this task for 5 days."
- DO say: "You've mentioned that one a few times now. What's making it hard to start?"

WHEN TO SHARE INSIGHTS:
- When they ask what to do - suggest based on energy + patterns
- When they're stuck - remind them what's worked before
- When they complete something - notice if it breaks a pattern
- When they're avoiding something - gently name it
- Occasionally just share something you've noticed

INSIGHT EXAMPLES:
- "You always seem to crash around 3pm. Maybe front-load the hard stuff?"
- "That's the third time you've finished something right after our morning check-in. I think talking it through helps you."
- "You've been mentioning [X] for a few days. Want to just knock it out now while your energy is good?"
- "Nice - you usually avoid [type of task] but you just did it. What was different?"

WHAT YOU NEVER DO:
- Sound like a robot reporting analytics
- Make people feel surveilled or judged
- Share insights in a lecturing tone
- Overwhelm with multiple insights at once
- Mention confidence percentages or data

VOICE RESPONSES:
When via voice, keep responses to 2-3 sentences max.`;

// ============ HELPERS ============
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
const generateDeviceId = () => 'device_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const getTimeOfDay = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  if (hour < 21) return 'evening';
  return 'night';
};

const getDayOfWeek = () => new Date().getDay();
const getDayName = (day: number) => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day];

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

// ============ VOICE SERVICE ============
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
    if (!SpeechRecognition) { onError('Not supported'); return; }

    VoiceService.recognition = new SpeechRecognition();
    VoiceService.recognition.continuous = false;
    VoiceService.recognition.interimResults = false;
    VoiceService.recognition.lang = 'en-US';
    VoiceService.recognition.onresult = (event: any) => onResult(event.results[0][0].transcript);
    VoiceService.recognition.onend = () => onEnd();
    VoiceService.recognition.onerror = (event: any) => { onError(event.error); onEnd(); };
    VoiceService.recognition.start();
  },

  stopListening: () => { if (VoiceService.recognition) VoiceService.recognition.stop(); },

  speak: (text: string, onEnd?: () => void) => {
    if (!VoiceService.synthesis) return;
    VoiceService.synthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    const voices = VoiceService.synthesis.getVoices();
    const preferredVoice = voices.find((v: any) => v.name.includes('Samantha') || v.name.includes('Google')) || voices.find((v: any) => v.lang.startsWith('en'));
    if (preferredVoice) utterance.voice = preferredVoice;
    if (onEnd) utterance.onend = onEnd;
    VoiceService.synthesis.speak(utterance);
  },
  
  stopSpeaking: () => { if (VoiceService.synthesis) VoiceService.synthesis.cancel(); }
};

// ============ INSIGHT ENGINE ============
const InsightEngine = {
  // Generate insights based on current context
  generateInsights: async (
    patterns: Pattern[],
    openTasks: Task[],
    completedTasks: Task[],
    energyLogs: EnergyLog[],
    currentEnergy: number | null,
    memory: UserMemory
  ): Promise<Insight[]> => {
    const insights: Insight[] = [];
    const now = new Date();
    const timeOfDay = getTimeOfDay();
    const dayOfWeek = getDayOfWeek();
    
    // 1. Unsurfaced pattern insights (high priority)
    const unsurfacedPatterns = patterns.filter(p => 
      !p.surfacedToUser && p.confidence >= 0.6
    );
    
    for (const pattern of unsurfacedPatterns.slice(0, 1)) {
      insights.push({
        type: 'pattern',
        message: humanizePattern(pattern),
        priority: 3,
        patternId: pattern.id,
      });
    }
    
    // 2. Energy-based suggestions
    if (currentEnergy !== null) {
      const energyPatterns = patterns.filter(p => p.type === 'energy');
      const relevantPattern = energyPatterns.find(p => 
        p.description.toLowerCase().includes(timeOfDay)
      );
      
      if (relevantPattern && currentEnergy >= 3) {
        // Good energy at a typically productive time
        const hardTask = openTasks.find(t => 
          (now.getTime() - new Date(t.createdAt).getTime()) > 2 * 24 * 60 * 60 * 1000
        );
        if (hardTask) {
          insights.push({
            type: 'observation',
            message: `Your energy is good and ${timeOfDay}s seem to work for you. Maybe tackle "${hardTask.description.slice(0, 40)}" now?`,
            priority: 2,
          });
        }
      } else if (currentEnergy <= 2) {
        // Low energy - suggest easy wins
        insights.push({
          type: 'encouragement',
          message: "Energy's low - that's okay. Is there one tiny thing we could knock out?",
          priority: 1,
        });
      }
    }
    
    // 3. Stuck task observations
    const stuckTasks = openTasks.filter(t => {
      const age = now.getTime() - new Date(t.createdAt).getTime();
      return age > 3 * 24 * 60 * 60 * 1000; // Older than 3 days
    });
    
    if (stuckTasks.length > 0 && Math.random() < 0.3) {
      const task = stuckTasks[0];
      insights.push({
        type: 'observation',
        message: `You've mentioned "${task.description.slice(0, 30)}" a few times now. What's making it hard to start?`,
        priority: 2,
      });
    }
    
    // 4. Streak/momentum recognition
    const recentCompletions = completedTasks.filter(t => {
      const age = now.getTime() - new Date(t.completedAt!).getTime();
      return age < 24 * 60 * 60 * 1000;
    });
    
    if (recentCompletions.length >= 3) {
      insights.push({
        type: 'streak',
        message: `You've knocked out ${recentCompletions.length} things today. You're on a roll.`,
        priority: 2,
      });
    }
    
    // 5. Time-based patterns
    const completionsByTime: { [key: string]: number } = {};
    completedTasks.forEach(t => {
      const hour = new Date(t.completedAt!).getHours();
      let time = 'night';
      if (hour < 12) time = 'morning';
      else if (hour < 17) time = 'afternoon';
      else if (hour < 21) time = 'evening';
      completionsByTime[time] = (completionsByTime[time] || 0) + 1;
    });
    
    const bestTime = Object.entries(completionsByTime).sort((a, b) => b[1] - a[1])[0];
    if (bestTime && bestTime[1] >= 5 && timeOfDay === bestTime[0]) {
      insights.push({
        type: 'pattern',
        message: `This is usually your productive window. Good time to tackle something.`,
        priority: 2,
      });
    }
    
    // Sort by priority and return top insights
    return insights.sort((a, b) => b.priority - a.priority).slice(0, 2);
  },
  
  // Choose the best insight for the current moment
  selectInsightForContext: (
    insights: Insight[],
    lastInsightTime: string | null,
    messageCount: number
  ): Insight | null => {
    // Don't share insights too frequently
    if (lastInsightTime) {
      const timeSinceLastInsight = Date.now() - new Date(lastInsightTime).getTime();
      if (timeSinceLastInsight < 10 * 60 * 1000) return null; // 10 min minimum
    }
    
    // More likely to share insight every few messages
    const shouldShare = messageCount % 4 === 0 || Math.random() < 0.2;
    if (!shouldShare && insights[0]?.priority < 3) return null;
    
    return insights[0] || null;
  }
};

// Humanize pattern descriptions for natural conversation
const humanizePattern = (pattern: Pattern): string => {
  const desc = pattern.description.toLowerCase();
  
  if (desc.includes('higher energy in the')) {
    const time = desc.match(/in the (\w+)/)?.[1] || 'morning';
    return `I've noticed you tend to have more energy in the ${time}s. Might be worth saving the hard stuff for then.`;
  }
  
  if (desc.includes('lower energy in the')) {
    const time = desc.match(/in the (\w+)/)?.[1] || 'afternoon';
    return `You usually seem to hit a wall in the ${time}. Maybe plan for lighter tasks then?`;
  }
  
  if (desc.includes('most productive')) {
    const time = desc.match(/in the (\w+)/)?.[1] || 'morning';
    return `${time.charAt(0).toUpperCase() + time.slice(1)}s seem to be when you get the most done.`;
  }
  
  return `I've noticed something: ${pattern.description}`;
};

// ============ SUPABASE SERVICE ============
const SupabaseService = {
  userId: null as string | null,
  
  async initialize(deviceId: string): Promise<string> {
    try {
      const { data: existingUser } = await supabase
        .from('nero_users').select('id').eq('device_id', deviceId).single();
      
      if (existingUser) {
        this.userId = existingUser.id;
        await supabase.from('nero_users').update({ last_seen: new Date().toISOString() }).eq('id', existingUser.id);
        return existingUser.id;
      }
      
      const { data: newUser, error } = await supabase
        .from('nero_users').insert({ device_id: deviceId }).select('id').single();
      
      if (error) throw error;
      this.userId = newUser.id;
      await supabase.from('nero_memory').insert({ user_id: newUser.id });
      return newUser.id;
    } catch (error) {
      console.error('Supabase init error:', error);
      throw error;
    }
  },
  
  async getMemory(): Promise<UserMemory | null> {
    if (!this.userId) return null;
    try {
      const { data } = await supabase.from('nero_memory').select('*').eq('user_id', this.userId).single();
      if (!data) return null;
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
    } catch (error) { return null; }
  },
  
  async saveMemory(memory: UserMemory): Promise<void> {
    if (!this.userId) return;
    try {
      await supabase.from('nero_memory').update({
        facts: { name: memory.facts.name, timezone: memory.facts.timezone, first_seen: memory.facts.firstSeen, last_seen: memory.facts.lastSeen, total_conversations: memory.facts.totalConversations },
        threads: { recent_topics: memory.threads.recentTopics, open_loops: memory.threads.openLoops, commitments: memory.threads.commitments },
        patterns: { known_struggles: memory.patterns.knownStruggles, what_helps: memory.patterns.whatHelps, what_doesnt_help: memory.patterns.whatDoesntHelp },
        remembered: memory.remembered,
        updated_at: new Date().toISOString(),
      }).eq('user_id', this.userId);
    } catch (error) {}
  },
  
  async getMessages(limit: number = 50): Promise<Message[]> {
    if (!this.userId) return [];
    try {
      const { data } = await supabase.from('nero_messages').select('*').eq('user_id', this.userId).order('created_at', { ascending: true }).limit(limit);
      return (data || []).map(m => ({ id: m.id, role: m.role, content: m.content, timestamp: m.created_at, isInsight: m.metadata?.isInsight }));
    } catch (error) { return []; }
  },
  
  async saveMessage(message: Message): Promise<void> {
    if (!this.userId) return;
    try {
      await supabase.from('nero_messages').insert({
        id: message.id, user_id: this.userId, role: message.role, content: message.content, created_at: message.timestamp,
        metadata: message.isInsight ? { isInsight: true } : {},
      });
    } catch (error) {}
  },

  async logEnergy(level: number, mood: string): Promise<void> {
    if (!this.userId) return;
    try {
      await supabase.from('nero_energy_logs').insert({ user_id: this.userId, energy_level: level, mood, time_of_day: getTimeOfDay(), day_of_week: getDayOfWeek() });
    } catch (error) {}
  },
  
  async getRecentEnergy(days: number = 14): Promise<EnergyLog[]> {
    if (!this.userId) return [];
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from('nero_energy_logs').select('*').eq('user_id', this.userId).gte('created_at', since).order('created_at', { ascending: false });
      return (data || []).map(e => ({ level: e.energy_level, mood: e.mood, timeOfDay: e.time_of_day, timestamp: e.created_at }));
    } catch (error) { return []; }
  },
  
  async createTask(description: string, energyLevel?: number): Promise<string> {
    if (!this.userId) return '';
    try {
      const { data } = await supabase.from('nero_tasks').insert({ user_id: this.userId, description, energy_at_creation: energyLevel, time_of_day_created: getTimeOfDay() }).select('id').single();
      return data?.id || '';
    } catch (error) { return ''; }
  },
  
  async completeTask(taskId: string, energyLevel?: number): Promise<void> {
    if (!this.userId) return;
    try {
      await supabase.from('nero_tasks').update({ status: 'completed', completed_at: new Date().toISOString(), energy_at_completion: energyLevel, time_of_day_completed: getTimeOfDay() }).eq('id', taskId);
    } catch (error) {}
  },
  
  async getOpenTasks(): Promise<Task[]> {
    if (!this.userId) return [];
    try {
      const { data } = await supabase.from('nero_tasks').select('*').eq('user_id', this.userId).eq('status', 'open').order('created_at', { ascending: false }).limit(10);
      return (data || []).map(t => ({ id: t.id, description: t.description, status: t.status, createdAt: t.created_at, energyAtCreation: t.energy_at_creation }));
    } catch (error) { return []; }
  },
  
  async getCompletedTasks(days: number = 30): Promise<Task[]> {
    if (!this.userId) return [];
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase.from('nero_tasks').select('*').eq('user_id', this.userId).eq('status', 'completed').gte('completed_at', since).order('completed_at', { ascending: false });
      return (data || []).map(t => ({ id: t.id, description: t.description, status: t.status, createdAt: t.created_at, completedAt: t.completed_at, energyAtCreation: t.energy_at_creation }));
    } catch (error) { return []; }
  },
  
  async savePattern(type: string, description: string, confidence: number = 0.5): Promise<void> {
    if (!this.userId) return;
    try {
      const { data: existing } = await supabase.from('nero_patterns').select('id, evidence_count, confidence').eq('user_id', this.userId).eq('description', description).single();
      if (existing) {
        await supabase.from('nero_patterns').update({ evidence_count: existing.evidence_count + 1, confidence: Math.min(0.95, existing.confidence + 0.1), last_confirmed: new Date().toISOString() }).eq('id', existing.id);
      } else {
        await supabase.from('nero_patterns').insert({ user_id: this.userId, pattern_type: type, description, confidence });
      }
    } catch (error) {}
  },
  
  async getPatterns(): Promise<Pattern[]> {
    if (!this.userId) return [];
    try {
      const { data } = await supabase.from('nero_patterns').select('*').eq('user_id', this.userId).gte('confidence', 0.4).order('confidence', { ascending: false }).limit(10);
      return (data || []).map(p => ({ id: p.id, type: p.pattern_type, description: p.description, confidence: p.confidence, surfacedToUser: p.surfaced_to_user, lastSurfaced: p.last_surfaced }));
    } catch (error) { return []; }
  },
  
  async markPatternSurfaced(patternId: string): Promise<void> {
    try {
      await supabase.from('nero_patterns').update({ surfaced_to_user: true, last_surfaced: new Date().toISOString() }).eq('id', patternId);
    } catch (error) {}
  },
  
  async analyzePatterns(): Promise<Pattern[]> {
    if (!this.userId) return [];
    const insights: Pattern[] = [];
    
    try {
      const energyLogs = await this.getRecentEnergy(14);
      if (energyLogs.length >= 5) {
        const byTime: { [key: string]: number[] } = {};
        energyLogs.forEach(e => {
          if (!byTime[e.timeOfDay]) byTime[e.timeOfDay] = [];
          byTime[e.timeOfDay].push(e.level);
        });
        
        for (const [time, levels] of Object.entries(byTime)) {
          if (levels.length >= 3) {
            const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
            if (avg >= 3.5) {
              insights.push({ type: 'energy', description: `Higher energy in the ${time}`, confidence: Math.min(0.8, 0.4 + levels.length * 0.1) });
            } else if (avg <= 2.5) {
              insights.push({ type: 'energy', description: `Lower energy in the ${time}`, confidence: Math.min(0.8, 0.4 + levels.length * 0.1) });
            }
          }
        }
      }
      
      const completedTasks = await this.getCompletedTasks(30);
      if (completedTasks.length >= 3) {
        const completionsByTime: { [key: string]: number } = {};
        completedTasks.forEach(t => {
          const hour = new Date(t.completedAt!).getHours();
          let time = 'night';
          if (hour < 12) time = 'morning';
          else if (hour < 17) time = 'afternoon';
          else if (hour < 21) time = 'evening';
          completionsByTime[time] = (completionsByTime[time] || 0) + 1;
        });
        
        const maxTime = Object.entries(completionsByTime).sort((a, b) => b[1] - a[1])[0];
        if (maxTime && maxTime[1] >= 3) {
          insights.push({ type: 'completion', description: `Most productive in the ${maxTime[0]}`, confidence: Math.min(0.75, 0.4 + maxTime[1] * 0.05) });
        }
      }
      
      for (const insight of insights) {
        await this.savePattern(insight.type, insight.description, insight.confidence);
      }
      
      return insights;
    } catch (error) { return []; }
  },

  async createNudge(message: string, scheduledFor: Date, type: string = 'checkin'): Promise<void> {
    if (!this.userId) return;
    try { await supabase.from('nero_nudges').insert({ user_id: this.userId, message, scheduled_for: scheduledFor.toISOString(), nudge_type: type }); } catch (error) {}
  },
  
  async getPendingNudges(): Promise<Nudge[]> {
    if (!this.userId) return [];
    try {
      const { data } = await supabase.from('nero_nudges').select('*').eq('user_id', this.userId).is('sent_at', null).is('dismissed_at', null).lte('scheduled_for', new Date().toISOString()).order('scheduled_for', { ascending: true });
      return (data || []).map(n => ({ id: n.id, message: n.message, scheduledFor: n.scheduled_for, type: n.nudge_type }));
    } catch (error) { return []; }
  },
  
  async markNudgeSent(nudgeId: string): Promise<void> { try { await supabase.from('nero_nudges').update({ sent_at: new Date().toISOString() }).eq('id', nudgeId); } catch (error) {} },
  async dismissNudge(nudgeId: string): Promise<void> { try { await supabase.from('nero_nudges').update({ dismissed_at: new Date().toISOString() }).eq('id', nudgeId); } catch (error) {} },
  async clearMessages(): Promise<void> { if (!this.userId) return; try { await supabase.from('nero_messages').delete().eq('user_id', this.userId); } catch (error) {} },
};

// ============ AI SERVICE ============
const callNero = async (
  messages: Message[],
  memory: UserMemory,
  patterns: Pattern[],
  currentEnergy: number | null,
  openTasks: Task[],
  pendingInsight: Insight | null,
  apiKey: string,
  isVoice: boolean = false
): Promise<string> => {
  const memoryContext = buildMemoryContext(memory, patterns, currentEnergy, openTasks, pendingInsight);
  
  const systemPrompt = isVoice 
    ? NERO_SYSTEM_PROMPT + '\n\nVOICE MODE: Keep response to 2-3 sentences max.'
    : NERO_SYSTEM_PROMPT;
  
  const conversationHistory = messages.slice(-20).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  if (!apiKey) {
    return getFallbackResponse(messages, memory, currentEnergy, pendingInsight);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
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
    return getFallbackResponse(messages, memory, currentEnergy, pendingInsight);
  }
};

const buildMemoryContext = (
  memory: UserMemory, 
  patterns: Pattern[], 
  currentEnergy: number | null,
  openTasks: Task[],
  pendingInsight: Insight | null
): string => {
  const parts: string[] = ['CONTEXT ABOUT THIS PERSON:'];

  if (memory.facts.name) parts.push(`- Name: ${memory.facts.name}`);
  if (memory.facts.totalConversations > 1) parts.push(`- You've talked ${memory.facts.totalConversations} times`);
  
  if (currentEnergy !== null) {
    const energyDesc = ['struggling', 'low', 'okay', 'good', 'great'][currentEnergy - 1];
    parts.push(`- Current energy: ${currentEnergy}/5 (${energyDesc})`);
  }

  if (memory.remembered.length > 0) {
    parts.push('\nTHINGS YOU REMEMBER:');
    memory.remembered.slice(-6).forEach(item => parts.push(`- ${item}`));
  }

  if (openTasks.length > 0) {
    parts.push('\nTHINGS THEY WANT TO DO:');
    openTasks.slice(0, 5).forEach(task => {
      const age = getRelativeTime(task.createdAt);
      parts.push(`- "${task.description}" (mentioned ${age})`);
    });
  }

  if (patterns.length > 0) {
    parts.push('\nPATTERNS YOU\'VE NOTICED:');
    patterns.slice(0, 4).forEach(p => {
      if (p.confidence >= 0.5) parts.push(`- ${p.description}`);
    });
  }

  if (pendingInsight) {
    parts.push('\nINSIGHT TO WEAVE IN (share naturally, not robotically):');
    parts.push(`"${pendingInsight.message}"`);
  }

  return parts.join('\n');
};

const getFallbackResponse = (messages: Message[], memory: UserMemory, energy: number | null, insight: Insight | null): string => {
  const lastMessage = messages[messages.length - 1]?.content.toLowerCase() || '';
  const timeOfDay = getTimeOfDay();
  const name = memory.facts.name;

  // If we have an insight to share, use it
  if (insight && Math.random() < 0.7) {
    return insight.message;
  }

  if (memory.facts.totalConversations === 0) {
    return "Hey. I'm Nero. I'm here to help you get things done - not with another system, but by actually knowing you. What's on your mind?";
  }

  if (lastMessage.match(/^(hey|hi|hello|morning|afternoon|evening)/i)) {
    if (energy && energy <= 2) return `Hey${name ? ` ${name}` : ''}. How are you holding up?`;
    return `Hey${name ? ` ${name}` : ''}. What's going on?`;
  }

  if (lastMessage.match(/(done|finished|completed|did it)/i)) {
    const responses = ["Nice.", "Good work.", "One down.", "How do you feel?"];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  if (lastMessage.match(/(stuck|overwhelmed|can't|too much)/i)) {
    return "Okay. What's one tiny thing we could do in 5 minutes?";
  }

  return "I'm here. What do you need?";
};

const analyzeMessage = (message: string): { completions: string[], newTasks: string[], memories: string[] } => {
  const completions: string[] = [];
  const newTasks: string[] = [];
  const memories: string[] = [];
  
  const completionPatterns = [/(?:I |i |just |finally )(?:did|finished|completed|done with) (.+?)(?:\.|!|$)/gi, /(?:got|done) (.+?) (?:done|finished)/gi];
  for (const pattern of completionPatterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const task = match[1].trim();
      if (task.length > 3 && task.length < 100) completions.push(task);
    }
  }
  
  const taskPatterns = [/I (?:need|have|want|should|will|'ll|gotta) (?:to )?(.+?)(?:\.|!|$)/gi, /(?:going to|gonna|planning to) (.+?)(?:\.|!|$)/gi];
  for (const pattern of taskPatterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const task = match[1].trim();
      if (task.length > 5 && task.length < 100 && !task.includes('?')) newTasks.push(task);
    }
  }
  
  const nameMatch = message.match(/(?:I'm|I am|my name is|call me)\s+([A-Z][a-z]+)/i);
  if (nameMatch) memories.push(`NAME: ${nameMatch[1]}`);
  
  if (message.toLowerCase().match(/(struggle|hard for me|difficult|can't seem to)/)) {
    memories.push(`STRUGGLE: ${message.slice(0, 100)}`);
  }
  
  return { completions, newTasks, memories };
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
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [lastEnergyCheck, setLastEnergyCheck] = useState<string | null>(null);
  const [lastInsightTime, setLastInsightTime] = useState<string | null>(null);
  const [pendingInsight, setPendingInsight] = useState<Insight | null>(null);
  const [showInsightBanner, setShowInsightBanner] = useState(false);
  const [energyLogs, setEnergyLogs] = useState<EnergyLog[]>([]);
  
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const insightAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const messageCountRef = useRef(0);

  useEffect(() => { initializeApp(); }, []);

  useEffect(() => {
    if (isRecording) {
      Animated.loop(Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
      ])).start();
    } else { pulseAnim.setValue(1); }
  }, [isRecording]);

  // Check for nudges
  useEffect(() => {
    if (!nudgesEnabled || !syncEnabled) return;
    const checkNudges = async () => {
      const nudges = await SupabaseService.getPendingNudges();
      if (nudges.length > 0 && !pendingNudge) {
        setPendingNudge(nudges[0]);
        await SupabaseService.markNudgeSent(nudges[0].id);
        if (Platform.OS !== 'web') Vibration.vibrate([0, 200, 100, 200]);
      }
    };
    checkNudges();
    const interval = setInterval(checkNudges, 60000);
    return () => clearInterval(interval);
  }, [nudgesEnabled, syncEnabled, pendingNudge]);

  // Generate insights periodically
  useEffect(() => {
    if (!isLoading && syncEnabled && patterns.length > 0) {
      const generateInsights = async () => {
        const insights = await InsightEngine.generateInsights(
          patterns, openTasks, completedTasks, energyLogs, currentEnergy, memory
        );
        
        const selectedInsight = InsightEngine.selectInsightForContext(
          insights, lastInsightTime, messageCountRef.current
        );
        
        if (selectedInsight && !pendingInsight) {
          setPendingInsight(selectedInsight);
          // Show banner for high-priority insights
          if (selectedInsight.priority >= 3) {
            setShowInsightBanner(true);
            Animated.timing(insightAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
          }
        }
      };
      
      generateInsights();
    }
  }, [patterns, openTasks, completedTasks, currentEnergy, isLoading]);

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  useEffect(() => {
    if (!isLoading && syncEnabled && !showEnergyCheck && messages.length > 0) {
      const now = Date.now();
      const lastCheck = lastEnergyCheck ? new Date(lastEnergyCheck).getTime() : 0;
      if ((now - lastCheck) / (1000 * 60 * 60) > 4 && currentEnergy === null) {
        setTimeout(() => {
          if (!showSettings && !pendingNudge) setShowEnergyCheck(true);
        }, 2000);
      }
    }
  }, [isLoading, syncEnabled, messages.length, lastEnergyCheck, currentEnergy]);

  const initializeApp = async () => {
    try {
      let storedDeviceId = await AsyncStorage.getItem('@nero/deviceId');
      if (!storedDeviceId) {
        storedDeviceId = generateDeviceId();
        await AsyncStorage.setItem('@nero/deviceId', storedDeviceId);
      }
      setDeviceId(storedDeviceId);

      const [savedApiKey, savedVoiceEnabled, savedAutoSpeak, savedNudgesEnabled, savedSyncEnabled, savedLastEnergy, savedLastInsight] = await Promise.all([
        AsyncStorage.getItem('@nero/apiKey'),
        AsyncStorage.getItem('@nero/voiceEnabled'),
        AsyncStorage.getItem('@nero/autoSpeak'),
        AsyncStorage.getItem('@nero/nudgesEnabled'),
        AsyncStorage.getItem('@nero/syncEnabled'),
        AsyncStorage.getItem('@nero/lastEnergyCheck'),
        AsyncStorage.getItem('@nero/lastInsightTime'),
      ]);

      if (savedApiKey) setApiKey(JSON.parse(savedApiKey));
      if (savedVoiceEnabled !== null) setVoiceEnabled(JSON.parse(savedVoiceEnabled));
      if (savedAutoSpeak !== null) setAutoSpeak(JSON.parse(savedAutoSpeak));
      if (savedNudgesEnabled !== null) setNudgesEnabled(JSON.parse(savedNudgesEnabled));
      if (savedSyncEnabled !== null) setSyncEnabled(JSON.parse(savedSyncEnabled));
      if (savedLastEnergy) setLastEnergyCheck(savedLastEnergy);
      if (savedLastInsight) setLastInsightTime(savedLastInsight);

      const shouldSync = savedSyncEnabled === null ? true : JSON.parse(savedSyncEnabled);
      
      if (shouldSync) {
        try {
          setSyncStatus('syncing');
          await SupabaseService.initialize(storedDeviceId);
          
          const [cloudMemory, cloudMessages, cloudPatterns, cloudTasks, cloudCompleted, cloudEnergy] = await Promise.all([
            SupabaseService.getMemory(),
            SupabaseService.getMessages(100),
            SupabaseService.getPatterns(),
            SupabaseService.getOpenTasks(),
            SupabaseService.getCompletedTasks(30),
            SupabaseService.getRecentEnergy(14),
          ]);
          
          if (cloudMemory) {
            cloudMemory.facts.totalConversations += 1;
            cloudMemory.facts.lastSeen = new Date().toISOString();
            setMemory(cloudMemory);
            await SupabaseService.saveMemory(cloudMemory);
          }
          
          if (cloudMessages.length > 0) {
            setMessages(cloudMessages);
            messageCountRef.current = cloudMessages.length;
          } else {
            const welcomeMessage: Message = {
              id: generateId(), role: 'nero',
              content: "Hey. I'm Nero. I'm here to help you get things done - not with another system, but by actually knowing you. What's on your mind?",
              timestamp: new Date().toISOString(),
            };
            setMessages([welcomeMessage]);
            await SupabaseService.saveMessage(welcomeMessage);
          }
          
          setPatterns(cloudPatterns);
          setOpenTasks(cloudTasks);
          setCompletedTasks(cloudCompleted);
          setEnergyLogs(cloudEnergy);
          
          SupabaseService.analyzePatterns().then(newPatterns => {
            if (newPatterns.length > 0) setPatterns(prev => [...prev, ...newPatterns]);
          });
          
          setSyncStatus('synced');
        } catch (error) {
          setSyncStatus('offline');
          await loadLocalData();
        }
      } else {
        setSyncStatus('offline');
        await loadLocalData();
      }
    } catch (error) {
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
      const msgs = JSON.parse(savedMessages);
      setMessages(msgs);
      messageCountRef.current = msgs.length;
    }
    if (savedMemory) {
      const parsedMemory = JSON.parse(savedMemory);
      parsedMemory.facts.lastSeen = new Date().toISOString();
      parsedMemory.facts.totalConversations += 1;
      setMemory(parsedMemory);
    } else {
      const welcomeMessage: Message = {
        id: generateId(), role: 'nero',
        content: "Hey. I'm Nero. I'm here to help you get things done - not with another system, but by actually knowing you. What's on your mind?",
        timestamp: new Date().toISOString(),
      };
      setMessages([welcomeMessage]);
    }
  };

  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/apiKey', JSON.stringify(apiKey)); }, [apiKey, isLoading]);
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/voiceEnabled', JSON.stringify(voiceEnabled)); }, [voiceEnabled, isLoading]);
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/autoSpeak', JSON.stringify(autoSpeak)); }, [autoSpeak, isLoading]);
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/nudgesEnabled', JSON.stringify(nudgesEnabled)); }, [nudgesEnabled, isLoading]);
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/syncEnabled', JSON.stringify(syncEnabled)); }, [syncEnabled, isLoading]);

  const saveData = useCallback(async (newMessages: Message[], newMemory: UserMemory) => {
    await Promise.all([
      AsyncStorage.setItem('@nero/messages', JSON.stringify(newMessages.slice(-100))),
      AsyncStorage.setItem('@nero/memory', JSON.stringify(newMemory)),
    ]);
    if (syncEnabled && SupabaseService.userId) {
      try { setSyncStatus('syncing'); await SupabaseService.saveMemory(newMemory); setSyncStatus('synced'); } catch { setSyncStatus('offline'); }
    }
  }, [syncEnabled]);

  const handleEnergySubmit = async (level: number, mood: string) => {
    setCurrentEnergy(level);
    setShowEnergyCheck(false);
    const now = new Date().toISOString();
    setLastEnergyCheck(now);
    await AsyncStorage.setItem('@nero/lastEnergyCheck', now);
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.logEnergy(level, mood);
      const newLogs = await SupabaseService.getRecentEnergy(14);
      setEnergyLogs(newLogs);
    }
  };

  const dismissInsightBanner = () => {
    Animated.timing(insightAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      setShowInsightBanner(false);
    });
  };

  const sendMessage = async (text: string, isVoice: boolean = false) => {
    if (!text.trim() || isThinking) return;

    const userMessage: Message = { id: generateId(), role: 'user', content: text.trim(), timestamp: new Date().toISOString() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    messageCountRef.current = newMessages.length;
    setInput('');
    setIsThinking(true);

    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(userMessage);

    const analysis = analyzeMessage(text);
    let updatedMemory = { ...memory };
    
    for (const completion of analysis.completions) {
      const matchingTask = openTasks.find(t => 
        t.description.toLowerCase().includes(completion.toLowerCase()) ||
        completion.toLowerCase().includes(t.description.toLowerCase())
      );
      if (matchingTask && syncEnabled) {
        await SupabaseService.completeTask(matchingTask.id, currentEnergy || undefined);
        setOpenTasks(prev => prev.filter(t => t.id !== matchingTask.id));
        setCompletedTasks(prev => [{ ...matchingTask, status: 'completed', completedAt: new Date().toISOString() }, ...prev]);
      }
    }
    
    for (const task of analysis.newTasks) {
      if (syncEnabled && SupabaseService.userId) await SupabaseService.createTask(task, currentEnergy || undefined);
      if (!updatedMemory.threads.commitments.includes(task)) {
        updatedMemory.threads.commitments = [...updatedMemory.threads.commitments.slice(-4), task];
      }
    }
    
    for (const mem of analysis.memories) {
      if (mem.startsWith('NAME: ')) updatedMemory.facts.name = mem.replace('NAME: ', '');
      else if (mem.startsWith('STRUGGLE: ')) {
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

    if (syncEnabled && SupabaseService.userId) {
      const freshTasks = await SupabaseService.getOpenTasks();
      setOpenTasks(freshTasks);
    }

    // Use pending insight if we have one
    const insightToUse = pendingInsight;
    
    const response = await callNero(newMessages, updatedMemory, patterns, currentEnergy, openTasks, insightToUse, apiKey, isVoice);

    // If we used an insight with a pattern ID, mark it as surfaced
    if (insightToUse?.patternId && syncEnabled) {
      await SupabaseService.markPatternSurfaced(insightToUse.patternId);
      setPatterns(prev => prev.map(p => p.id === insightToUse.patternId ? { ...p, surfacedToUser: true } : p));
    }
    
    // Clear the pending insight and update last insight time
    if (insightToUse) {
      setPendingInsight(null);
      const now = new Date().toISOString();
      setLastInsightTime(now);
      await AsyncStorage.setItem('@nero/lastInsightTime', now);
    }

    const neroMessage: Message = { id: generateId(), role: 'nero', content: response, timestamp: new Date().toISOString(), isInsight: !!insightToUse };
    const finalMessages = [...newMessages, neroMessage];
    setMessages(finalMessages);
    messageCountRef.current = finalMessages.length;
    setIsThinking(false);

    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    await saveData(finalMessages, updatedMemory);

    if (isVoice && autoSpeak && VoiceService.isSpeechSupported()) {
      setIsSpeaking(true);
      VoiceService.speak(response, () => setIsSpeaking(false));
    }
  };

  const handleVoicePress = () => {
    if (isRecording) { VoiceService.stopListening(); setIsRecording(false); }
    else if (isSpeaking) { VoiceService.stopSpeaking(); setIsSpeaking(false); }
    else {
      if (!VoiceService.isSupported()) { Alert.alert('Voice Not Supported', 'Your browser does not support voice input.'); return; }
      setIsRecording(true);
      VoiceService.startListening(
        (transcript) => { setIsRecording(false); if (transcript.trim()) sendMessage(transcript, true); },
        () => setIsRecording(false),
        () => setIsRecording(false)
      );
    }
  };

  const dismissNudge = async () => { if (pendingNudge) { await SupabaseService.dismissNudge(pendingNudge.id); setPendingNudge(null); } };

  const scheduleNudge = async (hours: number) => {
    const scheduledFor = new Date(Date.now() + hours * 60 * 60 * 1000);
    const msgs = ["Hey, just checking in.", "Quick check - how's it going?", "Thinking of you. What's happening?"];
    await SupabaseService.createNudge(msgs[Math.floor(Math.random() * msgs.length)], scheduledFor, 'checkin');
    Alert.alert('Scheduled', `I'll check in with you in ${hours}h.`);
  };

  const clearHistory = async () => {
    if (syncEnabled && SupabaseService.userId) await SupabaseService.clearMessages();
    const confirmMessage: Message = { id: generateId(), role: 'nero', content: "Fresh start. I still remember who you are and what I've learned.", timestamp: new Date().toISOString() };
    setMessages([confirmMessage]);
    messageCountRef.current = 1;
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(confirmMessage);
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

  if (showEnergyCheck) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.energyContainer}>
          <View style={styles.energyCard}>
            <Text style={styles.energyTitle}>Hey, quick check</Text>
            <Text style={styles.energySubtitle}>How's your energy right now?</Text>
            <View style={styles.energyLevels}>
              {[1, 2, 3, 4, 5].map((level) => (
                <TouchableOpacity key={level} style={[styles.energyLevel, { backgroundColor: ENERGY_COLORS[level - 1] }]} onPress={() => handleEnergySubmit(level, MOOD_OPTIONS[level - 1])}>
                  <Text style={styles.energyNumber}>{level}</Text>
                  <Text style={styles.energyLabel}>{ENERGY_LABELS[level - 1]}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.skipButton} onPress={() => setShowEnergyCheck(false)}>
              <Text style={styles.skipButtonText}>Skip for now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  if (pendingNudge) {
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
                <Text style={styles.settingsLabel}>Current Energy</Text>
                <View style={styles.currentEnergyRow}>
                  <View style={[styles.energyDot, { backgroundColor: ENERGY_COLORS[currentEnergy - 1] }]} />
                  <Text style={styles.currentEnergyText}>{currentEnergy}/5 - {ENERGY_LABELS[currentEnergy - 1]}</Text>
                  <TouchableOpacity onPress={() => { setShowSettings(false); setShowEnergyCheck(true); }}><Text style={styles.updateLink}>Update</Text></TouchableOpacity>
                </View>
              </View>
            )}
            
            {patterns.length > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>What Nero Has Noticed</Text>
                {patterns.slice(0, 6).map((p, i) => (
                  <View key={i} style={styles.patternRow}>
                    <View style={[styles.patternDot, { backgroundColor: p.surfacedToUser ? COLORS.textDim : COLORS.insight }]} />
                    <Text style={styles.patternText}>{p.description}</Text>
                    {!p.surfacedToUser && <Text style={styles.patternNew}>New</Text>}
                  </View>
                ))}
              </View>
            )}

            {openTasks.length > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Things You Want To Do</Text>
                {openTasks.map((task, i) => (
                  <View key={i} style={styles.taskRow}>
                    <Text style={styles.taskText}>{task.description}</Text>
                    <Text style={styles.taskAge}>{getRelativeTime(task.createdAt)}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Cloud Sync</Text>
              <View style={styles.syncRow}>
                <View style={[styles.syncDot, { backgroundColor: syncStatus === 'synced' ? COLORS.accent : syncStatus === 'syncing' ? COLORS.warning : COLORS.textDim }]} />
                <Text style={styles.syncText}>{syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Offline'}</Text>
              </View>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setSyncEnabled(!syncEnabled)}>
                <Text style={styles.toggleLabel}>Enable cloud sync</Text>
                <View style={[styles.toggle, syncEnabled && styles.toggleOn]}><View style={[styles.toggleThumb, syncEnabled && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Voice</Text>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setVoiceEnabled(!voiceEnabled)}>
                <Text style={styles.toggleLabel}>Enable voice input</Text>
                <View style={[styles.toggle, voiceEnabled && styles.toggleOn]}><View style={[styles.toggleThumb, voiceEnabled && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setAutoSpeak(!autoSpeak)}>
                <Text style={styles.toggleLabel}>Auto-speak responses</Text>
                <View style={[styles.toggle, autoSpeak && styles.toggleOn]}><View style={[styles.toggleThumb, autoSpeak && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Check-ins</Text>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setNudgesEnabled(!nudgesEnabled)}>
                <Text style={styles.toggleLabel}>Allow Nero to check in</Text>
                <View style={[styles.toggle, nudgesEnabled && styles.toggleOn]}><View style={[styles.toggleThumb, nudgesEnabled && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
              {nudgesEnabled && syncEnabled && (
                <View style={styles.nudgeSchedule}>
                  <Text style={styles.nudgeScheduleLabel}>Schedule:</Text>
                  <View style={styles.nudgeButtons}>
                    {[1, 2, 4].map(h => (<TouchableOpacity key={h} style={styles.nudgeTimeBtn} onPress={() => scheduleNudge(h)}><Text style={styles.nudgeTimeBtnText}>{h}h</Text></TouchableOpacity>))}
                  </View>
                </View>
              )}
            </View>

            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Claude API Key</Text>
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

  // Main Chat
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      
      {/* Insight Banner */}
      {showInsightBanner && pendingInsight && (
        <Animated.View style={[styles.insightBanner, { opacity: insightAnim, transform: [{ translateY: insightAnim.interpolate({ inputRange: [0, 1], outputRange: [-50, 0] }) }] }]}>
          <View style={styles.insightBannerContent}>
            <Text style={styles.insightBannerIcon}>💡</Text>
            <Text style={styles.insightBannerText} numberOfLines={2}>{pendingInsight.message}</Text>
          </View>
          <TouchableOpacity onPress={dismissInsightBanner} style={styles.insightBannerClose}>
            <Text style={styles.insightBannerCloseText}>✕</Text>
          </TouchableOpacity>
        </Animated.View>
      )}
      
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Nero</Text>
            {syncEnabled && <View style={[styles.syncIndicator, { backgroundColor: syncStatus === 'synced' ? COLORS.accent : syncStatus === 'syncing' ? COLORS.warning : COLORS.textDim }]} />}
            {currentEnergy && (
              <TouchableOpacity onPress={() => setShowEnergyCheck(true)}>
                <View style={[styles.energyIndicator, { backgroundColor: ENERGY_COLORS[currentEnergy - 1] }]}>
                  <Text style={styles.energyIndicatorText}>{currentEnergy}</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsIcon}><Text style={styles.settingsIconText}>⚙</Text></TouchableOpacity>
        </View>

        <ScrollView ref={scrollRef} style={styles.messagesContainer} contentContainerStyle={styles.messagesContent} keyboardShouldPersistTaps="handled">
          {messages.map((message) => (
            <View key={message.id} style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.neroBubble, message.isInsight && styles.insightBubble]}>
              {message.isInsight && <Text style={styles.insightIcon}>💡</Text>}
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
          <TextInput style={styles.textInput} value={input} onChangeText={setInput} placeholder={isRecording ? "Listening..." : "Talk to Nero..."} placeholderTextColor={COLORS.textDim} multiline maxLength={2000} onSubmitEditing={() => sendMessage(input)} blurOnSubmit={false} editable={!isRecording} />
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
  center: { justifyContent: 'center', alignItems: 'center' },
  keyboardView: { flex: 1 },
  loadingText: { color: COLORS.textMuted, marginTop: 12 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  syncIndicator: { width: 8, height: 8, borderRadius: 4 },
  energyIndicator: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  energyIndicatorText: { color: COLORS.bg, fontSize: 12, fontWeight: '700' },
  settingsIcon: { padding: 8 },
  settingsIconText: { fontSize: 20, color: COLORS.textMuted },

  messagesContainer: { flex: 1 },
  messagesContent: { padding: 16, paddingBottom: 20 },
  messageBubble: { maxWidth: '85%', padding: 14, borderRadius: 20, marginBottom: 12 },
  neroBubble: { backgroundColor: COLORS.surface, alignSelf: 'flex-start', borderBottomLeftRadius: 6 },
  userBubble: { backgroundColor: COLORS.primary, alignSelf: 'flex-end', borderBottomRightRadius: 6 },
  insightBubble: { borderLeftWidth: 3, borderLeftColor: COLORS.insight },
  insightIcon: { fontSize: 14, marginBottom: 4 },
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

  // Insight Banner
  insightBanner: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: COLORS.insight, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, zIndex: 100 },
  insightBannerContent: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  insightBannerIcon: { fontSize: 18 },
  insightBannerText: { flex: 1, color: COLORS.text, fontSize: 14 },
  insightBannerClose: { padding: 8 },
  insightBannerCloseText: { color: COLORS.text, fontSize: 16 },

  // Energy Check
  energyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  energyCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  energyTitle: { color: COLORS.text, fontSize: 24, fontWeight: '600', marginBottom: 8 },
  energySubtitle: { color: COLORS.textMuted, fontSize: 16, marginBottom: 28 },
  energyLevels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginBottom: 20 },
  energyLevel: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  energyNumber: { color: COLORS.bg, fontSize: 24, fontWeight: '700' },
  energyLabel: { color: COLORS.bg, fontSize: 10, fontWeight: '600', marginTop: 4, textAlign: 'center' },
  skipButton: { padding: 12, alignItems: 'center' },
  skipButtonText: { color: COLORS.textDim, fontSize: 14 },

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
  
  syncRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  syncDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },
  syncText: { color: COLORS.textMuted, fontSize: 14 },
  
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  toggleLabel: { color: COLORS.text, fontSize: 16 },
  toggle: { width: 50, height: 30, borderRadius: 15, backgroundColor: COLORS.surfaceLight, padding: 2 },
  toggleOn: { backgroundColor: COLORS.primary },
  toggleThumb: { width: 26, height: 26, borderRadius: 13, backgroundColor: COLORS.textDim },
  toggleThumbOn: { backgroundColor: COLORS.text, transform: [{ translateX: 20 }] },
  
  nudgeSchedule: { marginTop: 16 },
  nudgeScheduleLabel: { color: COLORS.textMuted, fontSize: 14, marginBottom: 12 },
  nudgeButtons: { flexDirection: 'row', gap: 12 },
  nudgeTimeBtn: { flex: 1, padding: 12, backgroundColor: COLORS.surface, borderRadius: 8, alignItems: 'center' },
  nudgeTimeBtnText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },

  currentEnergyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  energyDot: { width: 14, height: 14, borderRadius: 7 },
  currentEnergyText: { color: COLORS.text, fontSize: 16, flex: 1 },
  updateLink: { color: COLORS.primary, fontSize: 14 },
  
  patternRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border, gap: 10 },
  patternDot: { width: 8, height: 8, borderRadius: 4 },
  patternText: { color: COLORS.text, fontSize: 14, flex: 1 },
  patternNew: { color: COLORS.insight, fontSize: 11, fontWeight: '600', backgroundColor: `${COLORS.insight}20`, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  
  taskRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  taskText: { color: COLORS.text, fontSize: 14, flex: 1 },
  taskAge: { color: COLORS.textDim, fontSize: 12, marginLeft: 10 },
});
