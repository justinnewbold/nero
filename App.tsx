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
  Modal,
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

interface Commitment {
  id: string;
  content: string;
  createdAt: string;
  completedAt?: string;
  hourCreated: number;
}

interface Insight {
  id: string;
  type: string;
  content: string;
  confidence: number;
}

interface EnergyLog {
  level: number;
  mood: string;
  hour: number;
  day: number;
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
  energy1: '#ef4444',
  energy2: '#f97316',
  energy3: '#eab308',
  energy4: '#84cc16',
  energy5: '#22c55e',
};

const ENERGY_COLORS = [COLORS.energy1, COLORS.energy2, COLORS.energy3, COLORS.energy4, COLORS.energy5];
const ENERGY_LABELS = ['Crashed', 'Low', 'Okay', 'Good', 'On Fire'];
const MOOD_OPTIONS = ['scattered', 'tired', 'anxious', 'calm', 'focused', 'motivated'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Nero's personality with pattern awareness
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

PATTERN INSIGHTS:
You learn patterns about when this person is most productive, what strategies work for them, and what tends to derail them. When you have relevant insights, weave them naturally into conversation:
- "You tend to do well with X around this time..."
- "Last time you tried that approach, it worked well for you."
- "I've noticed mornings are usually better for you..."

But NEVER be preachy about patterns. One insight per conversation max. And only when relevant.

WHAT YOU NEVER DO:
- Never ask multiple questions at once
- Never give long lectures or explanations
- Never guilt or shame, even subtly
- Never say "I understand" without showing you actually do
- Never be relentlessly positive - be real
- Never offer generic advice - be specific to THIS person

WHEN SOMEONE COMPLETES SOMETHING:
Acknowledge it warmly but briefly. "Nice." or "Got it done." is fine. Don't overdo celebration.

VOICE RESPONSES:
When the user speaks via voice, keep responses extra concise - 2-3 sentences max.

YOUR MEMORY:
You have access to memories and learned patterns about this person. Use them naturally.`;

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

const getCurrentHour = () => new Date().getHours();
const getCurrentDay = () => new Date().getDay();

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

    VoiceService.recognition.onend = () => onEnd();
    VoiceService.recognition.onerror = (event: any) => {
      onError(event.error);
      onEnd();
    };

    VoiceService.recognition.start();
  },

  stopListening: () => {
    if (VoiceService.recognition) VoiceService.recognition.stop();
  },

  speak: (text: string, onEnd?: () => void) => {
    if (!VoiceService.synthesis) return;
    VoiceService.synthesis.cancel();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    
    const voices = VoiceService.synthesis.getVoices();
    const preferredVoice = voices.find((v: any) => 
      v.name.includes('Samantha') || v.name.includes('Google') || v.name.includes('Natural')
    ) || voices.find((v: any) => v.lang.startsWith('en'));
    
    if (preferredVoice) utterance.voice = preferredVoice;
    if (onEnd) utterance.onend = onEnd;
    
    VoiceService.synthesis.speak(utterance);
  },
  
  stopSpeaking: () => {
    if (VoiceService.synthesis) VoiceService.synthesis.cancel();
  }
};

// ============ PATTERN ANALYSIS SERVICE ============
const PatternService = {
  // Analyze energy patterns to find peak times
  async analyzeEnergyPatterns(userId: string): Promise<Insight[]> {
    try {
      const { data: logs } = await supabase
        .from('nero_energy_logs')
        .select('*')
        .eq('user_id', userId)
        .order('logged_at', { ascending: false })
        .limit(50);

      if (!logs || logs.length < 5) return [];

      const insights: Insight[] = [];

      // Group by hour
      const hourlyEnergy: { [key: number]: number[] } = {};
      logs.forEach((log: any) => {
        const hour = log.hour_of_day;
        if (!hourlyEnergy[hour]) hourlyEnergy[hour] = [];
        hourlyEnergy[hour].push(log.energy_level);
      });

      // Find peak hours
      let peakHour = -1;
      let peakAvg = 0;
      let lowHour = -1;
      let lowAvg = 5;

      Object.entries(hourlyEnergy).forEach(([hour, levels]) => {
        if (levels.length >= 2) {
          const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
          if (avg > peakAvg) {
            peakAvg = avg;
            peakHour = parseInt(hour);
          }
          if (avg < lowAvg) {
            lowAvg = avg;
            lowHour = parseInt(hour);
          }
        }
      });

      if (peakHour >= 0 && peakAvg >= 3.5) {
        const timeLabel = peakHour < 12 ? `${peakHour}am` : peakHour === 12 ? '12pm' : `${peakHour - 12}pm`;
        insights.push({
          id: generateId(),
          type: 'peak_time',
          content: `Your energy tends to be highest around ${timeLabel}`,
          confidence: Math.min(0.9, 0.5 + (logs.length / 50) * 0.4),
        });
      }

      if (lowHour >= 0 && lowAvg <= 2.5 && lowHour !== peakHour) {
        const timeLabel = lowHour < 12 ? `${lowHour}am` : lowHour === 12 ? '12pm' : `${lowHour - 12}pm`;
        insights.push({
          id: generateId(),
          type: 'low_time',
          content: `You usually hit a wall around ${timeLabel}`,
          confidence: Math.min(0.9, 0.5 + (logs.length / 50) * 0.4),
        });
      }

      // Analyze by day of week
      const dailyEnergy: { [key: number]: number[] } = {};
      logs.forEach((log: any) => {
        const day = log.day_of_week;
        if (!dailyEnergy[day]) dailyEnergy[day] = [];
        dailyEnergy[day].push(log.energy_level);
      });

      let bestDay = -1;
      let bestDayAvg = 0;

      Object.entries(dailyEnergy).forEach(([day, levels]) => {
        if (levels.length >= 2) {
          const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
          if (avg > bestDayAvg) {
            bestDayAvg = avg;
            bestDay = parseInt(day);
          }
        }
      });

      if (bestDay >= 0 && bestDayAvg >= 3.5) {
        insights.push({
          id: generateId(),
          type: 'best_day',
          content: `${DAY_NAMES[bestDay]}s tend to be your best days`,
          confidence: Math.min(0.85, 0.4 + (logs.length / 50) * 0.45),
        });
      }

      return insights;
    } catch (error) {
      console.error('Pattern analysis error:', error);
      return [];
    }
  },

  // Analyze commitment completion patterns
  async analyzeCompletionPatterns(userId: string): Promise<Insight[]> {
    try {
      const { data: commitments } = await supabase
        .from('nero_commitments')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(30);

      if (!commitments || commitments.length < 5) return [];

      const insights: Insight[] = [];
      const completed = commitments.filter((c: any) => c.completed_at);
      const completionRate = completed.length / commitments.length;

      // Completion rate insight
      if (commitments.length >= 10) {
        if (completionRate >= 0.7) {
          insights.push({
            id: generateId(),
            type: 'completion_rate',
            content: `You've been completing about ${Math.round(completionRate * 100)}% of what you commit to - that's solid`,
            confidence: 0.8,
          });
        } else if (completionRate <= 0.3) {
          insights.push({
            id: generateId(),
            type: 'completion_rate',
            content: `A lot of things are slipping through. Maybe we're capturing too much?`,
            confidence: 0.7,
          });
        }
      }

      // Best hour for completing things
      const completedByHour: { [key: number]: number } = {};
      completed.forEach((c: any) => {
        const hour = new Date(c.completed_at).getHours();
        completedByHour[hour] = (completedByHour[hour] || 0) + 1;
      });

      let bestCompletionHour = -1;
      let bestCompletionCount = 0;
      Object.entries(completedByHour).forEach(([hour, count]) => {
        if (count > bestCompletionCount) {
          bestCompletionCount = count;
          bestCompletionHour = parseInt(hour);
        }
      });

      if (bestCompletionHour >= 0 && bestCompletionCount >= 3) {
        const timeLabel = bestCompletionHour < 12 ? 'mornings' : bestCompletionHour < 17 ? 'afternoons' : 'evenings';
        insights.push({
          id: generateId(),
          type: 'completion_time',
          content: `You get the most done in the ${timeLabel}`,
          confidence: 0.75,
        });
      }

      return insights;
    } catch (error) {
      console.error('Completion pattern error:', error);
      return [];
    }
  },

  // Save insights to database
  async saveInsights(userId: string, insights: Insight[]): Promise<void> {
    if (!insights.length) return;

    try {
      for (const insight of insights) {
        // Check if similar insight exists
        const { data: existing } = await supabase
          .from('nero_insights')
          .select('id, times_validated, confidence')
          .eq('user_id', userId)
          .eq('insight_type', insight.type)
          .single();

        if (existing) {
          // Update existing insight
          await supabase
            .from('nero_insights')
            .update({
              content: insight.content,
              confidence: Math.min(0.95, existing.confidence + 0.05),
              times_validated: existing.times_validated + 1,
              last_validated_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          // Create new insight
          await supabase
            .from('nero_insights')
            .insert({
              user_id: userId,
              insight_type: insight.type,
              content: insight.content,
              confidence: insight.confidence,
            });
        }
      }
    } catch (error) {
      console.error('Save insights error:', error);
    }
  },

  // Get unsurfaced insights for Nero to share
  async getInsightsToShare(userId: string): Promise<Insight | null> {
    try {
      const { data } = await supabase
        .from('nero_insights')
        .select('*')
        .eq('user_id', userId)
        .gte('confidence', 0.6)
        .is('surfaced_at', null)
        .order('confidence', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        // Mark as surfaced
        await supabase
          .from('nero_insights')
          .update({ surfaced_at: new Date().toISOString() })
          .eq('id', data.id);

        return {
          id: data.id,
          type: data.insight_type,
          content: data.content,
          confidence: data.confidence,
        };
      }

      return null;
    } catch (error) {
      return null;
    }
  },
};

// ============ SUPABASE SERVICE ============
const SupabaseService = {
  userId: null as string | null,
  sessionId: null as string | null,
  
  async initialize(deviceId: string): Promise<string> {
    try {
      const { data: existingUser } = await supabase
        .from('nero_users')
        .select('id')
        .eq('device_id', deviceId)
        .single();
      
      if (existingUser) {
        this.userId = existingUser.id;
        await supabase
          .from('nero_users')
          .update({ last_seen: new Date().toISOString() })
          .eq('id', existingUser.id);
      } else {
        const { data: newUser, error } = await supabase
          .from('nero_users')
          .insert({ device_id: deviceId })
          .select('id')
          .single();
        
        if (error) throw error;
        this.userId = newUser.id;
        
        await supabase.from('nero_memory').insert({ user_id: newUser.id });
      }

      // Start a new session
      const { data: session } = await supabase
        .from('nero_sessions')
        .insert({
          user_id: this.userId,
          hour_of_day: getCurrentHour(),
          day_of_week: getCurrentDay(),
        })
        .select('id')
        .single();

      if (session) this.sessionId = session.id;

      return this.userId!;
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

      // Update session message count
      if (this.sessionId) {
        await supabase.rpc('increment_session_messages', { session_id: this.sessionId }).catch(() => {
          // Fallback if RPC doesn't exist
          supabase
            .from('nero_sessions')
            .update({ message_count: supabase.rpc('increment', { x: 1 }) })
            .eq('id', this.sessionId);
        });
      }
    } catch (error) {
      console.error('Save message error:', error);
    }
  },

  // Energy logging
  async logEnergy(level: number, mood: string): Promise<void> {
    if (!this.userId) return;

    try {
      await supabase
        .from('nero_energy_logs')
        .insert({
          user_id: this.userId,
          energy_level: level,
          mood,
          hour_of_day: getCurrentHour(),
          day_of_week: getCurrentDay(),
        });
    } catch (error) {
      console.error('Log energy error:', error);
    }
  },

  // Get recent energy
  async getRecentEnergy(): Promise<EnergyLog | null> {
    if (!this.userId) return null;

    try {
      const { data } = await supabase
        .from('nero_energy_logs')
        .select('*')
        .eq('user_id', this.userId)
        .order('logged_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        return {
          level: data.energy_level,
          mood: data.mood,
          hour: data.hour_of_day,
          day: data.day_of_week,
        };
      }
      return null;
    } catch (error) {
      return null;
    }
  },

  // Commitment tracking
  async saveCommitment(content: string): Promise<string> {
    if (!this.userId) return '';

    try {
      const { data } = await supabase
        .from('nero_commitments')
        .insert({
          user_id: this.userId,
          content,
          hour_created: getCurrentHour(),
          day_created: getCurrentDay(),
        })
        .select('id')
        .single();

      return data?.id || '';
    } catch (error) {
      console.error('Save commitment error:', error);
      return '';
    }
  },

  async completeCommitment(commitmentId: string): Promise<void> {
    try {
      await supabase
        .from('nero_commitments')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', commitmentId);
    } catch (error) {
      console.error('Complete commitment error:', error);
    }
  },

  async getOpenCommitments(): Promise<Commitment[]> {
    if (!this.userId) return [];

    try {
      const { data } = await supabase
        .from('nero_commitments')
        .select('*')
        .eq('user_id', this.userId)
        .is('completed_at', null)
        .is('abandoned_at', null)
        .order('created_at', { ascending: false })
        .limit(10);

      return (data || []).map(c => ({
        id: c.id,
        content: c.content,
        createdAt: c.created_at,
        hourCreated: c.hour_created,
      }));
    } catch (error) {
      console.error('Get commitments error:', error);
      return [];
    }
  },

  // Nudges
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
      const { data } = await supabase
        .from('nero_nudges')
        .select('*')
        .eq('user_id', this.userId)
        .is('sent_at', null)
        .is('dismissed_at', null)
        .lte('scheduled_for', new Date().toISOString())
        .order('scheduled_for', { ascending: true });
      
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
      console.error('Mark nudge error:', error);
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
      await supabase.from('nero_messages').delete().eq('user_id', this.userId);
    } catch (error) {
      console.error('Clear messages error:', error);
    }
  },

  // Run pattern analysis
  async analyzePatterns(): Promise<void> {
    if (!this.userId) return;

    const energyInsights = await PatternService.analyzeEnergyPatterns(this.userId);
    const completionInsights = await PatternService.analyzeCompletionPatterns(this.userId);
    
    await PatternService.saveInsights(this.userId, [...energyInsights, ...completionInsights]);
  },

  // Get insight for Nero to share
  async getInsightToShare(): Promise<Insight | null> {
    if (!this.userId) return null;
    return PatternService.getInsightsToShare(this.userId);
  },
};

// ============ AI SERVICE ============
const callNero = async (
  messages: Message[],
  memory: UserMemory,
  apiKey: string,
  isVoice: boolean = false,
  insight?: Insight | null,
  currentEnergy?: EnergyLog | null,
  openCommitments?: Commitment[]
): Promise<string> => {
  const memoryContext = buildMemoryContext(memory, insight, currentEnergy, openCommitments);
  
  const systemPrompt = isVoice 
    ? NERO_SYSTEM_PROMPT + '\n\nIMPORTANT: This message came via voice. Keep response extra short - 2-3 sentences max.'
    : NERO_SYSTEM_PROMPT;
  
  const conversationHistory = messages.slice(-20).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  if (!apiKey) {
    return getFallbackResponse(messages, memory, insight);
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
    return getFallbackResponse(messages, memory, insight);
  }
};

const buildMemoryContext = (
  memory: UserMemory, 
  insight?: Insight | null,
  currentEnergy?: EnergyLog | null,
  openCommitments?: Commitment[]
): string => {
  const parts: string[] = ['WHAT YOU KNOW ABOUT THIS PERSON:'];

  if (memory.facts.name) {
    parts.push(`- Their name is ${memory.facts.name}`);
  }

  if (memory.facts.totalConversations > 1) {
    parts.push(`- You've talked ${memory.facts.totalConversations} times before`);
  }

  // Current energy state
  if (currentEnergy) {
    const energyDesc = ENERGY_LABELS[currentEnergy.level - 1];
    parts.push(`\nCURRENT STATE:`);
    parts.push(`- Energy: ${energyDesc} (${currentEnergy.level}/5)`);
    parts.push(`- Mood: ${currentEnergy.mood}`);
    parts.push(`- Logged ${currentEnergy.hour < 12 ? 'this morning' : currentEnergy.hour < 17 ? 'this afternoon' : 'this evening'}`);
  }

  // Open commitments
  if (openCommitments && openCommitments.length > 0) {
    parts.push(`\nTHINGS THEY'VE COMMITTED TO:`);
    openCommitments.slice(0, 5).forEach(c => {
      parts.push(`- "${c.content}" (${getRelativeTime(c.createdAt)})`);
    });
  }

  if (memory.remembered.length > 0) {
    parts.push('\nTHINGS TO REMEMBER:');
    memory.remembered.slice(-10).forEach(item => {
      parts.push(`- ${item}`);
    });
  }

  if (memory.patterns.knownStruggles.length > 0) {
    parts.push('\nTHINGS THEY STRUGGLE WITH:');
    memory.patterns.knownStruggles.forEach(item => {
      parts.push(`- ${item}`);
    });
  }

  // Pattern insight to potentially share
  if (insight) {
    parts.push(`\nPATTERN INSIGHT (weave naturally if relevant, don't force it):`);
    parts.push(`- ${insight.content}`);
  }

  return parts.join('\n');
};

const getFallbackResponse = (messages: Message[], memory: UserMemory, insight?: Insight | null): string => {
  const lastMessage = messages[messages.length - 1]?.content.toLowerCase() || '';
  const timeOfDay = getTimeOfDay();
  const isFirstTime = memory.facts.totalConversations === 0;
  const name = memory.facts.name;

  if (isFirstTime) {
    return "Hey. I'm Nero. I'm here to help you get things done - not by giving you another system, but by actually knowing you. What's on your mind?";
  }

  if (lastMessage.match(/^(hey|hi|hello|morning|afternoon|evening)/i)) {
    let greeting = `Hey${name ? ` ${name}` : ''}. `;
    if (insight && Math.random() > 0.5) {
      greeting += insight.content + " Anyway, what's going on?";
    } else {
      greeting += "What's going on?";
    }
    return greeting;
  }

  if (lastMessage.includes('what should') || lastMessage.includes('what do')) {
    if (memory.threads.commitments.length > 0) {
      return `You mentioned wanting to ${memory.threads.commitments[0]}. Want to start with that?`;
    }
    return "What's the one thing that would make today feel like a win?";
  }

  if (lastMessage.match(/(done|finished|completed|did it)/i)) {
    return "Nice. What's next?";
  }

  if (lastMessage.match(/(stuck|overwhelmed|can't|too much|hard)/i)) {
    return "Okay. Forget the whole list. What's one tiny thing we could knock out in 5 minutes?";
  }

  return "I'm here. What do you need?";
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
  
  // Voice
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);
  
  // Nudge
  const [pendingNudge, setPendingNudge] = useState<Nudge | null>(null);
  const [nudgesEnabled, setNudgesEnabled] = useState(true);

  // Pattern Learning
  const [showEnergyCheck, setShowEnergyCheck] = useState(false);
  const [currentEnergy, setCurrentEnergy] = useState<EnergyLog | null>(null);
  const [openCommitments, setOpenCommitments] = useState<Commitment[]>([]);
  const [pendingInsight, setPendingInsight] = useState<Insight | null>(null);
  const [showInsights, setShowInsights] = useState(false);
  const [allInsights, setAllInsights] = useState<Insight[]>([]);
  
  // Animation
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Initialize
  useEffect(() => {
    initializeApp();
  }, []);

  // Pulse animation
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

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  // Periodic pattern analysis
  useEffect(() => {
    if (!syncEnabled || !SupabaseService.userId) return;

    const analyzeAndRefresh = async () => {
      await SupabaseService.analyzePatterns();
      const insight = await SupabaseService.getInsightToShare();
      if (insight) setPendingInsight(insight);
      
      const commitments = await SupabaseService.getOpenCommitments();
      setOpenCommitments(commitments);
    };

    // Run after initial load and every 10 minutes
    const timeout = setTimeout(analyzeAndRefresh, 5000);
    const interval = setInterval(analyzeAndRefresh, 600000);
    
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [syncEnabled]);

  const initializeApp = async () => {
    try {
      let storedDeviceId = await AsyncStorage.getItem('@nero/deviceId');
      if (!storedDeviceId) {
        storedDeviceId = generateDeviceId();
        await AsyncStorage.setItem('@nero/deviceId', storedDeviceId);
      }
      setDeviceId(storedDeviceId);

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

      const shouldSync = savedSyncEnabled === null ? true : JSON.parse(savedSyncEnabled);
      
      if (shouldSync) {
        try {
          setSyncStatus('syncing');
          await SupabaseService.initialize(storedDeviceId);
          
          const [cloudMemory, cloudMessages, recentEnergy, commitments] = await Promise.all([
            SupabaseService.getMemory(),
            SupabaseService.getMessages(100),
            SupabaseService.getRecentEnergy(),
            SupabaseService.getOpenCommitments(),
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
            const welcomeMessage: Message = {
              id: generateId(),
              role: 'nero',
              content: "Hey. I'm Nero. I'm here to help you get things done - not by giving you another system, but by actually knowing you. What's on your mind?",
              timestamp: new Date().toISOString(),
            };
            setMessages([welcomeMessage]);
            await SupabaseService.saveMessage(welcomeMessage);
          }

          if (recentEnergy) setCurrentEnergy(recentEnergy);
          if (commitments) setOpenCommitments(commitments);
          
          // Check if we should prompt for energy check
          const lastLogHour = recentEnergy?.hour;
          const currentHour = getCurrentHour();
          if (!recentEnergy || Math.abs(currentHour - (lastLogHour || 0)) >= 3) {
            // Prompt for energy after a delay
            setTimeout(() => setShowEnergyCheck(true), 10000);
          }
          
          setSyncStatus('synced');
        } catch (error) {
          console.error('Sync failed:', error);
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

    if (savedMessages) setMessages(JSON.parse(savedMessages));
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

  // Save settings
  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('@nero/apiKey', JSON.stringify(apiKey));
  }, [apiKey, isLoading]);

  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('@nero/voiceEnabled', JSON.stringify(voiceEnabled));
  }, [voiceEnabled, isLoading]);

  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('@nero/autoSpeak', JSON.stringify(autoSpeak));
  }, [autoSpeak, isLoading]);

  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('@nero/nudgesEnabled', JSON.stringify(nudgesEnabled));
  }, [nudgesEnabled, isLoading]);

  useEffect(() => {
    if (!isLoading) AsyncStorage.setItem('@nero/syncEnabled', JSON.stringify(syncEnabled));
  }, [syncEnabled, isLoading]);

  const saveData = useCallback(async (newMessages: Message[], newMemory: UserMemory) => {
    await Promise.all([
      AsyncStorage.setItem('@nero/messages', JSON.stringify(newMessages.slice(-100))),
      AsyncStorage.setItem('@nero/memory', JSON.stringify(newMemory)),
    ]);
    
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

    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.saveMessage(userMessage);
    }

    // Extract memories and commitments
    const newMemories = extractMemories(text);
    let updatedMemory = { ...memory };
    
    for (const mem of newMemories) {
      if (mem.startsWith('NAME: ')) {
        updatedMemory.facts.name = mem.replace('NAME: ', '');
      } else if (mem.startsWith('COMMITMENT: ')) {
        const commitment = mem.replace('COMMITMENT: ', '');
        if (!updatedMemory.threads.commitments.includes(commitment)) {
          updatedMemory.threads.commitments = [...updatedMemory.threads.commitments.slice(-4), commitment];
          // Save to commitments table for tracking
          if (syncEnabled && SupabaseService.userId) {
            await SupabaseService.saveCommitment(commitment);
          }
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

    // Check for completion phrases
    const completionPhrases = ['done', 'finished', 'completed', 'did it', 'got it done'];
    const isCompletion = completionPhrases.some(p => text.toLowerCase().includes(p));
    
    if (isCompletion && openCommitments.length > 0) {
      // Mark most recent commitment as complete
      await SupabaseService.completeCommitment(openCommitments[0].id);
      setOpenCommitments(prev => prev.slice(1));
    }

    // Get Nero's response with pattern insights
    const response = await callNero(
      newMessages, 
      updatedMemory, 
      apiKey, 
      isVoice,
      pendingInsight,
      currentEnergy,
      openCommitments
    );

    // Clear pending insight after using it
    if (pendingInsight) setPendingInsight(null);

    const neroMessage: Message = {
      id: generateId(),
      role: 'nero',
      content: response,
      timestamp: new Date().toISOString(),
    };

    const finalMessages = [...newMessages, neroMessage];
    setMessages(finalMessages);
    setIsThinking(false);

    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.saveMessage(neroMessage);
    }

    await saveData(finalMessages, updatedMemory);

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
          if (transcript.trim()) sendMessage(transcript, true);
        },
        () => setIsRecording(false),
        (error) => {
          console.error('Voice error:', error);
          setIsRecording(false);
        }
      );
    }
  };

  const handleEnergyCheck = async (level: number, mood: string) => {
    setShowEnergyCheck(false);
    setCurrentEnergy({ level, mood, hour: getCurrentHour(), day: getCurrentDay() });
    
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.logEnergy(level, mood);
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
    const nudgeMessages = [
      "Hey, just checking in. How's it going?",
      "Quick check - how are you doing?",
      "Thinking of you. What's happening?",
    ];
    const message = nudgeMessages[Math.floor(Math.random() * nudgeMessages.length)];
    
    await SupabaseService.createNudge(message, scheduledFor, 'checkin');
    Alert.alert('Check-in Scheduled', `I'll check in with you in ${hours} hour${hours > 1 ? 's' : ''}.`);
  };

  const loadAllInsights = async () => {
    if (!SupabaseService.userId) return;
    
    try {
      const { data } = await supabase
        .from('nero_insights')
        .select('*')
        .eq('user_id', SupabaseService.userId)
        .order('confidence', { ascending: false });

      if (data) {
        setAllInsights(data.map((i: any) => ({
          id: i.id,
          type: i.insight_type,
          content: i.content,
          confidence: i.confidence,
        })));
      }
    } catch (error) {
      console.error('Load insights error:', error);
    }
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

  // Energy Check Modal
  const renderEnergyCheck = () => (
    <Modal visible={showEnergyCheck} transparent animationType="fade">
      <View style={styles.modalOverlay}>
        <View style={styles.energyCard}>
          <Text style={styles.energyTitle}>How's your energy?</Text>
          <View style={styles.energyLevels}>
            {[1, 2, 3, 4, 5].map(level => (
              <TouchableOpacity
                key={level}
                style={[styles.energyLevel, { backgroundColor: ENERGY_COLORS[level - 1] }]}
                onPress={() => {
                  // Show mood selector after energy
                  setCurrentEnergy(prev => ({ ...prev!, level, mood: '', hour: getCurrentHour(), day: getCurrentDay() }));
                }}
              >
                <Text style={styles.energyLevelText}>{level}</Text>
                <Text style={styles.energyLevelLabel}>{ENERGY_LABELS[level - 1]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {currentEnergy && currentEnergy.level && !currentEnergy.mood && (
            <View style={styles.moodSection}>
              <Text style={styles.moodTitle}>What's the vibe?</Text>
              <View style={styles.moodOptions}>
                {MOOD_OPTIONS.map(mood => (
                  <TouchableOpacity
                    key={mood}
                    style={styles.moodOption}
                    onPress={() => handleEnergyCheck(currentEnergy.level, mood)}
                  >
                    <Text style={styles.moodOptionText}>{mood}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}
          <TouchableOpacity style={styles.skipButton} onPress={() => setShowEnergyCheck(false)}>
            <Text style={styles.skipButtonText}>Skip</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  // Insights Modal
  const renderInsightsModal = () => (
    <Modal visible={showInsights} transparent animationType="slide">
      <View style={styles.modalOverlay}>
        <View style={styles.insightsCard}>
          <View style={styles.insightsHeader}>
            <Text style={styles.insightsTitle}>What I've Learned</Text>
            <TouchableOpacity onPress={() => setShowInsights(false)}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.insightsList}>
            {allInsights.length === 0 ? (
              <Text style={styles.noInsights}>
                I'm still learning your patterns. Keep chatting and logging your energy - I'll share insights as I notice them.
              </Text>
            ) : (
              allInsights.map(insight => (
                <View key={insight.id} style={styles.insightItem}>
                  <View style={[styles.insightConfidence, { width: `${insight.confidence * 100}%` }]} />
                  <Text style={styles.insightText}>{insight.content}</Text>
                  <Text style={styles.insightType}>{insight.type.replace('_', ' ')}</Text>
                </View>
              ))
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );

  // Nudge Screen
  if (pendingNudge) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.nudgeContainer}>
          <View style={styles.nudgeCard}>
            <Text style={styles.nudgeLabel}>Nero</Text>
            <Text style={styles.nudgeMessage}>{pendingNudge.message}</Text>
            <View style={styles.nudgeActions}>
              <TouchableOpacity style={styles.nudgeButton} onPress={dismissNudge}>
                <Text style={styles.nudgeButtonText}>I'm good</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.nudgeButton, styles.nudgeButtonPrimary]} onPress={dismissNudge}>
                <Text style={styles.nudgeButtonTextPrimary}>Let's talk</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Settings
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
            {/* Current Energy Display */}
            {currentEnergy && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Current Energy</Text>
                <TouchableOpacity 
                  style={styles.currentEnergyDisplay}
                  onPress={() => setShowEnergyCheck(true)}
                >
                  <View style={[styles.energyDot, { backgroundColor: ENERGY_COLORS[currentEnergy.level - 1] }]} />
                  <Text style={styles.currentEnergyText}>
                    {ENERGY_LABELS[currentEnergy.level - 1]} • {currentEnergy.mood}
                  </Text>
                  <Text style={styles.updateText}>Tap to update</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Open Commitments */}
            {openCommitments.length > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Open Commitments</Text>
                {openCommitments.map(c => (
                  <View key={c.id} style={styles.commitmentItem}>
                    <Text style={styles.commitmentText}>{c.content}</Text>
                    <Text style={styles.commitmentTime}>{getRelativeTime(c.createdAt)}</Text>
                  </View>
                ))}
              </View>
            )}

            {/* Pattern Insights */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Patterns</Text>
              <TouchableOpacity 
                style={styles.settingsButton}
                onPress={() => {
                  loadAllInsights();
                  setShowInsights(true);
                }}
              >
                <Text style={styles.settingsButtonText}>View What Nero Has Learned</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.settingsButton}
                onPress={() => setShowEnergyCheck(true)}
              >
                <Text style={styles.settingsButtonText}>Log Energy Check-in</Text>
              </TouchableOpacity>
            </View>

            {/* Sync */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Cloud Sync</Text>
              <View style={styles.syncRow}>
                <View style={[styles.syncDot, { 
                  backgroundColor: syncStatus === 'synced' ? COLORS.accent : 
                                   syncStatus === 'syncing' ? COLORS.warning : COLORS.textDim 
                }]} />
                <Text style={styles.syncText}>
                  {syncStatus === 'synced' ? 'Synced' : syncStatus === 'syncing' ? 'Syncing...' : 'Offline'}
                </Text>
              </View>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setSyncEnabled(!syncEnabled)}>
                <Text style={styles.toggleLabel}>Enable cloud sync</Text>
                <View style={[styles.toggle, syncEnabled && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, syncEnabled && styles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Voice */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Voice</Text>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setVoiceEnabled(!voiceEnabled)}>
                <Text style={styles.toggleLabel}>Enable voice input</Text>
                <View style={[styles.toggle, voiceEnabled && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, voiceEnabled && styles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setAutoSpeak(!autoSpeak)}>
                <Text style={styles.toggleLabel}>Auto-speak responses</Text>
                <View style={[styles.toggle, autoSpeak && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, autoSpeak && styles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
            </View>

            {/* Nudges */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Check-ins</Text>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setNudgesEnabled(!nudgesEnabled)}>
                <Text style={styles.toggleLabel}>Allow Nero to check in</Text>
                <View style={[styles.toggle, nudgesEnabled && styles.toggleOn]}>
                  <View style={[styles.toggleThumb, nudgesEnabled && styles.toggleThumbOn]} />
                </View>
              </TouchableOpacity>
              {nudgesEnabled && syncEnabled && (
                <View style={styles.nudgeSchedule}>
                  <Text style={styles.nudgeScheduleLabel}>Schedule a check-in:</Text>
                  <View style={styles.nudgeButtons}>
                    {[1, 2, 4].map(h => (
                      <TouchableOpacity key={h} style={styles.nudgeTimeBtn} onPress={() => scheduleNudge(h)}>
                        <Text style={styles.nudgeTimeBtnText}>{h}h</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </View>

            {/* API Key */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Claude API Key</Text>
              <Text style={styles.settingsHint}>For smarter responses.</Text>
              <TextInput
                style={styles.settingsInput}
                value={apiKey}
                onChangeText={setApiKey}
                placeholder="sk-ant-..."
                placeholderTextColor={COLORS.textDim}
                secureTextEntry
                autoCapitalize="none"
              />
            </View>

            {/* Memory */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>What Nero Remembers</Text>
              {memory.facts.name && <Text style={styles.memoryItem}>• Name: {memory.facts.name}</Text>}
              <Text style={styles.memoryItem}>• Conversations: {memory.facts.totalConversations}</Text>
              {memory.patterns.knownStruggles.length > 0 && (
                <>
                  <Text style={styles.memorySubhead}>Struggles:</Text>
                  {memory.patterns.knownStruggles.map((s, i) => (
                    <Text key={i} style={styles.memoryItem}>• {s.slice(0, 50)}...</Text>
                  ))}
                </>
              )}
            </View>

            {/* Actions */}
            <View style={styles.settingsSection}>
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
      {renderEnergyCheck()}
      {renderInsightsModal()}
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>Nero</Text>
            {syncEnabled && (
              <View style={[styles.syncIndicator, { 
                backgroundColor: syncStatus === 'synced' ? COLORS.accent : 
                                 syncStatus === 'syncing' ? COLORS.warning : COLORS.textDim 
              }]} />
            )}
          </View>
          <View style={styles.headerRight}>
            {currentEnergy && (
              <TouchableOpacity onPress={() => setShowEnergyCheck(true)} style={styles.energyBadge}>
                <View style={[styles.energyBadgeDot, { backgroundColor: ENERGY_COLORS[currentEnergy.level - 1] }]} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowSettings(true)} style={styles.settingsIcon}>
              <Text style={styles.settingsIconText}>⚙</Text>
            </TouchableOpacity>
          </View>
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
              style={[styles.messageBubble, message.role === 'user' ? styles.userBubble : styles.neroBubble]}
            >
              <Text style={[styles.messageText, message.role === 'user' ? styles.userText : styles.neroText]}>
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
  container: { flex: 1, backgroundColor: COLORS.bg },
  center: { justifyContent: 'center', alignItems: 'center' },
  keyboardView: { flex: 1 },
  loadingText: { color: COLORS.textMuted, marginTop: 12, fontSize: 14 },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerTitle: { fontSize: 20, fontWeight: '600', color: COLORS.text },
  syncIndicator: { width: 8, height: 8, borderRadius: 4 },
  settingsIcon: { padding: 8 },
  settingsIconText: { fontSize: 20, color: COLORS.textMuted },
  energyBadge: { padding: 8 },
  energyBadgeDot: { width: 12, height: 12, borderRadius: 6 },

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

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  
  // Energy Check
  energyCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 },
  energyTitle: { color: COLORS.text, fontSize: 20, fontWeight: '600', textAlign: 'center', marginBottom: 20 },
  energyLevels: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  energyLevel: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  energyLevelText: { color: COLORS.text, fontSize: 24, fontWeight: '700' },
  energyLevelLabel: { color: COLORS.text, fontSize: 10, marginTop: 4, opacity: 0.9 },
  moodSection: { marginTop: 24 },
  moodTitle: { color: COLORS.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 12 },
  moodOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  moodOption: { backgroundColor: COLORS.surfaceLight, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20 },
  moodOptionText: { color: COLORS.text, fontSize: 14 },
  skipButton: { marginTop: 20, alignItems: 'center' },
  skipButtonText: { color: COLORS.textDim, fontSize: 14 },

  // Insights Modal
  insightsCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, maxHeight: '70%' },
  insightsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  insightsTitle: { color: COLORS.text, fontSize: 20, fontWeight: '600' },
  closeButton: { color: COLORS.textMuted, fontSize: 24, padding: 4 },
  insightsList: { flex: 1 },
  noInsights: { color: COLORS.textMuted, fontSize: 14, lineHeight: 22, textAlign: 'center', padding: 20 },
  insightItem: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16, marginBottom: 12, overflow: 'hidden' },
  insightConfidence: { position: 'absolute', top: 0, left: 0, height: 3, backgroundColor: COLORS.primary },
  insightText: { color: COLORS.text, fontSize: 14, lineHeight: 20 },
  insightType: { color: COLORS.textDim, fontSize: 12, marginTop: 8, textTransform: 'capitalize' },

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
  settingsSection: { marginBottom: 32 },
  settingsLabel: { fontSize: 14, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 },
  settingsHint: { fontSize: 14, color: COLORS.textDim, marginBottom: 12 },
  settingsInput: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, color: COLORS.text, fontSize: 16 },
  settingsButton: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 12 },
  settingsButtonText: { color: COLORS.text, fontSize: 16 },
  memoryItem: { color: COLORS.textMuted, fontSize: 14, marginBottom: 6, paddingLeft: 8 },
  memorySubhead: { color: COLORS.textDim, fontSize: 13, marginTop: 12, marginBottom: 6 },
  deviceIdText: { color: COLORS.textDim, fontSize: 12, marginTop: 8 },
  
  currentEnergyDisplay: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surface, borderRadius: 12, padding: 16 },
  energyDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  currentEnergyText: { color: COLORS.text, fontSize: 16, flex: 1 },
  updateText: { color: COLORS.textDim, fontSize: 12 },

  commitmentItem: { backgroundColor: COLORS.surface, borderRadius: 12, padding: 14, marginBottom: 8 },
  commitmentText: { color: COLORS.text, fontSize: 14 },
  commitmentTime: { color: COLORS.textDim, fontSize: 12, marginTop: 4 },
  
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
});
