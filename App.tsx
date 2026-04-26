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

interface FocusSession {
  id: string;
  taskId?: string;
  taskDescription?: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  completed: boolean;
  checkInCount: number;
  timeOfDay: string;
  dayOfWeek: number;
}

interface FocusStats {
  totalSessions: number;
  totalFocusTime: number;
  completionRate: number;
  avgSessionLength: number;
  bestTimeOfDay: string | null;
  bestDayOfWeek: number | null;
  longestSession: number;
  currentStreak: number;
}

interface Nudge {
  id: string;
  message: string;
  scheduledFor: string;
  type: string;
}

// ============ NEW FEATURE TYPES ============

// Feature 1: Time Blocking / Schedule Integration
interface TimeBlock {
  id: string;
  title: string;
  startTime: string;
  endTime: string;
  taskId?: string;
  isRecurring?: boolean;
  recurringDays?: number[];
}

// Feature 2: Accountability Partners
interface AccountabilityPartner {
  id: string;
  name: string;
  email?: string;
  shareProgress: boolean;
  weeklyDigest: boolean;
  lastNotified?: string;
}

// Feature 3: Task Decomposition
interface Subtask {
  id: string;
  parentTaskId: string;
  description: string;
  status: 'open' | 'completed';
  order: number;
}

// Feature 4: Emotion/Context Tagging
interface EnergyContext {
  id: string;
  energyLogId?: string;
  context: string;
  tags: string[];
  timestamp: string;
}

// Feature 8: Waiting Mode Support
interface WaitingItem {
  id: string;
  description: string;
  waitingFor: string;
  createdAt: string;
  expectedBy?: string;
  status: 'waiting' | 'received' | 'expired';
  lastCheckedAt?: string;
}

// Feature 10: Medication/Routine Tracking
interface MedicationReminder {
  id: string;
  name: string;
  times: string[];
  days: number[];
  enabled: boolean;
  lastTaken?: string;
}

interface RoutineItem {
  id: string;
  name: string;
  time: string;
  days: number[];
  enabled: boolean;
  streak: number;
  lastCompleted?: string;
}

// Feature 9: Weekly/Monthly Reflection
interface ReflectionData {
  period: 'week' | 'month';
  startDate: string;
  endDate: string;
  tasksCompleted: number;
  totalFocusTime: number;
  avgEnergy: number;
  topPatterns: string[];
  wins: string[];
  struggles: string[];
}

// Feature 14: Parallel Task Support
interface ActiveTask {
  taskId: string;
  description: string;
  startedAt: string;
  status: 'active' | 'paused';
}

// ============ FEATURES 16-35 TYPES ============

// Feature 16: Where Was I Recovery Mode
interface SessionContext {
  lastActiveTask?: string;
  lastTopic?: string;
  lastActivity: string;
  awayDuration: number;
}

// Feature 17: Decision Fatigue Helper
interface DecisionRequest {
  options: string[];
  context?: string;
  timestamp: string;
}

// Feature 18: Dopamine Menu
interface DopamineActivity {
  id: string;
  name: string;
  category: 'movement' | 'sensory' | 'social' | 'creative' | 'rest';
  duration: number; // minutes
  lastUsed?: string;
  effectiveness?: number; // 1-5
}

// Feature 20: Emotional Regulation
interface EmotionalState {
  emotion: string;
  intensity: number; // 1-5
  timestamp: string;
  triggers?: string[];
  copingUsed?: string;
}

// Feature 22: Impulse Delay Buffer
interface DelayedImpulse {
  id: string;
  description: string;
  category: 'purchase' | 'decision' | 'action';
  createdAt: string;
  delayUntil: string;
  status: 'waiting' | 'approved' | 'dismissed';
  estimatedCost?: number;
}

// Feature 23: Social Battery
interface SocialInteraction {
  id: string;
  type: 'meeting' | 'call' | 'in-person' | 'message';
  duration: number; // minutes
  energyCost: number; // 1-5
  timestamp: string;
  notes?: string;
}

// Feature 25: Object Permanence / Relationship Tracking
interface RelationshipReminder {
  id: string;
  personName: string;
  relationship: string;
  lastContact?: string;
  preferredFrequency: number; // days
  notes?: string;
}

// Feature 26: Flexible Routines
interface FlexibleRoutine {
  id: string;
  name: string;
  timeOfDay: 'morning' | 'evening';
  items: RoutineCheckItem[];
  minItemsForSuccess: number; // "good enough" threshold
  streak: number;
  lastCompleted?: string;
}

interface RoutineCheckItem {
  id: string;
  name: string;
  optional: boolean;
  completed: boolean;
}

// Feature 28: Interest-Based Task Tracking
interface TaskCompletionPattern {
  taskKeywords: string[];
  avgCompletionTime: number;
  completionRate: number;
  energyWhenCompleted: number;
}

// Feature 29: Deadline Scaffolding
interface Milestone {
  id: string;
  parentTaskId: string;
  description: string;
  dueDate: string;
  status: 'pending' | 'completed';
}

// Feature 31: Quiet Hours
interface QuietHours {
  enabled: boolean;
  startTime: string;
  endTime: string;
  days: number[];
  allowUrgent: boolean;
}

// Feature 32: Win Journal
interface WinEntry {
  id: string;
  content: string;
  timestamp: string;
  category?: 'task' | 'personal' | 'health' | 'social';
}

// Feature 35: Commitment Device
interface Commitment {
  id: string;
  description: string;
  deadline: string;
  witness?: string; // accountability partner name
  status: 'active' | 'kept' | 'broken';
  createdAt: string;
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
  quickAdd: '#ec4899',
  // New feature colors
  crisis: '#dc2626',
  calm: '#06b6d4',
  waiting: '#f59e0b',
  reflection: '#a855f7',
  medication: '#14b8a6',
  motivation: '#f97316',
  decompose: '#3b82f6',
  emotion: '#ec4899',
  transition: '#8b5cf6',
  hyperfocus: '#eab308',
  rsd: '#f472b6',
  parallel: '#06b6d4',
  celebration: '#fbbf24',
  // Features 16-35 colors
  recovery: '#38bdf8',
  decision: '#a78bfa',
  dopamine: '#fb923c',
  timeBlinds: '#facc15',
  emotional: '#f472b6',
  procrastination: '#94a3b8',
  impulse: '#f43f5e',
  social: '#2dd4bf',
  rumination: '#c084fc',
  relationship: '#fb7185',
  routine: '#4ade80',
  shame: '#fda4af',
  interest: '#60a5fa',
  deadline: '#f87171',
  accountability: '#34d399',
  quiet: '#475569',
  wins: '#fcd34d',
  overload: '#64748b',
  swap: '#22d3ee',
  commitment: '#e879f9',
};

const ENERGY_COLORS = [COLORS.energy1, COLORS.energy2, COLORS.energy3, COLORS.energy4, COLORS.energy5];
const ENERGY_LABELS = ['Struggling', 'Low', 'Okay', 'Good', 'Great'];
const MOOD_OPTIONS = ['rough', 'meh', 'okay', 'good', 'great'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

// Feature 4: Emotion Context Tags
const EMOTION_TAGS = ['tired', 'stressed', 'anxious', 'overwhelmed', 'sad', 'frustrated', 'unmotivated', 'scattered', 'restless', 'calm', 'hopeful', 'focused'];
const CONTEXT_TAGS = ['poor sleep', 'work stress', 'relationship', 'health', 'deadline', 'social drain', 'overstimulated', 'understimulated', 'hunger', 'pain', 'meds late', 'meds missed'];

// Feature 6: Hyperfocus Messages
const HYPERFOCUS_CHECK_INS = [
  "You've been in deep focus for a while. Remember to drink water.",
  "Amazing concentration! When did you last stretch?",
  "Still here. Have you eaten recently?",
  "Your focus is incredible right now. Quick body check - how are you physically?",
  "3 hours deep! Consider a 5-minute break for your eyes.",
];

// Feature 7: RSD Support Messages
const RSD_SUPPORT_MESSAGES = [
  "That sounds like it hit hard. Want to talk through it?",
  "It's okay to feel this way. The feeling is real even if the story isn't.",
  "Sometimes our brains make feedback feel bigger than it is. What actually happened?",
  "That stings. Let's separate what was said from what you're feeling.",
];

// Feature 11: External Motivation Prompts
const MOTIVATION_PROMPTS = [
  "One tiny step. What's the smallest thing you could do in 2 minutes?",
  "Let's make it easy. What would take almost no effort?",
  "Quick win time. What's something simple you could knock out?",
  "No pressure mode. Pick anything - even getting a glass of water counts.",
];

// Feature 12: Sensory Environment Options
const SENSORY_OPTIONS = {
  lighting: ['dim', 'bright', 'natural', 'warm'],
  sound: ['silence', 'white noise', 'music', 'ambient', 'nature sounds'],
  movement: ['sitting', 'standing', 'walking', 'fidgeting'],
  temperature: ['cool', 'warm', 'neutral'],
};

// Feature 15: Crisis Mode Breathing
const BREATHING_PATTERNS = {
  calm: { inhale: 4, hold: 4, exhale: 4 },
  ground: { inhale: 4, hold: 7, exhale: 8 },
  quick: { inhale: 2, hold: 2, exhale: 4 },
};

// Feature 13: Celebration Messages
const CELEBRATION_MESSAGES = [
  "Look at everything you did today!",
  "These wins matter. Every single one.",
  "You showed up. That's huge.",
  "Progress, not perfection. And you made progress.",
  "Your effort counts even when it doesn't feel like it.",
];

// ============ FEATURES 16-35 CONSTANTS ============

// Feature 16: Where Was I Recovery
const RECOVERY_MESSAGES = [
  "Welcome back! You were working on: ",
  "Hey, you're back! Last time you were focused on: ",
  "Good to see you! Before you left, you were: ",
];

// Feature 17: Decision Fatigue
const DECISION_PROMPTS = [
  "Decision fatigue is real. Let me pick for you.",
  "Too many choices? I've got you.",
  "Your brain is tired of deciding. Here's what to do: ",
];

// Feature 18: Dopamine Menu
const DEFAULT_DOPAMINE_ACTIVITIES: DopamineActivity[] = [
  { id: '1', name: 'Take a short walk', category: 'movement', duration: 10 },
  { id: '2', name: 'Listen to a favorite song', category: 'sensory', duration: 5 },
  { id: '3', name: 'Have a healthy snack', category: 'rest', duration: 5 },
  { id: '4', name: 'Do 10 jumping jacks', category: 'movement', duration: 2 },
  { id: '5', name: 'Text a friend', category: 'social', duration: 5 },
  { id: '6', name: 'Doodle for 5 minutes', category: 'creative', duration: 5 },
  { id: '7', name: 'Step outside for fresh air', category: 'sensory', duration: 5 },
  { id: '8', name: 'Watch one funny video', category: 'rest', duration: 3 },
  { id: '9', name: 'Stretch your body', category: 'movement', duration: 5 },
  { id: '10', name: 'Play with a fidget toy', category: 'sensory', duration: 5 },
];

// Feature 19: Time Blindness Anchors
const TIME_ANCHOR_MESSAGES = [
  "Quick time check: it's been {duration} since you started.",
  "Time anchor: {duration} have passed.",
  "Gentle reminder: you've been at this for {duration}.",
];

// Feature 20: Emotional Regulation
const EMOTION_OPTIONS = ['anxious', 'frustrated', 'sad', 'angry', 'overwhelmed', 'numb', 'restless', 'hopeful', 'calm', 'excited'];
const COPING_STRATEGIES = {
  anxious: ['Deep breathing', 'Ground yourself (5-4-3-2-1)', 'Write worries down', 'Talk to someone'],
  frustrated: ['Take a break', 'Physical movement', 'Vent (write or talk)', 'Change tasks'],
  sad: ['Be gentle with yourself', 'Reach out to someone', 'Do something comforting', 'It\'s okay to rest'],
  angry: ['Step away', 'Physical release', 'Write it out', 'Wait before responding'],
  overwhelmed: ['One thing at a time', 'Breathe', 'Simplify', 'Ask for help'],
  numb: ['Gentle movement', 'Sensory input', 'Connect with someone', 'Don\'t force it'],
  restless: ['Move your body', 'Change scenery', 'Fidget freely', 'Channel into task'],
  hopeful: ['Capture this feeling', 'Use momentum', 'Share with someone', 'Plan something'],
  calm: ['Enjoy it', 'Do meaningful work', 'Reflect', 'Help someone'],
  excited: ['Channel it', 'Write ideas down', 'Share the energy', 'Start something'],
};

// Feature 21: Procrastination Buddy
const PROCRASTINATION_BLOCKERS = [
  { label: 'Too big/overwhelming', suggestion: "Let's break it into tiny pieces" },
  { label: 'Boring/uninteresting', suggestion: "Can we make it more fun or pair it with something?" },
  { label: 'Unclear what to do', suggestion: "Let's figure out the first concrete step" },
  { label: 'Scared of failing', suggestion: "Done is better than perfect. What's the minimum?" },
  { label: 'Waiting for motivation', suggestion: "Motivation comes after starting. Just 2 minutes?" },
  { label: "Don't know why it matters", suggestion: "What happens if you don't do it? Is that okay?" },
];

// Feature 24: Rumination Detection
const RUMINATION_PATTERNS = [
  /i keep thinking about/i, /can't stop thinking/i, /over and over/i,
  /why did i/i, /should have/i, /what if i had/i, /i always/i, /i never/i,
  /everyone thinks/i, /nobody understands/i, /it's always/i,
];

// Feature 27: Shame Spiral Detection
const SHAME_PATTERNS = [
  /i'm so stupid/i, /i'm the worst/i, /i can't do anything/i, /what's wrong with me/i,
  /i should be able to/i, /why can't i just/i, /everyone else can/i, /i'm broken/i,
  /i'm a mess/i, /i'm useless/i, /i hate myself/i, /i'm such a/i,
];

const SHAME_RESPONSES = [
  "Hey, that's a lot of 'should'. ADHD brains work differently, not wrong.",
  "I hear you being hard on yourself. What would you say to a friend?",
  "Those thoughts feel true but they're not facts. Let's slow down.",
  "Your brain is being mean to you right now. That's not fair or accurate.",
];

// Feature 30: Just Watch Me - Accountability Modes
const ACCOUNTABILITY_MODES = [
  { id: 'silent', name: 'Silent presence', description: "I'm just here. No check-ins." },
  { id: 'gentle', name: 'Gentle check-ins', description: 'Occasional "how\'s it going?"' },
  { id: 'active', name: 'Active accountability', description: 'Regular progress updates' },
];

// Feature 32: Win Journal Prompts
const WIN_JOURNAL_PROMPTS = [
  "What went well today?",
  "What's one thing you're proud of?",
  "What did you do that was hard?",
  "How did you take care of yourself?",
  "What made you smile today?",
];

// Feature 34: Task Swap Suggestions
const TASK_SWAP_MESSAGES = [
  "Stuck on this one? Maybe try something else for a bit.",
  "Not feeling it? Here's another option:",
  "Sometimes a different task unsticks the brain:",
];

const NERO_SYSTEM_PROMPT = `You are Nero, an AI companion for someone with ADHD. Warm, direct, no judgment.

RULES:
- Short responses. One question max.
- No bullet points or lists.
- Casual like a friend.
- When in body doubling mode, be a calm presence.
- Detect emotional distress and RSD (rejection sensitive dysphoria) signals.
- Notice when someone seems overwhelmed and offer crisis support.
- Help break down tasks when they feel too big.

BODY DOUBLING MODE:
When active, you're just there. Like a friend sitting nearby while they work.
- Don't over-check
- Celebrate small wins
- If they seem stuck, gently ask what's blocking them
- Never guilt or pressure

CRISIS MODE:
When someone is overwhelmed or in emotional distress:
- Be calm and grounding
- Focus on breathing and the present moment
- Everything else can wait
- No productivity pressure

RSD SUPPORT:
When detecting rejection sensitivity:
- Validate the feeling without amplifying it
- Help separate emotion from facts
- Gently reality-check without dismissing

TASK DECOMPOSITION:
When a task feels too big:
- Ask "What's the first tiny step?"
- Break it down until it feels doable
- One piece at a time`;

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

const formatDurationShort = (ms: number) => {
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  return `${hours}h${mins % 60 > 0 ? ` ${mins % 60}m` : ''}`;
};

const getTaskAge = (timestamp: string): number => (Date.now() - new Date(timestamp).getTime()) / (1000 * 60 * 60 * 24);

// Feature 6: Hyperfocus Detection
const detectHyperfocus = (sessionStartTime: string): { isHyperfocusing: boolean; duration: number } => {
  const duration = Date.now() - new Date(sessionStartTime).getTime();
  const hours = duration / (1000 * 60 * 60);
  return { isHyperfocusing: hours >= 2, duration };
};

// Feature 7: RSD Detection
const detectRSD = (message: string): boolean => {
  const rsdPatterns = [
    /they hate me/i, /i'm terrible/i, /i ruined/i, /everyone thinks/i,
    /i can't do anything right/i, /they're mad at me/i, /i'm a failure/i,
    /nobody likes me/i, /i messed up/i, /i'm so stupid/i, /rejected/i,
    /they don't want me/i, /i'm not good enough/i, /i disappointed/i,
  ];
  return rsdPatterns.some(p => p.test(message));
};

// Feature 15: Crisis Detection
const detectCrisis = (message: string): boolean => {
  const crisisPatterns = [
    /i can't do this/i, /overwhelmed/i, /falling apart/i, /too much/i,
    /can't breathe/i, /panicking/i, /shutting down/i, /everything is wrong/i,
    /i give up/i, /i can't cope/i, /meltdown/i, /breaking down/i,
  ];
  return crisisPatterns.some(p => p.test(message));
};

// Feature 5: Transition Detection
const needsTransitionSupport = (sessionDuration: number, checkInCount: number): boolean => {
  const hours = sessionDuration / (1000 * 60 * 60);
  return hours >= 1 && checkInCount >= 3;
};

// Feature 13: Generate Done List Message
const generateDoneListMessage = (completed: Task[], focusTime: number, name?: string): string => {
  const greeting = name ? `${name}, ` : '';
  const intro = CELEBRATION_MESSAGES[Math.floor(Math.random() * CELEBRATION_MESSAGES.length)];

  let message = `${greeting}${intro}\n\n`;

  if (completed.length > 0) {
    message += `Today you completed:\n`;
    completed.slice(0, 5).forEach(t => { message += `• ${t.description}\n`; });
    if (completed.length > 5) message += `• ...and ${completed.length - 5} more!\n`;
  }

  if (focusTime > 0) {
    message += `\nFocus time: ${formatDuration(focusTime)}`;
  }

  if (completed.length === 0 && focusTime === 0) {
    message = `${greeting}You showed up today. That counts. Tomorrow is a new day.`;
  }

  return message;
};

// Feature 1: Check upcoming time blocks
const getUpcomingTimeBlock = (blocks: TimeBlock[]): TimeBlock | null => {
  const now = new Date();
  const today = now.getDay();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  for (const block of blocks) {
    const [hours, mins] = block.startTime.split(':').map(Number);
    const blockTime = hours * 60 + mins;
    const timeDiff = blockTime - currentTime;

    if (block.isRecurring && block.recurringDays && !block.recurringDays.includes(today)) continue;

    if (timeDiff > 0 && timeDiff <= 30) return block;
  }
  return null;
};

// Feature 9: Weekly Stats Summary
const generateWeeklyInsight = (data: ReflectionData): string => {
  const insights: string[] = [];

  if (data.tasksCompleted > 0) {
    insights.push(`You completed ${data.tasksCompleted} task${data.tasksCompleted > 1 ? 's' : ''} this ${data.period}.`);
  }

  if (data.totalFocusTime > 0) {
    insights.push(`${formatDuration(data.totalFocusTime)} of focused work.`);
  }

  if (data.avgEnergy > 0) {
    const energyWord = data.avgEnergy >= 4 ? 'good' : data.avgEnergy >= 3 ? 'okay' : 'challenging';
    insights.push(`Average energy was ${energyWord} (${data.avgEnergy}/5).`);
  }

  if (data.wins.length > 0) {
    insights.push(`Biggest wins: ${data.wins.slice(0, 3).join(', ')}`);
  }

  return insights.join(' ');
};

// ============ FEATURES 16-35 HELPERS ============

// Feature 16: Where Was I - Calculate away duration
const calculateAwayDuration = (lastSeen: string): number => {
  return (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60); // minutes
};

const shouldShowRecovery = (lastSeen: string): boolean => {
  const awayMinutes = calculateAwayDuration(lastSeen);
  return awayMinutes >= 30; // Show recovery if away 30+ minutes
};

// Feature 17: Decision Helper - Random picker
const pickRandomTask = (tasks: Task[]): Task | null => {
  if (tasks.length === 0) return null;
  return tasks[Math.floor(Math.random() * tasks.length)];
};

// Feature 19: Time Blindness - Format session duration
const formatTimeAnchor = (startTime: string): string => {
  const duration = Date.now() - new Date(startTime).getTime();
  const minutes = Math.floor(duration / 60000);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} and ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
  }
  return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
};

// Feature 23: Social Battery Calculator
const calculateSocialBattery = (interactions: SocialInteraction[]): number => {
  const today = new Date().setHours(0, 0, 0, 0);
  const todayInteractions = interactions.filter(i => new Date(i.timestamp).setHours(0, 0, 0, 0) === today);
  const totalDrain = todayInteractions.reduce((sum, i) => sum + i.energyCost, 0);
  const maxBattery = 10;
  return Math.max(0, maxBattery - totalDrain);
};

// Feature 24: Rumination Detection
const detectRumination = (message: string, recentMessages: Message[]): boolean => {
  // Check for rumination patterns in current message
  const hasPattern = RUMINATION_PATTERNS.some(p => p.test(message));
  if (!hasPattern) return false;

  // Check if similar content appeared recently (last 5 messages)
  const recentUserMessages = recentMessages.filter(m => m.role === 'user').slice(-5);
  const messageWords = message.toLowerCase().split(/\s+/);

  let repetitionCount = 0;
  for (const recent of recentUserMessages) {
    const recentWords = recent.content.toLowerCase().split(/\s+/);
    const overlap = messageWords.filter(w => recentWords.includes(w) && w.length > 4).length;
    if (overlap >= 3) repetitionCount++;
  }

  return repetitionCount >= 2;
};

// Feature 25: Check if relationship needs contact
const needsContact = (reminder: RelationshipReminder): boolean => {
  if (!reminder.lastContact) return true;
  const daysSince = (Date.now() - new Date(reminder.lastContact).getTime()) / (1000 * 60 * 60 * 24);
  return daysSince >= reminder.preferredFrequency;
};

// Feature 27: Shame Spiral Detection
const detectShameSpiral = (message: string): boolean => {
  return SHAME_PATTERNS.some(p => p.test(message));
};

// Feature 28: Interest-based task matching
const findInterestBasedTask = (tasks: Task[], completedTasks: Task[]): Task | null => {
  // Analyze recently completed tasks for patterns
  const recentCompleted = completedTasks.slice(0, 10);
  const completedKeywords = new Set<string>();

  recentCompleted.forEach(t => {
    t.description.toLowerCase().split(/\s+/).forEach(word => {
      if (word.length > 3) completedKeywords.add(word);
    });
  });

  // Find open tasks with similar keywords
  const matchingTasks = tasks.filter(t => {
    const taskWords = t.description.toLowerCase().split(/\s+/);
    return taskWords.some(w => completedKeywords.has(w));
  });

  return matchingTasks.length > 0 ? matchingTasks[0] : null;
};

// Feature 29: Auto-generate milestones for deadline
const generateMilestones = (task: Task, deadline: string): Milestone[] => {
  const now = Date.now();
  const deadlineTime = new Date(deadline).getTime();
  const totalTime = deadlineTime - now;
  const milestones: Milestone[] = [];

  if (totalTime <= 0) return milestones;

  // Create 3 milestones: 25%, 50%, 75% of time
  const intervals = [0.25, 0.5, 0.75];
  const labels = ['Start & outline', 'Main work', 'Review & polish'];

  intervals.forEach((interval, i) => {
    milestones.push({
      id: generateId(),
      parentTaskId: task.id,
      description: labels[i],
      dueDate: new Date(now + totalTime * interval).toISOString(),
      status: 'pending',
    });
  });

  return milestones;
};

// Feature 31: Check if currently in quiet hours
const isQuietHours = (quietHours: QuietHours): boolean => {
  if (!quietHours.enabled) return false;

  const now = new Date();
  const currentDay = now.getDay();
  const currentTime = now.getHours() * 60 + now.getMinutes();

  if (!quietHours.days.includes(currentDay)) return false;

  const [startH, startM] = quietHours.startTime.split(':').map(Number);
  const [endH, endM] = quietHours.endTime.split(':').map(Number);
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    return currentTime >= startMinutes && currentTime < endMinutes;
  } else {
    // Overnight quiet hours
    return currentTime >= startMinutes || currentTime < endMinutes;
  }
};

// Feature 34: Find alternative task for swapping
const findSwapTask = (currentTask: Task | null, openTasks: Task[]): Task | null => {
  if (!currentTask) return pickRandomTask(openTasks);
  const alternatives = openTasks.filter(t => t.id !== currentTask.id);
  return pickRandomTask(alternatives);
};

// Feature 35: Check for overdue commitments
const getOverdueCommitments = (commitments: Commitment[]): Commitment[] => {
  const now = new Date().toISOString();
  return commitments.filter(c => c.status === 'active' && c.deadline < now);
};

// ============ FOCUS ANALYTICS ENGINE ============
const FocusAnalytics = {
  calculateStats: (sessions: FocusSession[]): FocusStats => {
    if (sessions.length === 0) {
      return { totalSessions: 0, totalFocusTime: 0, completionRate: 0, avgSessionLength: 0, bestTimeOfDay: null, bestDayOfWeek: null, longestSession: 0, currentStreak: 0 };
    }

    const totalSessions = sessions.length;
    const totalFocusTime = sessions.reduce((sum, s) => sum + s.durationMs, 0);
    const completedSessions = sessions.filter(s => s.completed).length;
    const completionRate = Math.round((completedSessions / totalSessions) * 100);
    const avgSessionLength = totalFocusTime / totalSessions;
    const longestSession = Math.max(...sessions.map(s => s.durationMs));

    // Best time of day
    const byTimeOfDay: { [key: string]: { count: number; completed: number; duration: number } } = {};
    sessions.forEach(s => {
      if (!byTimeOfDay[s.timeOfDay]) byTimeOfDay[s.timeOfDay] = { count: 0, completed: 0, duration: 0 };
      byTimeOfDay[s.timeOfDay].count++;
      if (s.completed) byTimeOfDay[s.timeOfDay].completed++;
      byTimeOfDay[s.timeOfDay].duration += s.durationMs;
    });
    
    let bestTimeOfDay: string | null = null;
    let bestTimeScore = 0;
    for (const [time, data] of Object.entries(byTimeOfDay)) {
      const score = (data.completed / data.count) * 0.5 + (data.duration / (data.count * 1800000)) * 0.5;
      if (score > bestTimeScore) { bestTimeScore = score; bestTimeOfDay = time; }
    }

    // Best day of week
    const byDayOfWeek: { [key: number]: { count: number; completed: number; duration: number } } = {};
    sessions.forEach(s => {
      if (!byDayOfWeek[s.dayOfWeek]) byDayOfWeek[s.dayOfWeek] = { count: 0, completed: 0, duration: 0 };
      byDayOfWeek[s.dayOfWeek].count++;
      if (s.completed) byDayOfWeek[s.dayOfWeek].completed++;
      byDayOfWeek[s.dayOfWeek].duration += s.durationMs;
    });

    let bestDayOfWeek: number | null = null;
    let bestDayScore = 0;
    for (const [day, data] of Object.entries(byDayOfWeek)) {
      const score = (data.completed / data.count) * 0.5 + (data.duration / (data.count * 1800000)) * 0.5;
      if (score > bestDayScore) { bestDayScore = score; bestDayOfWeek = parseInt(day); }
    }

    // Current streak (consecutive days with completed sessions)
    const completedDays = new Set<number>();
    sessions.forEach(s => {
      if (s.completed) completedDays.add(new Date(s.endedAt).setHours(0, 0, 0, 0));
    });
    let currentStreak = 0;
    if (completedDays.size > 0) {
      const cursor = new Date();
      cursor.setHours(0, 0, 0, 0);
      // Allow the streak to start either today or yesterday so a missed today doesn't reset it.
      if (!completedDays.has(cursor.getTime())) cursor.setDate(cursor.getDate() - 1);
      while (completedDays.has(cursor.getTime())) {
        currentStreak++;
        cursor.setDate(cursor.getDate() - 1);
      }
    }

    return { totalSessions, totalFocusTime, completionRate, avgSessionLength, bestTimeOfDay, bestDayOfWeek, longestSession, currentStreak };
  },

  generateInsight: (stats: FocusStats, name?: string): string | null => {
    if (stats.totalSessions < 3) return null;
    
    const insights: string[] = [];
    
    if (stats.bestTimeOfDay && stats.totalSessions >= 5) {
      insights.push(`You focus best in the ${stats.bestTimeOfDay}.`);
    }
    
    if (stats.bestDayOfWeek !== null && stats.totalSessions >= 7) {
      insights.push(`${DAY_NAMES[stats.bestDayOfWeek]}s are your most productive day.`);
    }
    
    if (stats.completionRate >= 70) {
      insights.push(`${stats.completionRate}% completion rate. You finish what you start.`);
    }
    
    if (stats.currentStreak >= 3) {
      insights.push(`${stats.currentStreak} day streak. Momentum building.`);
    }
    
    if (stats.longestSession > 3600000) {
      insights.push(`Your longest focus was ${formatDurationShort(stats.longestSession)}. Deep work is possible.`);
    }

    return insights.length > 0 ? insights[Math.floor(Math.random() * insights.length)] : null;
  }
};

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
  // getVoices() returns [] until voices are loaded asynchronously; wait for the
  // voiceschanged event the first time so the preferred voice actually gets picked.
  getVoicesAsync: (): Promise<any[]> => {
    return new Promise(resolve => {
      const synth = VoiceService.synthesis;
      if (!synth) { resolve([]); return; }
      const existing = synth.getVoices();
      if (existing && existing.length > 0) { resolve(existing); return; }
      const handler = () => {
        synth.removeEventListener?.('voiceschanged', handler);
        resolve(synth.getVoices() || []);
      };
      synth.addEventListener?.('voiceschanged', handler);
      // Safety net: some browsers never fire voiceschanged.
      setTimeout(() => {
        synth.removeEventListener?.('voiceschanged', handler);
        resolve(synth.getVoices() || []);
      }, 1000);
    });
  },
  speak: async (text: string, onEnd?: () => void) => {
    const synth = VoiceService.synthesis;
    if (!synth) { onEnd?.(); return; }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    const voices = await VoiceService.getVoicesAsync();
    const voice = voices.find((v: any) => v.name.includes('Samantha')) || voices.find((v: any) => v.lang.startsWith('en'));
    if (voice) u.voice = voice;
    let finished = false;
    const finish = () => { if (finished) return; finished = true; onEnd?.(); };
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
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

  async saveFocusSession(session: FocusSession): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_focus_sessions').insert({
      id: session.id,
      user_id: this.userId,
      task_id: session.taskId,
      task_description: session.taskDescription,
      started_at: session.startedAt,
      ended_at: session.endedAt,
      duration_ms: session.durationMs,
      completed: session.completed,
      check_in_count: session.checkInCount,
      time_of_day: session.timeOfDay,
      day_of_week: session.dayOfWeek,
    });
  },

  async getFocusSessions(days: number = 30): Promise<FocusSession[]> {
    if (!this.userId) return [];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('nero_focus_sessions').select('*').eq('user_id', this.userId).gte('started_at', since).order('started_at', { ascending: false });
    return (data || []).map(s => ({
      id: s.id,
      taskId: s.task_id,
      taskDescription: s.task_description,
      startedAt: s.started_at,
      endedAt: s.ended_at,
      durationMs: s.duration_ms,
      completed: s.completed,
      checkInCount: s.check_in_count,
      timeOfDay: s.time_of_day,
      dayOfWeek: s.day_of_week,
    }));
  },

  async getPendingNudges(): Promise<Nudge[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_nudges').select('*').eq('user_id', this.userId).is('sent_at', null).is('dismissed_at', null).lte('scheduled_for', new Date().toISOString());
    return (data || []).map(n => ({ id: n.id, message: n.message, scheduledFor: n.scheduled_for, type: n.nudge_type }));
  },
  
  async markNudgeSent(nudgeId: string): Promise<void> { await supabase.from('nero_nudges').update({ sent_at: new Date().toISOString() }).eq('id', nudgeId); },
  async dismissNudge(nudgeId: string): Promise<void> { await supabase.from('nero_nudges').update({ dismissed_at: new Date().toISOString() }).eq('id', nudgeId); },
  async clearMessages(): Promise<void> { if (!this.userId) return; await supabase.from('nero_messages').delete().eq('user_id', this.userId); },

  // Feature 1: Time Blocks
  async getTimeBlocks(): Promise<TimeBlock[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_time_blocks').select('*').eq('user_id', this.userId).order('start_time', { ascending: true });
    return (data || []).map(t => ({ id: t.id, title: t.title, startTime: t.start_time, endTime: t.end_time, taskId: t.task_id, isRecurring: t.is_recurring, recurringDays: t.recurring_days }));
  },

  async saveTimeBlock(block: TimeBlock): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_time_blocks').upsert({ id: block.id, user_id: this.userId, title: block.title, start_time: block.startTime, end_time: block.endTime, task_id: block.taskId, is_recurring: block.isRecurring, recurring_days: block.recurringDays });
  },

  async deleteTimeBlock(blockId: string): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_time_blocks').delete().eq('id', blockId);
  },

  // Feature 3: Subtasks
  async getSubtasks(parentTaskId: string): Promise<Subtask[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_subtasks').select('*').eq('parent_task_id', parentTaskId).order('order_num', { ascending: true });
    return (data || []).map(s => ({ id: s.id, parentTaskId: s.parent_task_id, description: s.description, status: s.status, order: s.order_num }));
  },

  async saveSubtask(subtask: Subtask): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_subtasks').upsert({ id: subtask.id, user_id: this.userId, parent_task_id: subtask.parentTaskId, description: subtask.description, status: subtask.status, order_num: subtask.order });
  },

  async completeSubtask(subtaskId: string): Promise<void> {
    await supabase.from('nero_subtasks').update({ status: 'completed' }).eq('id', subtaskId);
  },

  // Feature 4: Emotion Context
  async logEnergyContext(context: EnergyContext): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_energy_context').insert({ id: context.id, user_id: this.userId, energy_log_id: context.energyLogId, context: context.context, tags: context.tags, created_at: context.timestamp });
  },

  async getEnergyContexts(days: number = 14): Promise<EnergyContext[]> {
    if (!this.userId) return [];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('nero_energy_context').select('*').eq('user_id', this.userId).gte('created_at', since).order('created_at', { ascending: false });
    return (data || []).map(c => ({ id: c.id, energyLogId: c.energy_log_id, context: c.context, tags: c.tags || [], timestamp: c.created_at }));
  },

  // Feature 8: Waiting Items
  async getWaitingItems(): Promise<WaitingItem[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_waiting_items').select('*').eq('user_id', this.userId).eq('status', 'waiting').order('created_at', { ascending: true });
    return (data || []).map(w => ({ id: w.id, description: w.description, waitingFor: w.waiting_for, createdAt: w.created_at, expectedBy: w.expected_by, status: w.status, lastCheckedAt: w.last_checked_at }));
  },

  async saveWaitingItem(item: WaitingItem): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_waiting_items').upsert({ id: item.id, user_id: this.userId, description: item.description, waiting_for: item.waitingFor, created_at: item.createdAt, expected_by: item.expectedBy, status: item.status, last_checked_at: item.lastCheckedAt });
  },

  async updateWaitingItemStatus(itemId: string, status: 'waiting' | 'received' | 'expired'): Promise<void> {
    await supabase.from('nero_waiting_items').update({ status, last_checked_at: new Date().toISOString() }).eq('id', itemId);
  },

  // Feature 10: Medication Reminders
  async getMedicationReminders(): Promise<MedicationReminder[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_medication_reminders').select('*').eq('user_id', this.userId).eq('enabled', true);
    return (data || []).map(m => ({ id: m.id, name: m.name, times: m.times || [], days: m.days || [0,1,2,3,4,5,6], enabled: m.enabled, lastTaken: m.last_taken }));
  },

  async saveMedicationReminder(reminder: MedicationReminder): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_medication_reminders').upsert({ id: reminder.id, user_id: this.userId, name: reminder.name, times: reminder.times, days: reminder.days, enabled: reminder.enabled, last_taken: reminder.lastTaken });
  },

  async markMedicationTaken(reminderId: string): Promise<void> {
    await supabase.from('nero_medication_reminders').update({ last_taken: new Date().toISOString() }).eq('id', reminderId);
  },

  // Feature 10: Routines
  async getRoutines(): Promise<RoutineItem[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_routines').select('*').eq('user_id', this.userId).eq('enabled', true);
    return (data || []).map(r => ({ id: r.id, name: r.name, time: r.time, days: r.days || [0,1,2,3,4,5,6], enabled: r.enabled, streak: r.streak || 0, lastCompleted: r.last_completed }));
  },

  async saveRoutine(routine: RoutineItem): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_routines').upsert({ id: routine.id, user_id: this.userId, name: routine.name, time: routine.time, days: routine.days, enabled: routine.enabled, streak: routine.streak, last_completed: routine.lastCompleted });
  },

  async markRoutineCompleted(routineId: string, streak: number): Promise<void> {
    await supabase.from('nero_routines').update({ last_completed: new Date().toISOString(), streak }).eq('id', routineId);
  },

  // Feature 9: Reflection Data
  async getReflectionData(period: 'week' | 'month'): Promise<ReflectionData | null> {
    if (!this.userId) return null;
    const now = new Date();
    const days = period === 'week' ? 7 : 30;
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

    const [tasksData, energyData, focusData] = await Promise.all([
      supabase.from('nero_tasks').select('*').eq('user_id', this.userId).eq('status', 'completed').gte('completed_at', startDate.toISOString()),
      supabase.from('nero_energy_logs').select('*').eq('user_id', this.userId).gte('created_at', startDate.toISOString()),
      supabase.from('nero_focus_sessions').select('*').eq('user_id', this.userId).gte('started_at', startDate.toISOString()),
    ]);

    const completedTasks = tasksData.data || [];
    const energyLogs = energyData.data || [];
    const sessions = focusData.data || [];

    const avgEnergy = energyLogs.length > 0 ? energyLogs.reduce((sum, e) => sum + e.energy_level, 0) / energyLogs.length : 0;
    const totalFocusTime = sessions.reduce((sum, s) => sum + (s.duration_ms || 0), 0);

    return {
      period,
      startDate: startDate.toISOString(),
      endDate: now.toISOString(),
      tasksCompleted: completedTasks.length,
      totalFocusTime,
      avgEnergy: Math.round(avgEnergy * 10) / 10,
      topPatterns: [],
      wins: completedTasks.slice(0, 5).map(t => t.description),
      struggles: [],
    };
  },

  // Feature 14: Active/Parallel Tasks
  async getActiveTasks(): Promise<ActiveTask[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_active_tasks').select('*').eq('user_id', this.userId).order('started_at', { ascending: false });
    return (data || []).map(t => ({ taskId: t.task_id, description: t.description, startedAt: t.started_at, status: t.status }));
  },

  async setTaskActive(taskId: string, description: string): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_active_tasks').upsert({ task_id: taskId, user_id: this.userId, description, started_at: new Date().toISOString(), status: 'active' });
  },

  async pauseTask(taskId: string): Promise<void> {
    await supabase.from('nero_active_tasks').update({ status: 'paused' }).eq('task_id', taskId);
  },

  async removeActiveTask(taskId: string): Promise<void> {
    await supabase.from('nero_active_tasks').delete().eq('task_id', taskId);
  },

  // ============ FEATURES 16-35 SERVICE METHODS ============

  // Feature 22: Impulse Delay Buffer
  async getDelayedImpulses(): Promise<DelayedImpulse[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_delayed_impulses').select('*').eq('user_id', this.userId).eq('status', 'waiting').order('delay_until', { ascending: true });
    return (data || []).map(i => ({ id: i.id, description: i.description, category: i.category, createdAt: i.created_at, delayUntil: i.delay_until, status: i.status, estimatedCost: i.estimated_cost }));
  },

  async saveDelayedImpulse(impulse: DelayedImpulse): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_delayed_impulses').upsert({ id: impulse.id, user_id: this.userId, description: impulse.description, category: impulse.category, created_at: impulse.createdAt, delay_until: impulse.delayUntil, status: impulse.status, estimated_cost: impulse.estimatedCost });
  },

  async updateImpulseStatus(impulseId: string, status: 'approved' | 'dismissed'): Promise<void> {
    await supabase.from('nero_delayed_impulses').update({ status }).eq('id', impulseId);
  },

  // Feature 23: Social Battery
  async logSocialInteraction(interaction: SocialInteraction): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_social_interactions').insert({ id: interaction.id, user_id: this.userId, type: interaction.type, duration: interaction.duration, energy_cost: interaction.energyCost, timestamp: interaction.timestamp, notes: interaction.notes });
  },

  async getSocialInteractions(days: number = 7): Promise<SocialInteraction[]> {
    if (!this.userId) return [];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('nero_social_interactions').select('*').eq('user_id', this.userId).gte('timestamp', since).order('timestamp', { ascending: false });
    return (data || []).map(s => ({ id: s.id, type: s.type, duration: s.duration, energyCost: s.energy_cost, timestamp: s.timestamp, notes: s.notes }));
  },

  // Feature 25: Relationship Reminders
  async getRelationshipReminders(): Promise<RelationshipReminder[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_relationship_reminders').select('*').eq('user_id', this.userId).order('last_contact', { ascending: true });
    return (data || []).map(r => ({ id: r.id, personName: r.person_name, relationship: r.relationship, lastContact: r.last_contact, preferredFrequency: r.preferred_frequency, notes: r.notes }));
  },

  async saveRelationshipReminder(reminder: RelationshipReminder): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_relationship_reminders').upsert({ id: reminder.id, user_id: this.userId, person_name: reminder.personName, relationship: reminder.relationship, last_contact: reminder.lastContact, preferred_frequency: reminder.preferredFrequency, notes: reminder.notes });
  },

  async markContactMade(reminderId: string): Promise<void> {
    await supabase.from('nero_relationship_reminders').update({ last_contact: new Date().toISOString() }).eq('id', reminderId);
  },

  // Feature 20: Emotional States
  async logEmotionalState(state: EmotionalState): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_emotional_states').insert({ user_id: this.userId, emotion: state.emotion, intensity: state.intensity, timestamp: state.timestamp, triggers: state.triggers, coping_used: state.copingUsed });
  },

  async getEmotionalHistory(days: number = 14): Promise<EmotionalState[]> {
    if (!this.userId) return [];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('nero_emotional_states').select('*').eq('user_id', this.userId).gte('timestamp', since).order('timestamp', { ascending: false });
    return (data || []).map(e => ({ emotion: e.emotion, intensity: e.intensity, timestamp: e.timestamp, triggers: e.triggers, copingUsed: e.coping_used }));
  },

  // Feature 32: Win Journal
  async saveWinEntry(entry: WinEntry): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_win_journal').insert({ id: entry.id, user_id: this.userId, content: entry.content, timestamp: entry.timestamp, category: entry.category });
  },

  async getWinEntries(days: number = 30): Promise<WinEntry[]> {
    if (!this.userId) return [];
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase.from('nero_win_journal').select('*').eq('user_id', this.userId).gte('timestamp', since).order('timestamp', { ascending: false });
    return (data || []).map(w => ({ id: w.id, content: w.content, timestamp: w.timestamp, category: w.category }));
  },

  // Feature 35: Commitments
  async getCommitments(): Promise<Commitment[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_commitments').select('*').eq('user_id', this.userId).eq('status', 'active').order('deadline', { ascending: true });
    return (data || []).map(c => ({ id: c.id, description: c.description, deadline: c.deadline, witness: c.witness, status: c.status, createdAt: c.created_at }));
  },

  async saveCommitment(commitment: Commitment): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_commitments').upsert({ id: commitment.id, user_id: this.userId, description: commitment.description, deadline: commitment.deadline, witness: commitment.witness, status: commitment.status, created_at: commitment.createdAt });
  },

  async updateCommitmentStatus(commitmentId: string, status: 'kept' | 'broken'): Promise<void> {
    await supabase.from('nero_commitments').update({ status }).eq('id', commitmentId);
  },

  // Feature 26: Flexible Routines
  async getFlexibleRoutines(): Promise<FlexibleRoutine[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_flexible_routines').select('*').eq('user_id', this.userId);
    return (data || []).map(r => ({ id: r.id, name: r.name, timeOfDay: r.time_of_day, items: r.items || [], minItemsForSuccess: r.min_items_for_success, streak: r.streak || 0, lastCompleted: r.last_completed }));
  },

  async saveFlexibleRoutine(routine: FlexibleRoutine): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_flexible_routines').upsert({ id: routine.id, user_id: this.userId, name: routine.name, time_of_day: routine.timeOfDay, items: routine.items, min_items_for_success: routine.minItemsForSuccess, streak: routine.streak, last_completed: routine.lastCompleted });
  },

  // Feature 29: Milestones
  async getMilestones(taskId: string): Promise<Milestone[]> {
    if (!this.userId) return [];
    const { data } = await supabase.from('nero_milestones').select('*').eq('parent_task_id', taskId).order('due_date', { ascending: true });
    return (data || []).map(m => ({ id: m.id, parentTaskId: m.parent_task_id, description: m.description, dueDate: m.due_date, status: m.status }));
  },

  async saveMilestone(milestone: Milestone): Promise<void> {
    if (!this.userId) return;
    await supabase.from('nero_milestones').upsert({ id: milestone.id, user_id: this.userId, parent_task_id: milestone.parentTaskId, description: milestone.description, due_date: milestone.dueDate, status: milestone.status });
  },
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
  // Anthropic requires the first message in `messages` to be a user turn.
  // The slice can start with the welcome (role=nero), or with a Nero reply
  // when the user just sent their second message early in the conversation,
  // which 400s the request and silently falls through to the fallback.
  const recent = messages.slice(-20);
  const firstUserIdx = recent.findIndex(m => m.role === 'user');
  const conversationHistory = (firstUserIdx === -1 ? [] : recent.slice(firstUserIdx))
    .map(m => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content }));

  if (!apiKey || conversationHistory.length === 0) return getFallbackResponse(messages, memory, currentEnergy, bodyDoubleMode);

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-sonnet-4-6', max_tokens: isVoice ? 150 : 500, system: `${systemPrompt}\n\n${parts.join('\n')}`, messages: conversationHistory }),
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

const NAME_BLOCKLIST = new Set([
  'tired','hungry','sad','happy','angry','anxious','scared','ready','sorry','fine',
  'okay','ok','good','bad','busy','here','there','going','doing','working','late',
  'early','sick','well','alone','lonely','glad','mad','excited','exhausted','stressed',
  'overwhelmed','frustrated','done','back','home','sure','trying','thinking','feeling',
  'still','really','always','never','sometimes','off','better','worse','great','terrible',
  'fed','bored','confused','lost','stuck','struggling','depressed','hopeful','grateful',
  'proud','guilty','ashamed','worried','nervous','calm','peaceful','annoyed','irritated',
]);

const analyzeMessage = (message: string): { completions: string[], newTasks: string[], memories: string[] } => {
  const completions: string[] = [], newTasks: string[] = [], memories: string[] = [];
  const completionPatterns = [/(?:I |just |finally )(?:did|finished|completed|done with) (.+?)(?:\.|!|$)/gi];
  for (const p of completionPatterns) { let m; while ((m = p.exec(message)) !== null) { const t = m[1].trim(); if (t.length > 3 && t.length < 100) completions.push(t); } }
  const taskPatterns = [/I (?:need|have|want|should|will|'ll|gotta) (?:to )?(.+?)(?:\.|!|$)/gi];
  for (const p of taskPatterns) { let m; while ((m = p.exec(message)) !== null) { const t = m[1].trim(); if (t.length > 5 && t.length < 100 && !t.includes('?')) newTasks.push(t); } }
  // Match the lead-in case-insensitively but validate the captured name is actually
  // a capitalized proper noun. The prior /i flag silently neutralized [A-Z][a-z]+
  // and caused "I'm tired" / "I am sad" to be saved as the user's name.
  const nameMatch = message.match(/(?:I'm|I am|my name is|call me)\s+([A-Za-z]+)/i);
  if (nameMatch) {
    const candidate = nameMatch[1];
    if (/^[A-Z][a-z]+$/.test(candidate) && !NAME_BLOCKLIST.has(candidate.toLowerCase())) {
      memories.push(`NAME: ${candidate}`);
    }
  }
  return { completions, newTasks, memories };
};

// ============ SWIPEABLE TASK COMPONENT ============
const SwipeableTask = ({ task, onComplete, onDelete }: { task: Task; onComplete: () => void; onDelete: () => void }) => {
  const translateX = useRef(new Animated.Value(0)).current;
  const [swiping, setSwiping] = useState<'none' | 'left' | 'right'>('none');

  // PanResponder is created once, so the closures it captures get stale as
  // soon as the parent re-renders with new onComplete/onDelete (which it does
  // every render — they're inline arrows). Route through refs so the gesture
  // handler always invokes the latest callbacks; otherwise completing a task
  // via swipe runs the first-render callback and clobbers any state the
  // parent has updated since (most notably wiping new messages because the
  // captured `messages` array is stale).
  const onCompleteRef = useRef(onComplete);
  const onDeleteRef = useRef(onDelete);
  useEffect(() => { onCompleteRef.current = onComplete; onDeleteRef.current = onDelete; });

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
          Animated.timing(translateX, { toValue: 400, duration: 200, useNativeDriver: true }).start(() => onCompleteRef.current());
        } else if (gestureState.dx < -100) {
          Animated.timing(translateX, { toValue: -400, duration: 200, useNativeDriver: true }).start(() => onDeleteRef.current());
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
        setSwiping('none');
      },
    })
  ).current;

  return (
    <View style={styles.swipeContainer}>
      <View style={[styles.swipeBackground, styles.swipeBackgroundLeft]}><Text style={styles.swipeText}>✓ Done</Text></View>
      <View style={[styles.swipeBackground, styles.swipeBackgroundRight]}><Text style={styles.swipeText}>✕ Remove</Text></View>
      <Animated.View style={[styles.taskItem, { transform: [{ translateX }] }, swiping === 'right' && styles.taskItemSwiping, swiping === 'left' && styles.taskItemSwipingDelete]} {...panResponder.panHandlers}>
        <Text style={styles.taskItemText} numberOfLines={2}>{task.description}</Text>
        <Text style={styles.taskItemAge}>{getRelativeTime(task.createdAt)}</Text>
      </Animated.View>
    </View>
  );
};

// ============ QUICK ADD MODAL ============
const QuickAddModal = ({ visible, onClose, onAdd, voiceEnabled }: { visible: boolean; onClose: () => void; onAdd: (task: string) => void; voiceEnabled: boolean }) => {
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setText('');
      Animated.parallel([
        Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start(() => inputRef.current?.focus());
    } else {
      scaleAnim.setValue(0.9);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  const handleAdd = () => {
    if (text.trim()) {
      onAdd(text.trim());
      setText('');
      onClose();
    }
  };

  const handleVoice = () => {
    if (isRecording) {
      VoiceService.stopListening();
      setIsRecording(false);
    } else {
      setIsRecording(true);
      VoiceService.startListening(
        (transcript) => { setText(transcript); setIsRecording(false); },
        () => setIsRecording(false),
        () => setIsRecording(false)
      );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[styles.quickAddOverlay, { opacity: opacityAnim }]}>
        <TouchableOpacity style={styles.quickAddBackdrop} onPress={onClose} activeOpacity={1} />
        <Animated.View style={[styles.quickAddCard, { transform: [{ scale: scaleAnim }] }]}>
          <Text style={styles.quickAddTitle}>Quick Add Task</Text>
          <View style={styles.quickAddInputRow}>
            <TextInput
              ref={inputRef}
              style={styles.quickAddInput}
              value={text}
              onChangeText={setText}
              placeholder="What do you need to do?"
              placeholderTextColor={COLORS.textDim}
              multiline
              maxLength={200}
              onSubmitEditing={handleAdd}
            />
            {voiceEnabled && VoiceService.isSupported() && (
              <TouchableOpacity style={[styles.quickAddVoice, isRecording && styles.quickAddVoiceActive]} onPress={handleVoice}>
                <Text style={styles.quickAddVoiceText}>{isRecording ? '●' : '🎤'}</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.quickAddActions}>
            <TouchableOpacity style={styles.quickAddCancel} onPress={onClose}><Text style={styles.quickAddCancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.quickAddSubmit, !text.trim() && styles.quickAddSubmitDisabled]} onPress={handleAdd} disabled={!text.trim()}>
              <Text style={styles.quickAddSubmitText}>Add</Text>
            </TouchableOpacity>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
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
  // Picked when the check-in modal opens so the prompt text doesn't flicker
  // as unrelated state changes re-render the parent.
  const [checkInPrompt, setCheckInPrompt] = useState('');
  const bodyDoubleTimer = useRef<NodeJS.Timeout | null>(null);
  
  // Focus Analytics
  const [focusSessions, setFocusSessions] = useState<FocusSession[]>([]);
  const [focusStats, setFocusStats] = useState<FocusStats | null>(null);
  const [showFocusStats, setShowFocusStats] = useState(false);
  
  // Quick Add
  const [showQuickAdd, setShowQuickAdd] = useState(false);

  // ============ NEW FEATURE STATES ============

  // Feature 1: Time Blocking
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [showTimeBlocks, setShowTimeBlocks] = useState(false);
  const [upcomingBlock, setUpcomingBlock] = useState<TimeBlock | null>(null);

  // Feature 2: Accountability Partners (local only for now)
  const [accountabilityPartner, setAccountabilityPartner] = useState<AccountabilityPartner | null>(null);

  // Feature 3: Task Decomposition
  const [showDecompose, setShowDecompose] = useState(false);
  const [decomposeTask, setDecomposeTask] = useState<Task | null>(null);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);

  // Feature 4: Emotion/Context Tagging
  const [showEmotionTag, setShowEmotionTag] = useState(false);
  const [selectedEmotionTags, setSelectedEmotionTags] = useState<string[]>([]);
  const [selectedContextTags, setSelectedContextTags] = useState<string[]>([]);
  const [energyContexts, setEnergyContexts] = useState<EnergyContext[]>([]);

  // Feature 5: Transition Support
  const [showTransitionSupport, setShowTransitionSupport] = useState(false);

  // Feature 6: Hyperfocus Detection
  const [hyperfocusWarning, setHyperfocusWarning] = useState(false);
  const [lastHyperfocusCheck, setLastHyperfocusCheck] = useState<string | null>(null);

  // Feature 7: RSD Support
  const [showRSDSupport, setShowRSDSupport] = useState(false);
  const [rsdTriggerMessage, setRsdTriggerMessage] = useState('');

  // Feature 8: Waiting Mode
  const [waitingItems, setWaitingItems] = useState<WaitingItem[]>([]);
  const [showWaitingMode, setShowWaitingMode] = useState(false);
  const [showAddWaiting, setShowAddWaiting] = useState(false);

  // Feature 9: Reflection
  const [showReflection, setShowReflection] = useState(false);
  const [reflectionData, setReflectionData] = useState<ReflectionData | null>(null);

  // Feature 10: Medication/Routine
  const [medicationReminders, setMedicationReminders] = useState<MedicationReminder[]>([]);
  const [routines, setRoutines] = useState<RoutineItem[]>([]);
  const [showMedReminder, setShowMedReminder] = useState(false);
  const [pendingMedReminder, setPendingMedReminder] = useState<MedicationReminder | null>(null);

  // Feature 11: External Motivation Mode
  const [externalMotivationMode, setExternalMotivationMode] = useState(false);
  const [motivationInterval, setMotivationInterval] = useState<NodeJS.Timeout | null>(null);
  const [currentMotivationPrompt, setCurrentMotivationPrompt] = useState('');

  // Feature 12: Sensory Environment
  const [showSensoryCheck, setShowSensoryCheck] = useState(false);
  const [currentSensorySettings, setCurrentSensorySettings] = useState<{lighting?: string; sound?: string; movement?: string}>({});

  // Feature 13: Done List Celebration
  const [showDoneList, setShowDoneList] = useState(false);
  const [todayCompletedTasks, setTodayCompletedTasks] = useState<Task[]>([]);
  const [todayFocusTime, setTodayFocusTime] = useState(0);

  // Feature 14: Parallel Tasks
  const [activeTasks, setActiveTasks] = useState<ActiveTask[]>([]);
  const [showParallelTasks, setShowParallelTasks] = useState(false);

  // Feature 15: Crisis/Meltdown Mode
  const [crisisMode, setCrisisMode] = useState(false);
  const [breathingPhase, setBreathingPhase] = useState<'inhale' | 'hold' | 'exhale'>('inhale');
  const [breathingCount, setBreathingCount] = useState(0);

  // ============ FEATURES 16-35 STATES ============

  // Feature 16: Where Was I Recovery
  const [showRecovery, setShowRecovery] = useState(false);
  const [sessionContext, setSessionContext] = useState<SessionContext | null>(null);
  // Captured at load before lastSeen is bumped to "now", so the recovery
  // check can see how long the user was actually away.
  const [previousLastSeen, setPreviousLastSeen] = useState<string | null>(null);

  // Feature 17: Decision Fatigue Helper
  const [showDecisionHelper, setShowDecisionHelper] = useState(false);
  const [decidedTask, setDecidedTask] = useState<Task | null>(null);

  // Feature 18: Dopamine Menu
  const [showDopamineMenu, setShowDopamineMenu] = useState(false);
  const [dopamineActivities, setDopamineActivities] = useState<DopamineActivity[]>(DEFAULT_DOPAMINE_ACTIVITIES);

  // Feature 19: Time Blindness Anchors
  const [showTimeAnchor, setShowTimeAnchor] = useState(false);
  const [lastTimeAnchor, setLastTimeAnchor] = useState<string | null>(null);
  // Picked when the anchor modal opens so the message text doesn't flicker
  // as unrelated state changes re-render the parent.
  const [timeAnchorMessage, setTimeAnchorMessage] = useState('');

  // Feature 20: Emotional Regulation
  const [showEmotionalCheck, setShowEmotionalCheck] = useState(false);
  const [currentEmotion, setCurrentEmotion] = useState<string | null>(null);
  const [emotionIntensity, setEmotionIntensity] = useState(3);
  const [emotionalHistory, setEmotionalHistory] = useState<EmotionalState[]>([]);

  // Feature 21: Procrastination Buddy
  const [showProcrastinationHelp, setShowProcrastinationHelp] = useState(false);
  const [procrastinationTask, setProcrastinationTask] = useState<Task | null>(null);

  // Feature 22: Impulse Delay Buffer
  const [delayedImpulses, setDelayedImpulses] = useState<DelayedImpulse[]>([]);
  const [showImpulseBuffer, setShowImpulseBuffer] = useState(false);
  const [showAddImpulse, setShowAddImpulse] = useState(false);
  const [readyImpulses, setReadyImpulses] = useState<DelayedImpulse[]>([]);

  // Feature 23: Social Battery
  const [socialInteractions, setSocialInteractions] = useState<SocialInteraction[]>([]);
  const [socialBattery, setSocialBattery] = useState(10);
  const [showSocialBattery, setShowSocialBattery] = useState(false);
  const [showLogSocial, setShowLogSocial] = useState(false);

  // Feature 24: Rumination Interrupt
  const [showRuminationHelp, setShowRuminationHelp] = useState(false);

  // Feature 25: Relationship Reminders
  const [relationshipReminders, setRelationshipReminders] = useState<RelationshipReminder[]>([]);
  const [showRelationships, setShowRelationships] = useState(false);
  const [overdueContacts, setOverdueContacts] = useState<RelationshipReminder[]>([]);

  // Feature 26: Flexible Routines
  const [flexibleRoutines, setFlexibleRoutines] = useState<FlexibleRoutine[]>([]);
  const [showRoutineCheck, setShowRoutineCheck] = useState(false);
  const [currentRoutine, setCurrentRoutine] = useState<FlexibleRoutine | null>(null);

  // Feature 27: Shame Spiral
  const [showShameSupport, setShowShameSupport] = useState(false);

  // Feature 28: Interest-Based Task Matching
  const [interestBasedSuggestion, setInterestBasedSuggestion] = useState<Task | null>(null);

  // Feature 29: Deadline Scaffolding
  const [showDeadlineSetup, setShowDeadlineSetup] = useState(false);
  const [deadlineTask, setDeadlineTask] = useState<Task | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  // Feature 30: Just Watch Me Accountability
  const [accountabilityMode, setAccountabilityMode] = useState<string>('gentle');
  const [showAccountabilitySetup, setShowAccountabilitySetup] = useState(false);

  // Feature 31: Quiet Hours
  const [quietHours, setQuietHours] = useState<QuietHours>({ enabled: false, startTime: '22:00', endTime: '08:00', days: [0,1,2,3,4,5,6], allowUrgent: true });
  const [isInQuietHours, setIsInQuietHours] = useState(false);

  // Feature 32: Win Journal
  const [winEntries, setWinEntries] = useState<WinEntry[]>([]);
  const [showWinJournal, setShowWinJournal] = useState(false);
  const [showAddWin, setShowAddWin] = useState(false);
  const [currentWinPrompt, setCurrentWinPrompt] = useState('');

  // Feature 33: Sensory Overload Mode
  const [sensoryOverloadMode, setSensoryOverloadMode] = useState(false);

  // Feature 34: Task Swapping
  const [showTaskSwap, setShowTaskSwap] = useState(false);
  const [swapSuggestion, setSwapSuggestion] = useState<Task | null>(null);

  // Feature 35: Commitment Device
  const [commitments, setCommitments] = useState<Commitment[]>([]);
  const [showCommitments, setShowCommitments] = useState(false);
  const [showAddCommitment, setShowAddCommitment] = useState(false);
  const [overdueCommitments, setOverdueCommitments] = useState<Commitment[]>([]);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const fabAnim = useRef(new Animated.Value(1)).current;
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => { initializeApp(); }, []);

  // FAB pulse animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(fabAnim, { toValue: 1.05, duration: 1500, useNativeDriver: true }),
        Animated.timing(fabAnim, { toValue: 1, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  // Breathing animation for body double mode
  useEffect(() => {
    if (!bodyDoubleMode) {
      breatheAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, { toValue: 1.1, duration: 2000, useNativeDriver: true }),
        Animated.timing(breatheAnim, { toValue: 1, duration: 2000, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => { loop.stop(); breatheAnim.setValue(1); };
  }, [bodyDoubleMode]);

  // Body double check-ins
  useEffect(() => {
    if (bodyDoubleMode && bodyDoubleSession) {
      bodyDoubleTimer.current = setInterval(() => {
        // Don't keep re-firing (and re-vibrating) while the user is already
        // looking at the check-in modal — wait for them to respond.
        if (showBodyDoubleCheckIn) return;
        const timeSinceLastCheckIn = Date.now() - new Date(bodyDoubleSession.lastCheckIn).getTime();
        const checkInInterval = (8 + Math.random() * 7) * 60 * 1000;
        if (timeSinceLastCheckIn > checkInInterval) {
          setCheckInPrompt(BODY_DOUBLE_CHECK_INS[Math.floor(Math.random() * BODY_DOUBLE_CHECK_INS.length)]);
          setShowBodyDoubleCheckIn(true);
          if (Platform.OS !== 'web') Vibration.vibrate(100);
        }
      }, 60000);
      return () => { if (bodyDoubleTimer.current) clearInterval(bodyDoubleTimer.current); };
    }
  }, [bodyDoubleMode, bodyDoubleSession, showBodyDoubleCheckIn]);

  useEffect(() => {
    if (!isRecording) {
      pulseAnim.setValue(1);
      return;
    }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulseAnim, { toValue: 1.2, duration: 500, useNativeDriver: true }),
      Animated.timing(pulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); pulseAnim.setValue(1); };
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
    if (!isLoading && !showEnergyCheck && !showTaskSuggestion && !bodyDoubleMode && messages.length > 0) {
      const now = Date.now();
      const lastCheck = lastEnergyCheck ? new Date(lastEnergyCheck).getTime() : 0;
      if ((now - lastCheck) / 3600000 > 4 && currentEnergy === null) {
        setTimeout(() => { if (!showSettings && !pendingNudge) setShowEnergyCheck(true); }, 2000);
      }
    }
  }, [isLoading, messages.length, lastEnergyCheck, currentEnergy, bodyDoubleMode]);

  // Calculate focus stats when sessions change
  useEffect(() => {
    if (focusSessions.length > 0) {
      const stats = FocusAnalytics.calculateStats(focusSessions);
      setFocusStats(stats);
    }
  }, [focusSessions]);

  // Feature 6: Hyperfocus Detection
  useEffect(() => {
    if (bodyDoubleMode && bodyDoubleSession) {
      const checkHyperfocus = setInterval(() => {
        const { isHyperfocusing, duration } = detectHyperfocus(bodyDoubleSession.startedAt);
        const hoursSinceLastCheck = lastHyperfocusCheck ? (Date.now() - new Date(lastHyperfocusCheck).getTime()) / 3600000 : 999;

        if (isHyperfocusing && hoursSinceLastCheck >= 1 && !hyperfocusWarning) {
          setHyperfocusWarning(true);
          setLastHyperfocusCheck(new Date().toISOString());
        }
      }, 60000);
      return () => clearInterval(checkHyperfocus);
    }
  }, [bodyDoubleMode, bodyDoubleSession, lastHyperfocusCheck, hyperfocusWarning]);

  // Feature 1: Time Block Notifications
  useEffect(() => {
    if (timeBlocks.length === 0) {
      if (upcomingBlock) setUpcomingBlock(null);
      return;
    }
    const checkBlocks = () => {
      const upcoming = getUpcomingTimeBlock(timeBlocks);
      if (upcoming) {
        if (!upcomingBlock || upcoming.id !== upcomingBlock.id) setUpcomingBlock(upcoming);
      } else if (upcomingBlock) {
        // The previously-flagged block has started or moved out of the
        // 30-minute window; clear it so the banner doesn't linger forever.
        setUpcomingBlock(null);
      }
    };
    checkBlocks();
    const interval = setInterval(checkBlocks, 60000);
    return () => clearInterval(interval);
  }, [timeBlocks, upcomingBlock]);

  // Feature 10: Medication Reminder Check
  useEffect(() => {
    if (medicationReminders.length === 0) return;
    // Window in minutes for catching a scheduled time. Strict minute-equality
    // missed reminders whenever the interval drifted past the boundary or the
    // tab was backgrounded; this window catches any scheduled time that fell
    // in the last 15 minutes (and hasn't been taken today yet).
    const WINDOW_MIN = 15;

    const checkMeds = () => {
      if (pendingMedReminder) return;
      const now = new Date();
      const today = now.getDay();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      for (const reminder of medicationReminders) {
        if (!reminder.enabled || !reminder.days.includes(today)) continue;

        const lastTaken = reminder.lastTaken ? new Date(reminder.lastTaken) : null;
        const alreadyTakenToday = lastTaken && lastTaken.toDateString() === now.toDateString();
        if (alreadyTakenToday) continue;

        for (const time of reminder.times) {
          const [hStr, mStr] = time.split(':');
          const reminderMinutes = (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0);
          const delta = nowMinutes - reminderMinutes;
          if (delta >= 0 && delta <= WINDOW_MIN) {
            setPendingMedReminder(reminder);
            setShowMedReminder(true);
            return;
          }
        }
      }
    };

    checkMeds();
    const interval = setInterval(checkMeds, 60000);
    return () => clearInterval(interval);
  }, [medicationReminders, pendingMedReminder]);

  // Feature 11: External Motivation Mode
  useEffect(() => {
    if (externalMotivationMode) {
      const prompt = MOTIVATION_PROMPTS[Math.floor(Math.random() * MOTIVATION_PROMPTS.length)];
      setCurrentMotivationPrompt(prompt);

      const interval = setInterval(() => {
        const newPrompt = MOTIVATION_PROMPTS[Math.floor(Math.random() * MOTIVATION_PROMPTS.length)];
        setCurrentMotivationPrompt(newPrompt);
        if (Platform.OS !== 'web') Vibration.vibrate(100);
      }, 10 * 60 * 1000); // Every 10 minutes

      setMotivationInterval(interval);
      return () => clearInterval(interval);
    } else {
      if (motivationInterval) clearInterval(motivationInterval);
      setCurrentMotivationPrompt('');
    }
  }, [externalMotivationMode]);

  // Feature 13: Calculate today's completed tasks for Done List
  useEffect(() => {
    const today = new Date().setHours(0, 0, 0, 0);
    const todayTasks = completedTasks.filter(t => t.completedAt && new Date(t.completedAt).setHours(0, 0, 0, 0) === today);
    setTodayCompletedTasks(todayTasks);

    const todaySessions = focusSessions.filter(s => new Date(s.endedAt).setHours(0, 0, 0, 0) === today);
    const totalTime = todaySessions.reduce((sum, s) => sum + s.durationMs, 0);
    setTodayFocusTime(totalTime);
  }, [completedTasks, focusSessions]);

  // ============ FEATURES 16-35 EFFECTS ============

  // Feature 16: Check for recovery mode on app load
  useEffect(() => {
    if (!isLoading && previousLastSeen) {
      const shouldRecover = shouldShowRecovery(previousLastSeen);
      if (shouldRecover && messages.length > 1) {
        const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
        const context: SessionContext = {
          lastActiveTask: bodyDoubleSession?.taskDescription,
          lastTopic: lastUserMessage?.content.slice(0, 50),
          lastActivity: previousLastSeen,
          awayDuration: calculateAwayDuration(previousLastSeen),
        };
        setSessionContext(context);
        setShowRecovery(true);
      }
    }
  }, [isLoading, previousLastSeen]);

  // Feature 19: Time blindness anchors during focus
  useEffect(() => {
    if (bodyDoubleMode && bodyDoubleSession) {
      const anchorInterval = setInterval(() => {
        const hoursSinceAnchor = lastTimeAnchor ? (Date.now() - new Date(lastTimeAnchor).getTime()) / 3600000 : 999;
        if (hoursSinceAnchor >= 0.5) { // Every 30 minutes
          setTimeAnchorMessage(TIME_ANCHOR_MESSAGES[Math.floor(Math.random() * TIME_ANCHOR_MESSAGES.length)]);
          setShowTimeAnchor(true);
          setLastTimeAnchor(new Date().toISOString());
        }
      }, 60000);
      return () => clearInterval(anchorInterval);
    }
  }, [bodyDoubleMode, bodyDoubleSession, lastTimeAnchor]);

  // Feature 22: Check for ready impulses
  useEffect(() => {
    const now = new Date().toISOString();
    const ready = delayedImpulses.filter(i => i.delayUntil <= now && i.status === 'waiting');
    setReadyImpulses(ready);
  }, [delayedImpulses]);

  // Feature 23: Calculate social battery
  useEffect(() => {
    const battery = calculateSocialBattery(socialInteractions);
    setSocialBattery(battery);
  }, [socialInteractions]);

  // Feature 25: Check overdue contacts
  useEffect(() => {
    const overdue = relationshipReminders.filter(needsContact);
    setOverdueContacts(overdue);
  }, [relationshipReminders]);

  // Feature 31: Check quiet hours
  useEffect(() => {
    const checkQuiet = () => setIsInQuietHours(isQuietHours(quietHours));
    checkQuiet();
    const interval = setInterval(checkQuiet, 60000);
    return () => clearInterval(interval);
  }, [quietHours]);

  // Feature 35: Check overdue commitments
  useEffect(() => {
    const overdue = getOverdueCommitments(commitments);
    setOverdueCommitments(overdue);
  }, [commitments]);

  const initializeApp = async () => {
    try {
      let storedDeviceId = await AsyncStorage.getItem('@nero/deviceId');
      if (!storedDeviceId) { storedDeviceId = generateDeviceId(); await AsyncStorage.setItem('@nero/deviceId', storedDeviceId); }
      setDeviceId(storedDeviceId);

      const [savedApiKey, savedVoiceEnabled, savedAutoSpeak, savedNudgesEnabled, savedSyncEnabled, savedLastEnergy, savedQuietHours] = await Promise.all([
        AsyncStorage.getItem('@nero/apiKey'), AsyncStorage.getItem('@nero/voiceEnabled'), AsyncStorage.getItem('@nero/autoSpeak'),
        AsyncStorage.getItem('@nero/nudgesEnabled'), AsyncStorage.getItem('@nero/syncEnabled'), AsyncStorage.getItem('@nero/lastEnergyCheck'),
        AsyncStorage.getItem('@nero/quietHours'),
      ]);

      if (savedApiKey) setApiKey(JSON.parse(savedApiKey));
      if (savedVoiceEnabled !== null) setVoiceEnabled(JSON.parse(savedVoiceEnabled));
      if (savedAutoSpeak !== null) setAutoSpeak(JSON.parse(savedAutoSpeak));
      if (savedNudgesEnabled !== null) setNudgesEnabled(JSON.parse(savedNudgesEnabled));
      if (savedSyncEnabled !== null) setSyncEnabled(JSON.parse(savedSyncEnabled));
      if (savedLastEnergy) setLastEnergyCheck(savedLastEnergy);
      if (savedQuietHours) setQuietHours(JSON.parse(savedQuietHours));

      const shouldSync = savedSyncEnabled === null ? true : JSON.parse(savedSyncEnabled);
      
      if (shouldSync) {
        try {
          setSyncStatus('syncing');
          await SupabaseService.initialize(storedDeviceId);
          const [cloudMemory, cloudMessages, cloudPatterns, cloudTasks, cloudCompleted, cloudSessions, cloudTimeBlocks, cloudWaiting, cloudMeds, cloudRoutines, cloudContexts, cloudImpulses, cloudSocial, cloudRelationships, cloudWins, cloudCommitments, cloudFlexRoutines, cloudEmotional] = await Promise.all([
            SupabaseService.getMemory(), SupabaseService.getMessages(100), SupabaseService.getPatterns(),
            SupabaseService.getOpenTasks(), SupabaseService.getCompletedTasks(30), SupabaseService.getFocusSessions(30),
            SupabaseService.getTimeBlocks(), SupabaseService.getWaitingItems(), SupabaseService.getMedicationReminders(),
            SupabaseService.getRoutines(), SupabaseService.getEnergyContexts(14),
            SupabaseService.getDelayedImpulses(), SupabaseService.getSocialInteractions(7),
            SupabaseService.getRelationshipReminders(), SupabaseService.getWinEntries(30),
            SupabaseService.getCommitments(), SupabaseService.getFlexibleRoutines(),
            SupabaseService.getEmotionalHistory(14),
          ]);
          if (cloudMemory) { setPreviousLastSeen(cloudMemory.facts.lastSeen); cloudMemory.facts.totalConversations += 1; cloudMemory.facts.lastSeen = new Date().toISOString(); setMemory(cloudMemory); await SupabaseService.saveMemory(cloudMemory); }
          if (cloudMessages.length > 0) setMessages(cloudMessages);
          else {
            const welcome: Message = { id: generateId(), role: 'nero', content: "Hey. I'm Nero. I'm here to help you get things done - by actually knowing you. What's on your mind?", timestamp: new Date().toISOString() };
            setMessages([welcome]);
            await SupabaseService.saveMessage(welcome);
          }
          setPatterns(cloudPatterns); setOpenTasks(cloudTasks); setCompletedTasks(cloudCompleted); setFocusSessions(cloudSessions);
          setTimeBlocks(cloudTimeBlocks); setWaitingItems(cloudWaiting); setMedicationReminders(cloudMeds);
          setRoutines(cloudRoutines); setEnergyContexts(cloudContexts);
          setDelayedImpulses(cloudImpulses); setSocialInteractions(cloudSocial); setRelationshipReminders(cloudRelationships);
          setWinEntries(cloudWins); setCommitments(cloudCommitments); setFlexibleRoutines(cloudFlexRoutines);
          setEmotionalHistory(cloudEmotional);
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
    if (savedMemory) { const m = JSON.parse(savedMemory); setPreviousLastSeen(m.facts.lastSeen); m.facts.lastSeen = new Date().toISOString(); m.facts.totalConversations += 1; setMemory(m); }
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
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/quietHours', JSON.stringify(quietHours)); }, [quietHours, isLoading]);
  // Auto-persist messages whenever they change so handlers that just call
  // setMessages (handleTaskComplete, handleBodyDoubleCheckIn, hyperfocus,
  // RSD/shame/rumination support, etc.) don't have to remember to call
  // saveData. Without this, those handlers' Nero replies were lost on
  // offline reload because saveData was never invoked.
  useEffect(() => { if (!isLoading) AsyncStorage.setItem('@nero/messages', JSON.stringify(messages.slice(-100))); }, [messages, isLoading]);

  const saveData = useCallback(async (newMessages: Message[], newMemory: UserMemory) => {
    await Promise.all([AsyncStorage.setItem('@nero/messages', JSON.stringify(newMessages.slice(-100))), AsyncStorage.setItem('@nero/memory', JSON.stringify(newMemory))]);
    if (syncEnabled && SupabaseService.userId) { try { setSyncStatus('syncing'); await SupabaseService.saveMemory(newMemory); setSyncStatus('synced'); } catch { setSyncStatus('offline'); } }
  }, [syncEnabled]);

  const handleEnergySubmit = async (level: number, mood: string, skipContext: boolean = false) => {
    setCurrentEnergy(level);
    setShowEnergyCheck(false);
    const now = new Date().toISOString();
    setLastEnergyCheck(now);
    await AsyncStorage.setItem('@nero/lastEnergyCheck', now);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.logEnergy(level, mood);

    // Feature 4: Show emotion/context tagging for low energy
    if (level <= 2 && !skipContext) {
      setShowEmotionTag(true);
      return;
    }

    const suggestion = TaskSuggestionEngine.suggestTask(openTasks, level, patterns, completedTasks);
    setTaskSuggestion(suggestion);
    setSuggestionMessage(TaskSuggestionEngine.generateSuggestionMessage(suggestion, level, memory.facts.name));
    setShowTaskSuggestion(true);
  };

  const handleEmotionTagComplete = () => {
    handleEmotionSubmit();
    const suggestion = TaskSuggestionEngine.suggestTask(openTasks, currentEnergy || 2, patterns, completedTasks);
    setTaskSuggestion(suggestion);
    setSuggestionMessage(TaskSuggestionEngine.generateSuggestionMessage(suggestion, currentEnergy || 2, memory.facts.name));
    setShowTaskSuggestion(true);
  };

  const handleSuggestionAction = async (accepted: boolean) => {
    setShowTaskSuggestion(false);
    
    if (accepted && taskSuggestion) {
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
    const endTime = new Date().toISOString();
    const duration = bodyDoubleSession ? Date.now() - new Date(bodyDoubleSession.startedAt).getTime() : 0;

    // Feature 5: Check if transition support is needed
    if (bodyDoubleSession && needsTransitionSupport(duration, bodyDoubleSession.checkInCount)) {
      setShowTransitionSupport(true);
    }

    // Save focus session — always record locally so stats work offline; sync
    // to the cloud only when sync is on.
    if (bodyDoubleSession) {
      const focusSession: FocusSession = {
        id: generateId(),
        taskId: bodyDoubleSession.taskId,
        taskDescription: bodyDoubleSession.taskDescription,
        startedAt: bodyDoubleSession.startedAt,
        endedAt: endTime,
        durationMs: duration,
        completed,
        checkInCount: bodyDoubleSession.checkInCount,
        timeOfDay: getTimeOfDay(),
        dayOfWeek: getDayOfWeek(),
      };
      setFocusSessions(prev => [focusSession, ...prev]);
      if (syncEnabled && SupabaseService.userId) await SupabaseService.saveFocusSession(focusSession);
    }

    if (bodyDoubleSession?.taskId && completed) {
      const completedTaskId = bodyDoubleSession.taskId;
      // Move into completedTasks too so Today's Done / Done List / stats
      // reflect tasks finished via body-double mode.
      setOpenTasks(prev => {
        const finished = prev.find(t => t.id === completedTaskId);
        if (finished) {
          setCompletedTasks(c => [{ ...finished, status: 'completed', completedAt: new Date().toISOString() }, ...c]);
        }
        return prev.filter(t => t.id !== completedTaskId);
      });
      if (syncEnabled && SupabaseService.userId) await SupabaseService.completeTask(completedTaskId, currentEnergy || undefined);
    }

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
    
    if (syncEnabled && SupabaseService.userId) {
      const freshTasks = await SupabaseService.getOpenTasks();
      setOpenTasks(freshTasks);
    }
  };

  const handleQuickAdd = async (description: string) => {
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.createTask(description, currentEnergy || undefined);
      const freshTasks = await SupabaseService.getOpenTasks();
      setOpenTasks(freshTasks);
    }
    
    const neroMessage: Message = { id: generateId(), role: 'nero', content: `Got it. "${description}" - added.`, timestamp: new Date().toISOString() };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    await saveData(newMessages, memory);
  };

  const handleTaskComplete = async (task: Task) => {
    if (syncEnabled && SupabaseService.userId) {
      await SupabaseService.completeTask(task.id, currentEnergy || undefined);
    }
    setOpenTasks(prev => prev.filter(t => t.id !== task.id));
    setCompletedTasks(prev => [{ ...task, status: 'completed', completedAt: new Date().toISOString() }, ...prev]);
    
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

    // Feature 15: Crisis Detection
    if (detectCrisis(text) && !crisisMode) {
      setIsThinking(false);
      enterCrisisMode();
      return;
    }

    // Feature 7: RSD Detection
    if (detectRSD(text) && !showRSDSupport) {
      setRsdTriggerMessage(text);
      setShowRSDSupport(true);
      setIsThinking(false);
      return;
    }

    // Feature 24: Rumination Detection
    if (detectRumination(text, messages) && !showRuminationHelp) {
      setShowRuminationHelp(true);
      setIsThinking(false);
      return;
    }

    // Feature 27: Shame Spiral Detection
    if (detectShameSpiral(text) && !showShameSupport) {
      setShowShameSupport(true);
      setIsThinking(false);
      return;
    }

    if (bodyDoubleMode && bodyDoubleSession) {
      setBodyDoubleSession({ ...bodyDoubleSession, lastCheckIn: new Date().toISOString() });
    }

    const analysis = analyzeMessage(text);
    let updatedMemory = { ...memory };
    
    for (const completion of analysis.completions) {
      const matchingTask = openTasks.find(t => t.description.toLowerCase().includes(completion.toLowerCase()) || completion.toLowerCase().includes(t.description.toLowerCase()));
      if (matchingTask) {
        setOpenTasks(prev => prev.filter(t => t.id !== matchingTask.id));
        setCompletedTasks(prev => [{ ...matchingTask, status: 'completed', completedAt: new Date().toISOString() }, ...prev]);
        if (syncEnabled && SupabaseService.userId) await SupabaseService.completeTask(matchingTask.id, currentEnergy || undefined);

        if (bodyDoubleMode && bodyDoubleSession?.taskId === matchingTask.id) {
          await endBodyDoubleMode(true);
          setIsThinking(false);
          return;
        }
      }
    }

    for (const description of analysis.newTasks) {
      // Always reflect new tasks locally so they show up in openTasks even
      // when offline; sync to Supabase when enabled. The Supabase id is used
      // when available so subsequent ops match the cloud row.
      const cloudId = (syncEnabled && SupabaseService.userId)
        ? await SupabaseService.createTask(description, currentEnergy || undefined)
        : '';
      const newTask: Task = {
        id: cloudId || generateId(),
        description,
        status: 'open',
        createdAt: new Date().toISOString(),
        energyAtCreation: currentEnergy || undefined,
      };
      setOpenTasks(prev => [...prev, newTask]);
      if (!updatedMemory.threads.commitments.includes(description)) updatedMemory.threads.commitments = [...updatedMemory.threads.commitments.slice(-4), description];
    }
    
    for (const mem of analysis.memories) {
      if (mem.startsWith('NAME: ')) updatedMemory.facts.name = mem.replace('NAME: ', '');
      else updatedMemory.remembered = [...updatedMemory.remembered.slice(-19), mem];
    }

    updatedMemory.facts.lastSeen = new Date().toISOString();
    setMemory(updatedMemory);

    let tasksForContext = openTasks;
    if (syncEnabled && SupabaseService.userId) {
      const freshTasks = await SupabaseService.getOpenTasks();
      setOpenTasks(freshTasks);
      tasksForContext = freshTasks;
    }

    const response = await callNero(newMessages, updatedMemory, patterns, currentEnergy, tasksForContext, apiKey, isVoice, bodyDoubleMode);
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

  // ============ NEW FEATURE HANDLERS ============

  // Feature 3: Task Decomposition
  const startDecompose = (task: Task) => {
    setDecomposeTask(task);
    setSubtasks([]);
    setShowDecompose(true);
  };

  const addSubtask = async (description: string) => {
    if (!decomposeTask) return;
    const subtask: Subtask = {
      id: generateId(),
      parentTaskId: decomposeTask.id,
      description,
      status: 'open',
      order: subtasks.length,
    };
    setSubtasks(prev => [...prev, subtask]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveSubtask(subtask);
  };

  const completeSubtask = async (subtaskId: string) => {
    setSubtasks(prev => prev.map(s => s.id === subtaskId ? { ...s, status: 'completed' } : s));
    if (syncEnabled && SupabaseService.userId) await SupabaseService.completeSubtask(subtaskId);
  };

  // Feature 4: Emotion/Context Tagging
  const handleEmotionSubmit = async () => {
    if (!currentEnergy) return;
    const context: EnergyContext = {
      id: generateId(),
      context: [...selectedEmotionTags, ...selectedContextTags].join(', '),
      tags: [...selectedEmotionTags, ...selectedContextTags],
      timestamp: new Date().toISOString(),
    };
    setEnergyContexts(prev => [context, ...prev]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.logEnergyContext(context);
    setShowEmotionTag(false);
    setSelectedEmotionTags([]);
    setSelectedContextTags([]);
  };

  const toggleEmotionTag = (tag: string) => {
    setSelectedEmotionTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const toggleContextTag = (tag: string) => {
    setSelectedContextTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  // Feature 5: Transition Support
  const handleTransitionEnd = async () => {
    setShowTransitionSupport(false);
    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: "Take a moment. Stretch, breathe, maybe grab some water. The next thing can wait a minute.",
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Feature 6: Hyperfocus Warning Response
  const handleHyperfocusResponse = async (action: 'continue' | 'break' | 'end') => {
    setHyperfocusWarning(false);
    let content = '';

    if (action === 'continue') {
      content = "Alright, keep going! I'll check in again later. Remember to hydrate.";
    } else if (action === 'break') {
      content = "Smart. Take 5-10 minutes. Move around, drink water, rest your eyes. I'll be here.";
    } else {
      // Hyperfocus warning's "end" choice means take a forced break, not
      // "I finished the task". Pass completed=false so endBodyDoubleMode
      // doesn't mark the underlying task as done and pull it from openTasks.
      await endBodyDoubleMode(false);
      return;
    }

    const neroMessage: Message = { id: generateId(), role: 'nero', content, timestamp: new Date().toISOString() };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Feature 7: RSD Support
  const handleRSDSupport = async (action: 'talk' | 'reframe' | 'dismiss') => {
    setShowRSDSupport(false);
    let content = '';

    if (action === 'talk') {
      content = "I'm here. Tell me what happened - just the facts first, then how you're feeling.";
    } else if (action === 'reframe') {
      content = "Let's reality-check this together. What actually happened vs what your brain is telling you?";
    } else {
      content = "That's okay. The feeling will pass. I'm here if you want to talk later.";
    }

    const neroMessage: Message = { id: generateId(), role: 'nero', content, timestamp: new Date().toISOString() };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    setRsdTriggerMessage('');
  };

  // Feature 8: Waiting Mode
  const addWaitingItem = async (description: string, waitingFor: string, expectedBy?: string) => {
    const item: WaitingItem = {
      id: generateId(),
      description,
      waitingFor,
      createdAt: new Date().toISOString(),
      expectedBy,
      status: 'waiting',
    };
    setWaitingItems(prev => [...prev, item]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveWaitingItem(item);
    setShowAddWaiting(false);
  };

  const resolveWaitingItem = async (itemId: string, received: boolean) => {
    const status = received ? 'received' : 'expired';
    setWaitingItems(prev => prev.filter(w => w.id !== itemId));
    if (syncEnabled && SupabaseService.userId) await SupabaseService.updateWaitingItemStatus(itemId, status);
  };

  // Feature 9: Reflection
  const loadReflection = async (period: 'week' | 'month') => {
    if (syncEnabled && SupabaseService.userId) {
      const data = await SupabaseService.getReflectionData(period);
      setReflectionData(data);
      setShowReflection(true);
    }
  };

  // Feature 10: Medication Reminder Response
  const handleMedReminderResponse = async (taken: boolean) => {
    if (pendingMedReminder && taken) {
      // Update local state so the reminder check effect (which gates on
      // reminder.lastTaken) doesn't re-prompt for the same dose seconds later.
      const reminderId = pendingMedReminder.id;
      const takenAt = new Date().toISOString();
      setMedicationReminders(prev => prev.map(r => r.id === reminderId ? { ...r, lastTaken: takenAt } : r));
      if (syncEnabled && SupabaseService.userId) await SupabaseService.markMedicationTaken(reminderId);
    }
    setShowMedReminder(false);
    setPendingMedReminder(null);
  };

  // Feature 11: External Motivation Toggle
  const toggleExternalMotivation = () => {
    setExternalMotivationMode(prev => !prev);
  };

  // Feature 12: Sensory Environment
  const handleSensorySubmit = async () => {
    setShowSensoryCheck(false);
    const settings = Object.entries(currentSensorySettings).filter(([_, v]) => v).map(([k, v]) => `${k}: ${v}`).join(', ');
    if (settings) {
      const neroMessage: Message = {
        id: generateId(), role: 'nero',
        content: `Got it. Your environment: ${settings}. Let me know if you need to adjust anything.`,
        timestamp: new Date().toISOString(),
      };
      const newMessages = [...messages, neroMessage];
      setMessages(newMessages);
      if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    }
  };

  // Feature 14: Parallel Tasks
  const startParallelTask = async (task: Task) => {
    const activeTask: ActiveTask = {
      taskId: task.id,
      description: task.description,
      startedAt: new Date().toISOString(),
      status: 'active',
    };
    setActiveTasks(prev => [...prev, activeTask]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.setTaskActive(task.id, task.description);
  };

  const pauseParallelTask = async (taskId: string) => {
    setActiveTasks(prev => prev.map(t => t.taskId === taskId ? { ...t, status: 'paused' } : t));
    if (syncEnabled && SupabaseService.userId) await SupabaseService.pauseTask(taskId);
  };

  const focusOnTask = (task: ActiveTask) => {
    const fullTask = openTasks.find(t => t.id === task.taskId);
    if (fullTask) {
      setShowParallelTasks(false);
      startBodyDoubleMode(fullTask);
    }
  };

  // Feature 15: Crisis Mode
  const enterCrisisMode = () => {
    // If a body-double session is in progress, persist it as an incomplete
    // focus session before tearing it down — otherwise the user loses the
    // entire session record (no entry in stats, nothing in Supabase).
    if (bodyDoubleSession) {
      const focusSession: FocusSession = {
        id: generateId(),
        taskId: bodyDoubleSession.taskId,
        taskDescription: bodyDoubleSession.taskDescription,
        startedAt: bodyDoubleSession.startedAt,
        endedAt: new Date().toISOString(),
        durationMs: Date.now() - new Date(bodyDoubleSession.startedAt).getTime(),
        completed: false,
        checkInCount: bodyDoubleSession.checkInCount,
        timeOfDay: getTimeOfDay(),
        dayOfWeek: getDayOfWeek(),
      };
      setFocusSessions(prev => [focusSession, ...prev]);
      setBodyDoubleSession(null);
      // Fire-and-forget so the crisis UI shows immediately, not after a
      // possibly-slow cloud round-trip.
      if (syncEnabled && SupabaseService.userId) SupabaseService.saveFocusSession(focusSession);
    }
    setCrisisMode(true);
    setBodyDoubleMode(false);
    setBreathingPhase('inhale');
    setBreathingCount(0);
  };

  const exitCrisisMode = async () => {
    setCrisisMode(false);
    setBreathingCount(0);
    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: "You made it through. Take your time getting back to things. I'm here.",
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Breathing cycle for crisis mode
  useEffect(() => {
    if (crisisMode) {
      const pattern = BREATHING_PATTERNS.calm;
      const timeouts: ReturnType<typeof setTimeout>[] = [];
      const breathingCycle = () => {
        setBreathingPhase('inhale');
        timeouts.push(setTimeout(() => setBreathingPhase('hold'), pattern.inhale * 1000));
        timeouts.push(setTimeout(() => {
          setBreathingPhase('exhale');
          setBreathingCount(prev => prev + 1);
        }, (pattern.inhale + pattern.hold) * 1000));
      };

      breathingCycle();
      const interval = setInterval(breathingCycle, (pattern.inhale + pattern.hold + pattern.exhale) * 1000);
      return () => {
        clearInterval(interval);
        timeouts.forEach(clearTimeout);
      };
    }
  }, [crisisMode]);

  // ============ FEATURES 16-35 HANDLERS ============

  // Feature 16: Where Was I Recovery
  const handleRecoveryDismiss = () => {
    setShowRecovery(false);
    setSessionContext(null);
  };

  const handleRecoveryResume = async () => {
    setShowRecovery(false);
    if (sessionContext?.lastActiveTask) {
      const task = openTasks.find(t => t.description === sessionContext.lastActiveTask);
      if (task) startBodyDoubleMode(task);
    }
    setSessionContext(null);
  };

  // Feature 17: Decision Fatigue Helper
  const handleDecisionHelp = () => {
    const picked = pickRandomTask(openTasks);
    setDecidedTask(picked);
    setShowDecisionHelper(true);
  };

  const handleDecisionAccept = () => {
    setShowDecisionHelper(false);
    if (decidedTask) startBodyDoubleMode(decidedTask);
    setDecidedTask(null);
  };

  // Feature 18: Dopamine Menu
  const handleDopamineSelect = async (activity: DopamineActivity) => {
    setShowDopamineMenu(false);
    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: `Go ${activity.name.toLowerCase()}! Take ${activity.duration} minutes. I'll be here.`,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Feature 19: Time Anchor
  const handleTimeAnchorDismiss = () => {
    setShowTimeAnchor(false);
  };

  // Feature 20: Emotional Regulation
  const handleEmotionalSubmit = async () => {
    if (!currentEmotion) return;
    const state: EmotionalState = {
      emotion: currentEmotion,
      intensity: emotionIntensity,
      timestamp: new Date().toISOString(),
    };
    setEmotionalHistory(prev => [state, ...prev]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.logEmotionalState(state);

    const strategies = COPING_STRATEGIES[currentEmotion as keyof typeof COPING_STRATEGIES] || [];
    const suggestion = strategies[Math.floor(Math.random() * strategies.length)];

    setShowEmotionalCheck(false);
    setCurrentEmotion(null);

    if (suggestion) {
      const neroMessage: Message = {
        id: generateId(), role: 'nero',
        content: `Feeling ${currentEmotion}. That's valid. Maybe try: ${suggestion}`,
        timestamp: new Date().toISOString(),
      };
      const newMessages = [...messages, neroMessage];
      setMessages(newMessages);
      if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    }
  };

  // Feature 21: Procrastination Buddy
  const handleProcrastinationHelp = (task: Task) => {
    setProcrastinationTask(task);
    setShowProcrastinationHelp(true);
  };

  const handleProcrastinationBlocker = async (blocker: typeof PROCRASTINATION_BLOCKERS[0]) => {
    setShowProcrastinationHelp(false);
    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: blocker.suggestion,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    setProcrastinationTask(null);
  };

  // Feature 22: Impulse Delay Buffer
  const addDelayedImpulse = async (description: string, category: 'purchase' | 'decision' | 'action', cost?: number) => {
    const impulse: DelayedImpulse = {
      id: generateId(),
      description,
      category,
      createdAt: new Date().toISOString(),
      delayUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      status: 'waiting',
      estimatedCost: cost,
    };
    setDelayedImpulses(prev => [...prev, impulse]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveDelayedImpulse(impulse);
    setShowAddImpulse(false);
  };

  const handleImpulseDecision = async (impulseId: string, approved: boolean) => {
    const status = approved ? 'approved' : 'dismissed';
    setDelayedImpulses(prev => prev.filter(i => i.id !== impulseId));
    setReadyImpulses(prev => prev.filter(i => i.id !== impulseId));
    if (syncEnabled && SupabaseService.userId) await SupabaseService.updateImpulseStatus(impulseId, status);

    const message = approved
      ? "You still want it after 24 hours. Go for it!"
      : "Good call. You didn't need it after all.";

    const neroMessage: Message = { id: generateId(), role: 'nero', content: message, timestamp: new Date().toISOString() };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Feature 23: Social Battery
  const logSocialInteraction = async (type: SocialInteraction['type'], duration: number, energyCost: number) => {
    const interaction: SocialInteraction = {
      id: generateId(),
      type,
      duration,
      energyCost,
      timestamp: new Date().toISOString(),
    };
    setSocialInteractions(prev => [interaction, ...prev]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.logSocialInteraction(interaction);
    setShowLogSocial(false);
  };

  // Feature 24: Rumination Interrupt
  const handleRuminationHelp = async (action: 'journal' | 'reframe' | 'distract') => {
    setShowRuminationHelp(false);
    let content = '';

    if (action === 'journal') {
      content = "Let's write it all out. Get every thought out of your head and onto the screen. I'm listening.";
    } else if (action === 'reframe') {
      content = "Let's challenge that thought. What evidence supports it? What evidence contradicts it?";
    } else {
      content = "Sometimes the best thing is a pattern interrupt. Want to try a quick dopamine activity?";
      setShowDopamineMenu(true);
    }

    const neroMessage: Message = { id: generateId(), role: 'nero', content, timestamp: new Date().toISOString() };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Feature 25: Relationship Reminders
  const markContactMade = async (reminderId: string) => {
    setRelationshipReminders(prev => prev.map(r => r.id === reminderId ? { ...r, lastContact: new Date().toISOString() } : r));
    if (syncEnabled && SupabaseService.userId) await SupabaseService.markContactMade(reminderId);
  };

  // Feature 26: Flexible Routines
  const handleRoutineItemToggle = (routineId: string, itemId: string) => {
    setFlexibleRoutines(prev => prev.map(r => {
      if (r.id !== routineId) return r;
      const items = r.items.map(i => i.id === itemId ? { ...i, completed: !i.completed } : i);
      return { ...r, items };
    }));
  };

  const handleRoutineComplete = async () => {
    if (!currentRoutine) return;
    const completedCount = currentRoutine.items.filter(i => i.completed).length;
    const isSuccess = completedCount >= currentRoutine.minItemsForSuccess;

    const updatedRoutine = {
      ...currentRoutine,
      streak: isSuccess ? currentRoutine.streak + 1 : 0,
      lastCompleted: new Date().toISOString(),
      items: currentRoutine.items.map(i => ({ ...i, completed: false })),
    };

    setFlexibleRoutines(prev => prev.map(r => r.id === currentRoutine.id ? updatedRoutine : r));
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveFlexibleRoutine(updatedRoutine);

    setShowRoutineCheck(false);
    setCurrentRoutine(null);

    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: isSuccess
        ? `${completedCount} items done. That counts! ${updatedRoutine.streak} day streak.`
        : `${completedCount} items. Some days are like that. Tomorrow is fresh.`,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Feature 27: Shame Spiral Support
  const handleShameSupport = async (action: 'reframe' | 'compassion' | 'dismiss') => {
    setShowShameSupport(false);
    let content = '';

    if (action === 'reframe') {
      content = "Let's look at this differently. What would you tell a friend who said this about themselves?";
    } else if (action === 'compassion') {
      content = "You're being really hard on yourself. ADHD brains struggle with things that seem 'easy' to others. That's not a character flaw.";
    } else {
      content = "Okay. I'm here if you want to talk.";
    }

    const neroMessage: Message = { id: generateId(), role: 'nero', content, timestamp: new Date().toISOString() };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Feature 28: Interest-Based Suggestion
  const getInterestBasedSuggestion = () => {
    const suggestion = findInterestBasedTask(openTasks, completedTasks);
    setInterestBasedSuggestion(suggestion);
  };

  // Feature 29: Deadline Scaffolding
  const setupDeadline = async (task: Task, deadline: string) => {
    const newMilestones = generateMilestones(task, deadline);
    setMilestones(newMilestones);

    for (const milestone of newMilestones) {
      if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMilestone(milestone);
    }

    setShowDeadlineSetup(false);
    setDeadlineTask(null);

    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: `Got it. I've broken this into ${newMilestones.length} milestones. First up: "${newMilestones[0]?.description}" by ${new Date(newMilestones[0]?.dueDate).toLocaleDateString()}.`,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Feature 32: Win Journal
  const addWinEntry = async (content: string, category?: WinEntry['category']) => {
    const entry: WinEntry = {
      id: generateId(),
      content,
      timestamp: new Date().toISOString(),
      category,
    };
    setWinEntries(prev => [entry, ...prev]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveWinEntry(entry);
    setShowAddWin(false);

    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: "That's a win. Captured it. These add up.",
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  // Feature 33: Sensory Overload Mode
  const toggleSensoryOverload = async () => {
    setSensoryOverloadMode(prev => !prev);
    if (!sensoryOverloadMode) {
      // Entering overload mode
      const neroMessage: Message = {
        id: generateId(), role: 'nero',
        content: "Simplified mode on. Less noise. Just breathe.",
        timestamp: new Date().toISOString(),
      };
      setMessages(prev => [...prev, neroMessage]);
      if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
    }
  };

  // Feature 34: Task Swapping
  const handleTaskSwap = () => {
    const current = bodyDoubleSession?.taskId ? openTasks.find(t => t.id === bodyDoubleSession.taskId) : null;
    const swap = findSwapTask(current || null, openTasks);
    setSwapSuggestion(swap);
    setShowTaskSwap(true);
  };

  const acceptTaskSwap = async () => {
    setShowTaskSwap(false);
    if (swapSuggestion) {
      if (bodyDoubleMode) await endBodyDoubleMode(false);
      startBodyDoubleMode(swapSuggestion);
    }
    setSwapSuggestion(null);
  };

  // Feature 35: Commitment Device
  const addCommitment = async (description: string, deadline: string, witness?: string) => {
    const commitment: Commitment = {
      id: generateId(),
      description,
      deadline,
      witness,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    setCommitments(prev => [...prev, commitment]);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveCommitment(commitment);
    setShowAddCommitment(false);

    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: `Commitment logged: "${description}" by ${new Date(deadline).toLocaleDateString()}.${witness ? ` ${witness} is your witness.` : ''} You got this.`,
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  const resolveCommitment = async (commitmentId: string, kept: boolean) => {
    const status = kept ? 'kept' : 'broken';
    setCommitments(prev => prev.filter(c => c.id !== commitmentId));
    if (syncEnabled && SupabaseService.userId) await SupabaseService.updateCommitmentStatus(commitmentId, status);

    const neroMessage: Message = {
      id: generateId(), role: 'nero',
      content: kept ? "You kept your commitment. That matters." : "It didn't happen this time. What got in the way? No judgment.",
      timestamp: new Date().toISOString(),
    };
    const newMessages = [...messages, neroMessage];
    setMessages(newMessages);
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(neroMessage);
  };

  const clearHistory = async () => {
    if (syncEnabled && SupabaseService.userId) await SupabaseService.clearMessages();
    const confirm: Message = { id: generateId(), role: 'nero', content: "Fresh start. I still remember you.", timestamp: new Date().toISOString() };
    setMessages([confirm]);
    // Also clear the local cache; otherwise the next offline load restores the
    // messages the user just deleted.
    await AsyncStorage.setItem('@nero/messages', JSON.stringify([confirm]));
    if (syncEnabled && SupabaseService.userId) await SupabaseService.saveMessage(confirm);
    setShowSettings(false);
  };

  // ============ RENDER ============
  if (isLoading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator size="large" color={COLORS.primary} /><Text style={styles.loadingText}>Connecting...</Text></View>;
  }

  // Body Double Check-in
  if (showBodyDoubleCheckIn && bodyDoubleMode) {
    return (
      <SafeAreaView style={[styles.container, styles.bodyDoubleContainer]}>
        <StatusBar style="light" />
        <View style={styles.checkInCard}>
          <Text style={styles.checkInMessage}>{checkInPrompt}</Text>
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
            <TouchableOpacity style={styles.skipButton} onPress={() => {
              // Record the dismissal so the auto-prompt effect doesn't pop the
              // modal back open 2 seconds after the next message.
              const now = new Date().toISOString();
              setLastEnergyCheck(now);
              AsyncStorage.setItem('@nero/lastEnergyCheck', now);
              setShowEnergyCheck(false);
            }}><Text style={styles.skipButtonText}>Skip</Text></TouchableOpacity>
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

  // Focus Stats Modal
  if (showFocusStats && focusStats) {
    const insight = FocusAnalytics.generateInsight(focusStats, memory.facts.name);
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.statsContainer}>
          <View style={styles.statsCard}>
            <View style={styles.statsHeader}>
              <Text style={styles.statsTitle}>Focus Stats</Text>
              <TouchableOpacity onPress={() => setShowFocusStats(false)}><Text style={styles.statsClose}>✕</Text></TouchableOpacity>
            </View>
            
            {insight && (
              <View style={styles.insightBanner}>
                <Text style={styles.insightText}>💡 {insight}</Text>
              </View>
            )}
            
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{focusStats.totalSessions}</Text>
                <Text style={styles.statLabel}>Sessions</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatDurationShort(focusStats.totalFocusTime)}</Text>
                <Text style={styles.statLabel}>Total Focus</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{focusStats.completionRate}%</Text>
                <Text style={styles.statLabel}>Completed</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{formatDurationShort(focusStats.avgSessionLength)}</Text>
                <Text style={styles.statLabel}>Avg Session</Text>
              </View>
            </View>

            {(focusStats.bestTimeOfDay || focusStats.currentStreak > 0) && (
              <View style={styles.statsExtras}>
                {focusStats.bestTimeOfDay && (
                  <View style={styles.extraItem}>
                    <Text style={styles.extraLabel}>Best time</Text>
                    <Text style={styles.extraValue}>{focusStats.bestTimeOfDay}</Text>
                  </View>
                )}
                {focusStats.bestDayOfWeek !== null && (
                  <View style={styles.extraItem}>
                    <Text style={styles.extraLabel}>Best day</Text>
                    <Text style={styles.extraValue}>{DAY_NAMES[focusStats.bestDayOfWeek]}</Text>
                  </View>
                )}
                {focusStats.currentStreak > 0 && (
                  <View style={styles.extraItem}>
                    <Text style={styles.extraLabel}>Streak</Text>
                    <Text style={styles.extraValue}>{focusStats.currentStreak} day{focusStats.currentStreak > 1 ? 's' : ''}</Text>
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.statsButton} onPress={() => setShowFocusStats(false)}>
              <Text style={styles.statsButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ============ FEATURES 16-35 UI COMPONENTS ============

  // Feature 16: Where Was I Recovery
  if (showRecovery && sessionContext) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.recoveryContainer}>
          <View style={styles.recoveryCard}>
            <Text style={styles.recoveryTitle}>Welcome back!</Text>
            <Text style={styles.recoveryMessage}>
              You were away for {Math.round(sessionContext.awayDuration)} minutes.
              {sessionContext.lastActiveTask && `\n\nYou were working on: "${sessionContext.lastActiveTask}"`}
              {sessionContext.lastTopic && !sessionContext.lastActiveTask && `\n\nLast topic: "${sessionContext.lastTopic}..."`}
            </Text>
            <View style={styles.recoveryActions}>
              <TouchableOpacity style={styles.recoveryButton} onPress={handleRecoveryDismiss}>
                <Text style={styles.recoveryButtonText}>Start fresh</Text>
              </TouchableOpacity>
              {sessionContext.lastActiveTask && (
                <TouchableOpacity style={[styles.recoveryButton, styles.recoveryButtonPrimary]} onPress={handleRecoveryResume}>
                  <Text style={styles.recoveryButtonTextPrimary}>Resume task</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 17: Decision Fatigue Helper
  if (showDecisionHelper) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.decisionContainer}>
          <View style={styles.decisionCard}>
            <Text style={styles.decisionTitle}>I'll decide for you</Text>
            <Text style={styles.decisionMessage}>{DECISION_PROMPTS[Math.floor(Math.random() * DECISION_PROMPTS.length)]}</Text>
            {decidedTask && (
              <View style={styles.decisionTaskCard}>
                <Text style={styles.decisionTaskText}>{decidedTask.description}</Text>
              </View>
            )}
            <View style={styles.decisionActions}>
              <TouchableOpacity style={styles.decisionButton} onPress={() => { setDecidedTask(pickRandomTask(openTasks)); }}>
                <Text style={styles.decisionButtonText}>Pick another</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.decisionButton, styles.decisionButtonPrimary]} onPress={handleDecisionAccept}>
                <Text style={styles.decisionButtonTextPrimary}>Do this one</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.decisionDismiss} onPress={() => setShowDecisionHelper(false)}>
              <Text style={styles.decisionDismissText}>Never mind</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 18: Dopamine Menu
  if (showDopamineMenu) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.dopamineContainer}>
          <View style={styles.dopamineCard}>
            <Text style={styles.dopamineTitle}>Dopamine Menu</Text>
            <Text style={styles.dopamineSubtitle}>Pick a quick reward</Text>
            <ScrollView style={styles.dopamineList}>
              {dopamineActivities.map(activity => (
                <TouchableOpacity key={activity.id} style={styles.dopamineItem} onPress={() => handleDopamineSelect(activity)}>
                  <Text style={styles.dopamineItemName}>{activity.name}</Text>
                  <Text style={styles.dopamineItemDuration}>{activity.duration}m</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.dopamineDismiss} onPress={() => setShowDopamineMenu(false)}>
              <Text style={styles.dopamineDismissText}>Not now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 19: Time Blindness Anchor
  if (showTimeAnchor && bodyDoubleMode && bodyDoubleSession) {
    const timeString = formatTimeAnchor(bodyDoubleSession.startedAt);
    return (
      <SafeAreaView style={[styles.container, styles.bodyDoubleContainer]}>
        <StatusBar style="light" />
        <View style={styles.timeAnchorCard}>
          <Text style={styles.timeAnchorTitle}>Time Check</Text>
          <Text style={styles.timeAnchorMessage}>{timeAnchorMessage.replace('{duration}', timeString)}</Text>
          <TouchableOpacity style={styles.timeAnchorButton} onPress={handleTimeAnchorDismiss}>
            <Text style={styles.timeAnchorButtonText}>Got it</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 20: Emotional Regulation Check
  if (showEmotionalCheck) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.emotionalContainer}>
          <View style={styles.emotionalCard}>
            <Text style={styles.emotionalTitle}>Emotional check-in</Text>
            <Text style={styles.emotionalSubtitle}>How are you feeling right now?</Text>
            <View style={styles.emotionalGrid}>
              {EMOTION_OPTIONS.map(emotion => (
                <TouchableOpacity key={emotion} style={[styles.emotionalOption, currentEmotion === emotion && styles.emotionalOptionSelected]} onPress={() => setCurrentEmotion(emotion)}>
                  <Text style={[styles.emotionalOptionText, currentEmotion === emotion && styles.emotionalOptionTextSelected]}>{emotion}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {currentEmotion && (
              <View style={styles.intensitySlider}>
                <Text style={styles.intensityLabel}>Intensity: {emotionIntensity}/5</Text>
                <View style={styles.intensityButtons}>
                  {[1,2,3,4,5].map(n => (
                    <TouchableOpacity key={n} style={[styles.intensityButton, emotionIntensity === n && styles.intensityButtonSelected]} onPress={() => setEmotionIntensity(n)}>
                      <Text style={styles.intensityButtonText}>{n}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}
            <View style={styles.emotionalActions}>
              <TouchableOpacity style={styles.emotionalSkip} onPress={() => setShowEmotionalCheck(false)}>
                <Text style={styles.emotionalSkipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.emotionalSubmit, !currentEmotion && styles.emotionalSubmitDisabled]} onPress={handleEmotionalSubmit} disabled={!currentEmotion}>
                <Text style={styles.emotionalSubmitText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 21: Procrastination Buddy
  if (showProcrastinationHelp && procrastinationTask) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.procrastinationContainer}>
          <View style={styles.procrastinationCard}>
            <Text style={styles.procrastinationTitle}>What's blocking you?</Text>
            <Text style={styles.procrastinationTask}>Task: "{procrastinationTask.description}"</Text>
            <ScrollView style={styles.procrastinationOptions}>
              {PROCRASTINATION_BLOCKERS.map((blocker, i) => (
                <TouchableOpacity key={i} style={styles.procrastinationOption} onPress={() => handleProcrastinationBlocker(blocker)}>
                  <Text style={styles.procrastinationOptionText}>{blocker.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity style={styles.procrastinationDismiss} onPress={() => setShowProcrastinationHelp(false)}>
              <Text style={styles.procrastinationDismissText}>Something else</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 22: Ready Impulses Review
  if (readyImpulses.length > 0 && !showImpulseBuffer) {
    const impulse = readyImpulses[0];
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.impulseContainer}>
          <View style={styles.impulseCard}>
            <Text style={styles.impulseTitle}>24 hours later...</Text>
            <Text style={styles.impulseMessage}>You wanted to: "{impulse.description}"</Text>
            {impulse.estimatedCost && <Text style={styles.impulseCost}>${impulse.estimatedCost}</Text>}
            <Text style={styles.impulseQuestion}>Do you still want this?</Text>
            <View style={styles.impulseActions}>
              <TouchableOpacity style={styles.impulseButton} onPress={() => handleImpulseDecision(impulse.id, false)}>
                <Text style={styles.impulseButtonText}>Nah, I'm good</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.impulseButton, styles.impulseButtonPrimary]} onPress={() => handleImpulseDecision(impulse.id, true)}>
                <Text style={styles.impulseButtonTextPrimary}>Still want it</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 23: Social Battery Warning
  if (socialBattery <= 2 && !showSocialBattery && socialInteractions.length > 0) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.socialContainer}>
          <View style={styles.socialCard}>
            <Text style={styles.socialTitle}>Social Battery Low</Text>
            <View style={styles.batteryIndicator}>
              <View style={[styles.batteryLevel, { width: `${socialBattery * 10}%` }]} />
            </View>
            <Text style={styles.socialMessage}>You've had a lot of social interaction today. Consider some alone time.</Text>
            <TouchableOpacity style={styles.socialButton} onPress={() => setShowSocialBattery(true)}>
              <Text style={styles.socialButtonText}>Thanks for the heads up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 24: Rumination Help
  if (showRuminationHelp) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.ruminationContainer}>
          <View style={styles.ruminationCard}>
            <Text style={styles.ruminationTitle}>Thought loop detected</Text>
            <Text style={styles.ruminationMessage}>You've been circling around similar thoughts. That's exhausting. Want to try something?</Text>
            <View style={styles.ruminationActions}>
              <TouchableOpacity style={styles.ruminationButton} onPress={() => handleRuminationHelp('journal')}>
                <Text style={styles.ruminationButtonText}>Write it out</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ruminationButton} onPress={() => handleRuminationHelp('reframe')}>
                <Text style={styles.ruminationButtonText}>Challenge it</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.ruminationButton} onPress={() => handleRuminationHelp('distract')}>
                <Text style={styles.ruminationButtonText}>Break the loop</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.ruminationDismiss} onPress={() => setShowRuminationHelp(false)}>
              <Text style={styles.ruminationDismissText}>I'm okay</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 27: Shame Spiral Support
  if (showShameSupport) {
    const shameMessage = SHAME_RESPONSES[Math.floor(Math.random() * SHAME_RESPONSES.length)];
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.shameContainer}>
          <View style={styles.shameCard}>
            <Text style={styles.shameTitle}>Hey, pause for a sec</Text>
            <Text style={styles.shameMessage}>{shameMessage}</Text>
            <View style={styles.shameActions}>
              <TouchableOpacity style={styles.shameButton} onPress={() => handleShameSupport('reframe')}>
                <Text style={styles.shameButtonText}>Help me reframe</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shameButton} onPress={() => handleShameSupport('compassion')}>
                <Text style={styles.shameButtonText}>I need compassion</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.shameDismiss} onPress={() => handleShameSupport('dismiss')}>
              <Text style={styles.shameDismissText}>I'm okay</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 32: Win Journal
  if (showWinJournal) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.winJournalContainer}>
          <View style={styles.winJournalCard}>
            <View style={styles.winJournalHeader}>
              <Text style={styles.winJournalTitle}>Win Journal</Text>
              <TouchableOpacity onPress={() => setShowWinJournal(false)}><Text style={styles.winJournalClose}>✕</Text></TouchableOpacity>
            </View>
            {winEntries.length === 0 ? (
              <Text style={styles.winJournalEmpty}>No wins recorded yet. Start capturing the good stuff!</Text>
            ) : (
              <ScrollView style={styles.winJournalList}>
                {winEntries.slice(0, 10).map(entry => (
                  <View key={entry.id} style={styles.winEntry}>
                    <Text style={styles.winEntryText}>{entry.content}</Text>
                    <Text style={styles.winEntryDate}>{getRelativeTime(entry.timestamp)}</Text>
                  </View>
                ))}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.winJournalAdd} onPress={() => { setCurrentWinPrompt(WIN_JOURNAL_PROMPTS[Math.floor(Math.random() * WIN_JOURNAL_PROMPTS.length)]); setShowAddWin(true); }}>
              <Text style={styles.winJournalAddText}>+ Add a win</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 34: Task Swap
  if (showTaskSwap && swapSuggestion) {
    return (
      <SafeAreaView style={[styles.container, bodyDoubleMode && styles.bodyDoubleContainer]}>
        <StatusBar style="light" />
        <View style={styles.swapContainer}>
          <View style={styles.swapCard}>
            <Text style={styles.swapTitle}>Stuck? Try switching</Text>
            <Text style={styles.swapMessage}>{TASK_SWAP_MESSAGES[Math.floor(Math.random() * TASK_SWAP_MESSAGES.length)]}</Text>
            <View style={styles.swapTaskCard}>
              <Text style={styles.swapTaskText}>{swapSuggestion.description}</Text>
            </View>
            <View style={styles.swapActions}>
              <TouchableOpacity style={styles.swapButton} onPress={() => setShowTaskSwap(false)}>
                <Text style={styles.swapButtonText}>Stay on current</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.swapButton, styles.swapButtonPrimary]} onPress={acceptTaskSwap}>
                <Text style={styles.swapButtonTextPrimary}>Switch to this</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 35: Overdue Commitments
  if (overdueCommitments.length > 0 && !showCommitments) {
    const commitment = overdueCommitments[0];
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.commitmentContainer}>
          <View style={styles.commitmentCard}>
            <Text style={styles.commitmentTitle}>Commitment check</Text>
            <Text style={styles.commitmentMessage}>"{commitment.description}"</Text>
            <Text style={styles.commitmentDeadline}>Was due: {new Date(commitment.deadline).toLocaleDateString()}</Text>
            <View style={styles.commitmentActions}>
              <TouchableOpacity style={styles.commitmentButton} onPress={() => resolveCommitment(commitment.id, false)}>
                <Text style={styles.commitmentButtonText}>Didn't happen</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.commitmentButton, styles.commitmentButtonPrimary]} onPress={() => resolveCommitment(commitment.id, true)}>
                <Text style={styles.commitmentButtonTextPrimary}>I did it!</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 15: Crisis Mode
  if (crisisMode) {
    return (
      <SafeAreaView style={[styles.container, styles.crisisContainer]}>
        <StatusBar style="light" />
        <View style={styles.crisisContent}>
          <Text style={styles.crisisTitle}>Everything can wait.</Text>
          <Text style={styles.crisisSubtitle}>Let's just breathe together.</Text>

          <View style={styles.breathingCircleContainer}>
            <Animated.View style={[styles.breathingCircle, breathingPhase === 'inhale' && styles.breathingInhale, breathingPhase === 'exhale' && styles.breathingExhale]}>
              <Text style={styles.breathingText}>
                {breathingPhase === 'inhale' ? 'Breathe in...' : breathingPhase === 'hold' ? 'Hold...' : 'Breathe out...'}
              </Text>
            </Animated.View>
          </View>

          <Text style={styles.breathingCount}>{breathingCount} breaths</Text>

          {breathingCount >= 5 && (
            <TouchableOpacity style={styles.crisisExitButton} onPress={exitCrisisMode}>
              <Text style={styles.crisisExitText}>I'm feeling better</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={styles.crisisSkipButton} onPress={exitCrisisMode}>
            <Text style={styles.crisisSkipText}>Exit</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 7: RSD Support
  if (showRSDSupport) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.rsdContainer}>
          <View style={styles.rsdCard}>
            <Text style={styles.rsdTitle}>I noticed something</Text>
            <Text style={styles.rsdMessage}>{RSD_SUPPORT_MESSAGES[Math.floor(Math.random() * RSD_SUPPORT_MESSAGES.length)]}</Text>

            <View style={styles.rsdActions}>
              <TouchableOpacity style={styles.rsdButton} onPress={() => handleRSDSupport('talk')}>
                <Text style={styles.rsdButtonText}>Let's talk</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.rsdButton} onPress={() => handleRSDSupport('reframe')}>
                <Text style={styles.rsdButtonText}>Help me reframe</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.rsdDismiss} onPress={() => handleRSDSupport('dismiss')}>
              <Text style={styles.rsdDismissText}>I'm okay, thanks</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 4: Emotion/Context Tagging
  if (showEmotionTag) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.emotionContainer}>
          <View style={styles.emotionCard}>
            <Text style={styles.emotionTitle}>What's going on?</Text>
            <Text style={styles.emotionSubtitle}>This helps me understand and support you better</Text>

            <Text style={styles.emotionSectionLabel}>How are you feeling?</Text>
            <View style={styles.tagGrid}>
              {EMOTION_TAGS.map(tag => (
                <TouchableOpacity key={tag} style={[styles.tag, selectedEmotionTags.includes(tag) && styles.tagSelected]} onPress={() => toggleEmotionTag(tag)}>
                  <Text style={[styles.tagText, selectedEmotionTags.includes(tag) && styles.tagTextSelected]}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.emotionSectionLabel}>Any context?</Text>
            <View style={styles.tagGrid}>
              {CONTEXT_TAGS.map(tag => (
                <TouchableOpacity key={tag} style={[styles.tag, selectedContextTags.includes(tag) && styles.tagSelected]} onPress={() => toggleContextTag(tag)}>
                  <Text style={[styles.tagText, selectedContextTags.includes(tag) && styles.tagTextSelected]}>{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.emotionActions}>
              <TouchableOpacity style={styles.emotionSkip} onPress={() => { setShowEmotionTag(false); handleEnergySubmit(currentEnergy || 2, 'low', true); }}>
                <Text style={styles.emotionSkipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.emotionSubmit} onPress={handleEmotionTagComplete}>
                <Text style={styles.emotionSubmitText}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 6: Hyperfocus Warning
  if (hyperfocusWarning && bodyDoubleMode) {
    const checkInMessage = HYPERFOCUS_CHECK_INS[Math.floor(Math.random() * HYPERFOCUS_CHECK_INS.length)];
    return (
      <SafeAreaView style={[styles.container, styles.bodyDoubleContainer]}>
        <StatusBar style="light" />
        <View style={styles.hyperfocusCard}>
          <Text style={styles.hyperfocusTitle}>Deep focus check-in</Text>
          <Text style={styles.hyperfocusMessage}>{checkInMessage}</Text>

          <View style={styles.hyperfocusActions}>
            <TouchableOpacity style={styles.hyperfocusButton} onPress={() => handleHyperfocusResponse('continue')}>
              <Text style={styles.hyperfocusButtonText}>I'm good, keep going</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.hyperfocusButton} onPress={() => handleHyperfocusResponse('break')}>
              <Text style={styles.hyperfocusButtonText}>Take a break</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.hyperfocusButton} onPress={() => handleHyperfocusResponse('end')}>
              <Text style={styles.hyperfocusButtonText}>I'm done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 5: Transition Support
  if (showTransitionSupport) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.transitionContainer}>
          <View style={styles.transitionCard}>
            <Text style={styles.transitionTitle}>Nice session!</Text>
            <Text style={styles.transitionMessage}>Before jumping to the next thing, take a moment to transition.</Text>

            <View style={styles.transitionTips}>
              <Text style={styles.transitionTip}>• Stretch your body</Text>
              <Text style={styles.transitionTip}>• Get some water</Text>
              <Text style={styles.transitionTip}>• Look at something far away</Text>
              <Text style={styles.transitionTip}>• Take 3 deep breaths</Text>
            </View>

            <TouchableOpacity style={styles.transitionButton} onPress={handleTransitionEnd}>
              <Text style={styles.transitionButtonText}>I'm ready</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 10: Medication Reminder
  if (showMedReminder && pendingMedReminder) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.medReminderContainer}>
          <View style={styles.medReminderCard}>
            <Text style={styles.medReminderTitle}>Medication Reminder</Text>
            <Text style={styles.medReminderName}>{pendingMedReminder.name}</Text>
            <Text style={styles.medReminderMessage}>Just a gentle reminder. No judgment either way.</Text>

            <View style={styles.medReminderActions}>
              <TouchableOpacity style={styles.medReminderButton} onPress={() => handleMedReminderResponse(false)}>
                <Text style={styles.medReminderButtonText}>Not now</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.medReminderButton, styles.medReminderButtonPrimary]} onPress={() => handleMedReminderResponse(true)}>
                <Text style={styles.medReminderButtonTextPrimary}>Taken</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 9: Reflection View
  if (showReflection && reflectionData) {
    const insight = generateWeeklyInsight(reflectionData);
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.reflectionContainer}>
          <View style={styles.reflectionCard}>
            <View style={styles.reflectionHeader}>
              <Text style={styles.reflectionTitle}>{reflectionData.period === 'week' ? 'This Week' : 'This Month'}</Text>
              <TouchableOpacity onPress={() => setShowReflection(false)}><Text style={styles.reflectionClose}>✕</Text></TouchableOpacity>
            </View>

            <Text style={styles.reflectionInsight}>{insight}</Text>

            <View style={styles.reflectionStats}>
              <View style={styles.reflectionStat}>
                <Text style={styles.reflectionStatValue}>{reflectionData.tasksCompleted}</Text>
                <Text style={styles.reflectionStatLabel}>Tasks Done</Text>
              </View>
              <View style={styles.reflectionStat}>
                <Text style={styles.reflectionStatValue}>{formatDurationShort(reflectionData.totalFocusTime)}</Text>
                <Text style={styles.reflectionStatLabel}>Focus Time</Text>
              </View>
              <View style={styles.reflectionStat}>
                <Text style={styles.reflectionStatValue}>{reflectionData.avgEnergy}/5</Text>
                <Text style={styles.reflectionStatLabel}>Avg Energy</Text>
              </View>
            </View>

            {reflectionData.wins.length > 0 && (
              <View style={styles.reflectionWins}>
                <Text style={styles.reflectionWinsTitle}>Wins</Text>
                {reflectionData.wins.slice(0, 3).map((win, i) => (
                  <Text key={i} style={styles.reflectionWin}>✓ {win}</Text>
                ))}
              </View>
            )}

            <TouchableOpacity style={styles.reflectionButton} onPress={() => setShowReflection(false)}>
              <Text style={styles.reflectionButtonText}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 13: Done List Celebration
  if (showDoneList) {
    const message = generateDoneListMessage(todayCompletedTasks, todayFocusTime, memory.facts.name);
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.doneListContainer}>
          <View style={styles.doneListCard}>
            <Text style={styles.doneListTitle}>Today's Wins</Text>
            <Text style={styles.doneListMessage}>{message}</Text>

            <TouchableOpacity style={styles.doneListButton} onPress={() => setShowDoneList(false)}>
              <Text style={styles.doneListButtonText}>Thanks, Nero</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 8: Waiting Mode View
  if (showWaitingMode) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.waitingContainer}>
          <View style={styles.waitingCard}>
            <View style={styles.waitingHeader}>
              <Text style={styles.waitingTitle}>Waiting On</Text>
              <TouchableOpacity onPress={() => setShowWaitingMode(false)}><Text style={styles.waitingClose}>✕</Text></TouchableOpacity>
            </View>

            {waitingItems.length === 0 ? (
              <Text style={styles.waitingEmpty}>Nothing in the waiting queue</Text>
            ) : (
              <ScrollView style={styles.waitingList}>
                {waitingItems.map(item => (
                  <View key={item.id} style={styles.waitingItem}>
                    <View style={styles.waitingItemContent}>
                      <Text style={styles.waitingItemDesc}>{item.description}</Text>
                      <Text style={styles.waitingItemFor}>From: {item.waitingFor}</Text>
                      <Text style={styles.waitingItemAge}>{getRelativeTime(item.createdAt)}</Text>
                    </View>
                    <View style={styles.waitingItemActions}>
                      <TouchableOpacity style={styles.waitingItemButton} onPress={() => resolveWaitingItem(item.id, true)}>
                        <Text style={styles.waitingItemButtonText}>✓</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.waitingItemButton, styles.waitingItemButtonDelete]} onPress={() => resolveWaitingItem(item.id, false)}>
                        <Text style={styles.waitingItemButtonText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}

            <TouchableOpacity style={styles.waitingAddButton} onPress={() => setShowAddWaiting(true)}>
              <Text style={styles.waitingAddButtonText}>+ Add something you're waiting on</Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 14: Parallel Tasks View
  if (showParallelTasks) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.parallelContainer}>
          <View style={styles.parallelCard}>
            <View style={styles.parallelHeader}>
              <Text style={styles.parallelTitle}>Tasks in Flight</Text>
              <TouchableOpacity onPress={() => setShowParallelTasks(false)}><Text style={styles.parallelClose}>✕</Text></TouchableOpacity>
            </View>

            <Text style={styles.parallelSubtitle}>{activeTasks.length} task{activeTasks.length !== 1 ? 's' : ''} you're juggling</Text>

            {activeTasks.map(task => (
              <View key={task.taskId} style={styles.parallelTask}>
                <View style={[styles.parallelTaskStatus, task.status === 'active' ? styles.parallelTaskActive : styles.parallelTaskPaused]} />
                <Text style={styles.parallelTaskText}>{task.description}</Text>
                <TouchableOpacity style={styles.parallelTaskFocus} onPress={() => focusOnTask(task)}>
                  <Text style={styles.parallelTaskFocusText}>Focus</Text>
                </TouchableOpacity>
              </View>
            ))}

            <Text style={styles.parallelHint}>Want to pick one to focus on?</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Feature 12: Sensory Environment Check
  if (showSensoryCheck) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.sensoryContainer}>
          <View style={styles.sensoryCard}>
            <Text style={styles.sensoryTitle}>Environment Check</Text>
            <Text style={styles.sensorySubtitle}>Is your space helping or hurting?</Text>

            <Text style={styles.sensorySectionLabel}>Lighting</Text>
            <View style={styles.sensoryOptions}>
              {SENSORY_OPTIONS.lighting.map(opt => (
                <TouchableOpacity key={opt} style={[styles.sensoryOption, currentSensorySettings.lighting === opt && styles.sensoryOptionSelected]} onPress={() => setCurrentSensorySettings(prev => ({ ...prev, lighting: opt }))}>
                  <Text style={[styles.sensoryOptionText, currentSensorySettings.lighting === opt && styles.sensoryOptionTextSelected]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.sensorySectionLabel}>Sound</Text>
            <View style={styles.sensoryOptions}>
              {SENSORY_OPTIONS.sound.map(opt => (
                <TouchableOpacity key={opt} style={[styles.sensoryOption, currentSensorySettings.sound === opt && styles.sensoryOptionSelected]} onPress={() => setCurrentSensorySettings(prev => ({ ...prev, sound: opt }))}>
                  <Text style={[styles.sensoryOptionText, currentSensorySettings.sound === opt && styles.sensoryOptionTextSelected]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.sensoryActions}>
              <TouchableOpacity style={styles.sensorySkip} onPress={() => setShowSensoryCheck(false)}>
                <Text style={styles.sensorySkipText}>Skip</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sensorySubmit} onPress={handleSensorySubmit}>
                <Text style={styles.sensorySubmitText}>Save</Text>
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

            {focusStats && focusStats.totalSessions > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Focus Analytics</Text>
                <TouchableOpacity style={styles.focusStatsPreview} onPress={() => { setShowSettings(false); setShowFocusStats(true); }}>
                  <View style={styles.focusStatsRow}>
                    <Text style={styles.focusStatMini}>{focusStats.totalSessions} sessions</Text>
                    <Text style={styles.focusStatMini}>{formatDurationShort(focusStats.totalFocusTime)} total</Text>
                    <Text style={styles.focusStatMini}>{focusStats.completionRate}% done</Text>
                  </View>
                  <Text style={styles.viewAllLink}>View details →</Text>
                </TouchableOpacity>
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

            {/* Feature 11: External Motivation Mode */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>External Motivation Mode</Text>
              <TouchableOpacity style={styles.toggleRow} onPress={toggleExternalMotivation}>
                <Text style={styles.toggleLabel}>Get prompts every 10 min</Text>
                <View style={[styles.toggle, externalMotivationMode && styles.toggleOn]}><View style={[styles.toggleThumb, externalMotivationMode && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
              <Text style={styles.settingsHint}>For when internal motivation is gone</Text>
            </View>

            {/* Feature 8: Waiting Mode */}
            {waitingItems.length > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Waiting On ({waitingItems.length})</Text>
                <TouchableOpacity style={styles.waitingPreview} onPress={() => { setShowSettings(false); setShowWaitingMode(true); }}>
                  <Text style={styles.waitingPreviewText}>{waitingItems[0].description}</Text>
                  {waitingItems.length > 1 && <Text style={styles.waitingPreviewMore}>+{waitingItems.length - 1} more</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Feature 14: Parallel Tasks */}
            {activeTasks.length > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Tasks in Flight ({activeTasks.length})</Text>
                <TouchableOpacity style={styles.parallelPreview} onPress={() => { setShowSettings(false); setShowParallelTasks(true); }}>
                  {activeTasks.slice(0, 2).map(t => (
                    <Text key={t.taskId} style={styles.parallelPreviewText}>• {t.description}</Text>
                  ))}
                  {activeTasks.length > 2 && <Text style={styles.parallelPreviewMore}>+{activeTasks.length - 2} more</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Feature 9: Reflection */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Reflection</Text>
              <View style={styles.reflectionButtons}>
                <TouchableOpacity style={styles.reflectionPreviewButton} onPress={() => { setShowSettings(false); loadReflection('week'); }}>
                  <Text style={styles.reflectionPreviewButtonText}>This Week</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.reflectionPreviewButton} onPress={() => { setShowSettings(false); loadReflection('month'); }}>
                  <Text style={styles.reflectionPreviewButtonText}>This Month</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Feature 13: Done List */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.doneListPreview} onPress={() => { setShowSettings(false); setShowDoneList(true); }}>
                <Text style={styles.doneListPreviewText}>🎉 See Today's Wins</Text>
              </TouchableOpacity>
            </View>

            {/* Feature 12: Sensory Check */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.sensoryPreview} onPress={() => { setShowSettings(false); setShowSensoryCheck(true); }}>
                <Text style={styles.sensoryPreviewText}>🌿 Environment Check</Text>
              </TouchableOpacity>
            </View>

            {/* Feature 17: Decision Helper */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.featureButton} onPress={() => { setShowSettings(false); handleDecisionHelp(); }}>
                <Text style={styles.featureButtonText}>🎲 Decide for me</Text>
              </TouchableOpacity>
              <Text style={styles.settingsHint}>Too many choices? Let Nero pick.</Text>
            </View>

            {/* Feature 18: Dopamine Menu */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.featureButton} onPress={() => { setShowSettings(false); setShowDopamineMenu(true); }}>
                <Text style={styles.featureButtonText}>🍭 Dopamine Menu</Text>
              </TouchableOpacity>
              <Text style={styles.settingsHint}>Quick healthy rewards</Text>
            </View>

            {/* Feature 20: Emotional Check-in */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.featureButton} onPress={() => { setShowSettings(false); setShowEmotionalCheck(true); }}>
                <Text style={styles.featureButtonText}>💭 Emotional Check-in</Text>
              </TouchableOpacity>
            </View>

            {/* Feature 22: Impulse Buffer */}
            {delayedImpulses.length > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>Impulse Buffer ({delayedImpulses.length})</Text>
                <TouchableOpacity style={styles.featurePreview} onPress={() => { setShowSettings(false); setShowImpulseBuffer(true); }}>
                  <Text style={styles.featurePreviewText}>{delayedImpulses[0].description}</Text>
                  {delayedImpulses.length > 1 && <Text style={styles.featurePreviewMore}>+{delayedImpulses.length - 1} more waiting</Text>}
                </TouchableOpacity>
              </View>
            )}

            {/* Feature 23: Social Battery */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Social Battery</Text>
              <View style={styles.batteryRow}>
                <View style={styles.batteryIndicatorSmall}>
                  <View style={[styles.batteryLevelSmall, { width: `${socialBattery * 10}%`, backgroundColor: socialBattery > 5 ? COLORS.accent : socialBattery > 2 ? COLORS.warning : COLORS.delete }]} />
                </View>
                <Text style={styles.batteryText}>{socialBattery}/10</Text>
                <TouchableOpacity onPress={() => { setShowSettings(false); setShowLogSocial(true); }}>
                  <Text style={styles.updateLink}>Log interaction</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Feature 25: Relationship Reminders */}
            {overdueContacts.length > 0 && (
              <View style={styles.settingsSection}>
                <Text style={styles.settingsLabel}>People to reach out to</Text>
                {overdueContacts.slice(0, 3).map(r => (
                  <View key={r.id} style={styles.relationshipRow}>
                    <Text style={styles.relationshipName}>{r.personName}</Text>
                    <TouchableOpacity onPress={() => markContactMade(r.id)}>
                      <Text style={styles.relationshipAction}>Mark contacted</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Feature 32: Win Journal */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.featureButton} onPress={() => { setShowSettings(false); setShowWinJournal(true); }}>
                <Text style={styles.featureButtonText}>🏆 Win Journal ({winEntries.length})</Text>
              </TouchableOpacity>
            </View>

            {/* Feature 33: Sensory Overload Mode */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.toggleRow} onPress={toggleSensoryOverload}>
                <Text style={styles.toggleLabel}>Sensory Overload Mode</Text>
                <View style={[styles.toggle, sensoryOverloadMode && styles.toggleOn]}><View style={[styles.toggleThumb, sensoryOverloadMode && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
              <Text style={styles.settingsHint}>Simplified, calmer UI</Text>
            </View>

            {/* Feature 31: Quiet Hours */}
            <View style={styles.settingsSection}>
              <TouchableOpacity style={styles.toggleRow} onPress={() => setQuietHours(prev => ({ ...prev, enabled: !prev.enabled }))}>
                <Text style={styles.toggleLabel}>Quiet Hours ({quietHours.startTime} - {quietHours.endTime})</Text>
                <View style={[styles.toggle, quietHours.enabled && styles.toggleOn]}><View style={[styles.toggleThumb, quietHours.enabled && styles.toggleThumbOn]} /></View>
              </TouchableOpacity>
              <Text style={styles.settingsHint}>No check-ins during these hours</Text>
            </View>

            {/* Feature 35: Commitments */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Commitments ({commitments.length})</Text>
              <TouchableOpacity style={styles.featureButton} onPress={() => { setShowSettings(false); setShowAddCommitment(true); }}>
                <Text style={styles.featureButtonText}>+ Make a commitment</Text>
              </TouchableOpacity>
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

  // Main Chat
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

        {/* Feature 11: External Motivation Mode Banner */}
        {externalMotivationMode && !bodyDoubleMode && currentMotivationPrompt && (
          <View style={styles.motivationBanner}>
            <Text style={styles.motivationBannerText}>{currentMotivationPrompt}</Text>
          </View>
        )}

        {/* Feature 1: Upcoming Time Block Banner */}
        {upcomingBlock && !bodyDoubleMode && (
          <View style={[styles.motivationBanner, { backgroundColor: COLORS.suggestion + '20', borderBottomColor: COLORS.suggestion + '40' }]}>
            <Text style={[styles.motivationBannerText, { color: COLORS.suggestion }]}>Coming up: {upcomingBlock.title} at {upcomingBlock.startTime}</Text>
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

        {/* Floating Action Button for Quick Add */}
        {!bodyDoubleMode && (
          <Animated.View style={[styles.fab, { transform: [{ scale: fabAnim }] }]}>
            <TouchableOpacity style={styles.fabButton} onPress={() => setShowQuickAdd(true)}>
              <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>
          </Animated.View>
        )}
      </KeyboardAvoidingView>

      <QuickAddModal visible={showQuickAdd} onClose={() => setShowQuickAdd(false)} onAdd={handleQuickAdd} voiceEnabled={voiceEnabled} />
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
  messagesContent: { padding: 16, paddingBottom: 80 },
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

  // FAB
  fab: { position: 'absolute', bottom: 90, right: 20 },
  fabButton: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.quickAdd, justifyContent: 'center', alignItems: 'center', shadowColor: COLORS.quickAdd, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
  fabText: { color: COLORS.text, fontSize: 32, fontWeight: '300', marginTop: -2 },

  // Quick Add Modal
  quickAddOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  quickAddBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.7)' },
  quickAddCard: { backgroundColor: COLORS.surface, borderRadius: 20, padding: 24, width: '90%', maxWidth: 400 },
  quickAddTitle: { color: COLORS.text, fontSize: 20, fontWeight: '600', marginBottom: 16 },
  quickAddInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  quickAddInput: { flex: 1, backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 14, color: COLORS.text, fontSize: 16, minHeight: 50, maxHeight: 100 },
  quickAddVoice: { width: 44, height: 44, borderRadius: 22, backgroundColor: COLORS.surfaceLight, justifyContent: 'center', alignItems: 'center' },
  quickAddVoiceActive: { backgroundColor: COLORS.recording },
  quickAddVoiceText: { fontSize: 18 },
  quickAddActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  quickAddCancel: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  quickAddCancelText: { color: COLORS.textMuted, fontSize: 16, fontWeight: '500' },
  quickAddSubmit: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.quickAdd, alignItems: 'center' },
  quickAddSubmitDisabled: { opacity: 0.5 },
  quickAddSubmitText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },

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

  // Focus Stats
  statsContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  statsCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  statsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  statsTitle: { color: COLORS.text, fontSize: 22, fontWeight: '600' },
  statsClose: { color: COLORS.textMuted, fontSize: 24, padding: 4 },
  insightBanner: { backgroundColor: COLORS.bodyDouble + '20', borderRadius: 12, padding: 14, marginBottom: 20, borderLeftWidth: 3, borderLeftColor: COLORS.bodyDouble },
  insightText: { color: COLORS.text, fontSize: 15, lineHeight: 22 },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  statItem: { width: '47%', backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16, alignItems: 'center' },
  statValue: { color: COLORS.text, fontSize: 28, fontWeight: '700' },
  statLabel: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
  statsExtras: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  extraItem: { flex: 1, backgroundColor: COLORS.surfaceLight, borderRadius: 10, padding: 12, alignItems: 'center' },
  extraLabel: { color: COLORS.textDim, fontSize: 11, marginBottom: 4 },
  extraValue: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  statsButton: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  statsButtonText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },

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

  focusStatsPreview: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16 },
  focusStatsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  focusStatMini: { color: COLORS.text, fontSize: 13 },
  viewAllLink: { color: COLORS.bodyDouble, fontSize: 13, fontWeight: '500' },

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

  // ============ NEW FEATURE STYLES ============

  // Feature 15: Crisis Mode
  crisisContainer: { backgroundColor: '#0a0505' },
  crisisContent: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  crisisTitle: { color: COLORS.text, fontSize: 28, fontWeight: '300', marginBottom: 8, textAlign: 'center' },
  crisisSubtitle: { color: COLORS.textMuted, fontSize: 18, marginBottom: 48, textAlign: 'center' },
  breathingCircleContainer: { width: 200, height: 200, justifyContent: 'center', alignItems: 'center', marginBottom: 32 },
  breathingCircle: { width: 150, height: 150, borderRadius: 75, backgroundColor: COLORS.calm + '30', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: COLORS.calm },
  breathingInhale: { transform: [{ scale: 1.3 }] },
  breathingExhale: { transform: [{ scale: 0.8 }] },
  breathingText: { color: COLORS.calm, fontSize: 16, fontWeight: '500' },
  breathingCount: { color: COLORS.textDim, fontSize: 14, marginBottom: 32 },
  crisisExitButton: { backgroundColor: COLORS.calm, paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12, marginBottom: 16 },
  crisisExitText: { color: COLORS.bg, fontSize: 16, fontWeight: '600' },
  crisisSkipButton: { padding: 12 },
  crisisSkipText: { color: COLORS.textDim, fontSize: 14 },

  // Feature 7: RSD Support
  rsdContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  rsdCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  rsdTitle: { color: COLORS.rsd, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  rsdMessage: { color: COLORS.text, fontSize: 20, lineHeight: 28, marginBottom: 24 },
  rsdActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  rsdButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  rsdButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '500' },
  rsdDismiss: { padding: 12, alignItems: 'center' },
  rsdDismissText: { color: COLORS.textDim, fontSize: 14 },

  // Feature 4: Emotion/Context Tagging
  emotionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emotionCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 420 },
  emotionTitle: { color: COLORS.text, fontSize: 22, fontWeight: '600', marginBottom: 8 },
  emotionSubtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: 24 },
  emotionSectionLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 16 },
  tagGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { backgroundColor: COLORS.surfaceLight, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  tagSelected: { backgroundColor: COLORS.emotion + '30', borderColor: COLORS.emotion },
  tagText: { color: COLORS.textMuted, fontSize: 13 },
  tagTextSelected: { color: COLORS.emotion },
  emotionActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  emotionSkip: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  emotionSkipText: { color: COLORS.textMuted, fontSize: 16 },
  emotionSubmit: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.emotion, alignItems: 'center' },
  emotionSubmitText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },

  // Feature 6: Hyperfocus Warning
  hyperfocusCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '90%', maxWidth: 400 },
  hyperfocusTitle: { color: COLORS.hyperfocus, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  hyperfocusMessage: { color: COLORS.text, fontSize: 18, lineHeight: 26, marginBottom: 24 },
  hyperfocusActions: { gap: 12 },
  hyperfocusButton: { padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  hyperfocusButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '500' },

  // Feature 5: Transition Support
  transitionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  transitionCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 380 },
  transitionTitle: { color: COLORS.transition, fontSize: 20, fontWeight: '600', marginBottom: 8 },
  transitionMessage: { color: COLORS.text, fontSize: 16, lineHeight: 24, marginBottom: 20 },
  transitionTips: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16, marginBottom: 24 },
  transitionTip: { color: COLORS.textMuted, fontSize: 14, lineHeight: 24 },
  transitionButton: { backgroundColor: COLORS.transition, padding: 16, borderRadius: 12, alignItems: 'center' },
  transitionButtonText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },

  // Feature 10: Medication Reminder
  medReminderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  medReminderCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 360 },
  medReminderTitle: { color: COLORS.medication, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  medReminderName: { color: COLORS.text, fontSize: 24, fontWeight: '600', marginBottom: 8 },
  medReminderMessage: { color: COLORS.textMuted, fontSize: 14, marginBottom: 24 },
  medReminderActions: { flexDirection: 'row', gap: 12 },
  medReminderButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  medReminderButtonPrimary: { backgroundColor: COLORS.medication },
  medReminderButtonText: { color: COLORS.textMuted, fontSize: 16, fontWeight: '500' },
  medReminderButtonTextPrimary: { color: COLORS.bg, fontSize: 16, fontWeight: '600' },

  // Feature 9: Reflection
  reflectionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  reflectionCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  reflectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  reflectionTitle: { color: COLORS.text, fontSize: 22, fontWeight: '600' },
  reflectionClose: { color: COLORS.textMuted, fontSize: 24, padding: 4 },
  reflectionInsight: { color: COLORS.text, fontSize: 16, lineHeight: 24, marginBottom: 20, backgroundColor: COLORS.reflection + '20', padding: 16, borderRadius: 12, borderLeftWidth: 3, borderLeftColor: COLORS.reflection },
  reflectionStats: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  reflectionStat: { flex: 1, backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16, alignItems: 'center' },
  reflectionStatValue: { color: COLORS.text, fontSize: 24, fontWeight: '700' },
  reflectionStatLabel: { color: COLORS.textMuted, fontSize: 11, marginTop: 4 },
  reflectionWins: { marginBottom: 20 },
  reflectionWinsTitle: { color: COLORS.accent, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  reflectionWin: { color: COLORS.text, fontSize: 14, lineHeight: 22 },
  reflectionButton: { backgroundColor: COLORS.primary, borderRadius: 12, padding: 16, alignItems: 'center' },
  reflectionButtonText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  reflectionButtons: { flexDirection: 'row', gap: 12 },
  reflectionPreviewButton: { flex: 1, backgroundColor: COLORS.surfaceLight, padding: 14, borderRadius: 12, alignItems: 'center' },
  reflectionPreviewButtonText: { color: COLORS.text, fontSize: 14, fontWeight: '500' },

  // Feature 13: Done List
  doneListContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  doneListCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  doneListTitle: { color: COLORS.celebration, fontSize: 22, fontWeight: '600', marginBottom: 16 },
  doneListMessage: { color: COLORS.text, fontSize: 16, lineHeight: 26, marginBottom: 24, whiteSpace: 'pre-line' },
  doneListButton: { backgroundColor: COLORS.celebration, borderRadius: 12, padding: 16, alignItems: 'center' },
  doneListButtonText: { color: COLORS.bg, fontSize: 16, fontWeight: '600' },
  doneListPreview: { backgroundColor: COLORS.surfaceLight, padding: 16, borderRadius: 12, alignItems: 'center' },
  doneListPreviewText: { color: COLORS.text, fontSize: 15, fontWeight: '500' },

  // Feature 8: Waiting Mode
  waitingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  waitingCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400, maxHeight: '80%' },
  waitingHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  waitingTitle: { color: COLORS.text, fontSize: 22, fontWeight: '600' },
  waitingClose: { color: COLORS.textMuted, fontSize: 24, padding: 4 },
  waitingEmpty: { color: COLORS.textMuted, fontSize: 15, textAlign: 'center', paddingVertical: 32 },
  waitingList: { maxHeight: 300 },
  waitingItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 14, marginBottom: 8 },
  waitingItemContent: { flex: 1 },
  waitingItemDesc: { color: COLORS.text, fontSize: 15, fontWeight: '500', marginBottom: 4 },
  waitingItemFor: { color: COLORS.waiting, fontSize: 13 },
  waitingItemAge: { color: COLORS.textDim, fontSize: 12, marginTop: 2 },
  waitingItemActions: { flexDirection: 'row', gap: 8 },
  waitingItemButton: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.accent, justifyContent: 'center', alignItems: 'center' },
  waitingItemButtonDelete: { backgroundColor: COLORS.delete },
  waitingItemButtonText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },
  waitingAddButton: { backgroundColor: COLORS.surfaceLight, padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  waitingAddButtonText: { color: COLORS.waiting, fontSize: 14, fontWeight: '500' },
  waitingPreview: { backgroundColor: COLORS.surfaceLight, padding: 14, borderRadius: 12 },
  waitingPreviewText: { color: COLORS.text, fontSize: 14 },
  waitingPreviewMore: { color: COLORS.waiting, fontSize: 13, marginTop: 4 },

  // Feature 14: Parallel Tasks
  parallelContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  parallelCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  parallelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  parallelTitle: { color: COLORS.text, fontSize: 22, fontWeight: '600' },
  parallelClose: { color: COLORS.textMuted, fontSize: 24, padding: 4 },
  parallelSubtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: 20 },
  parallelTask: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 14, marginBottom: 10 },
  parallelTaskStatus: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  parallelTaskActive: { backgroundColor: COLORS.accent },
  parallelTaskPaused: { backgroundColor: COLORS.textDim },
  parallelTaskText: { flex: 1, color: COLORS.text, fontSize: 15 },
  parallelTaskFocus: { backgroundColor: COLORS.parallel, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  parallelTaskFocusText: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  parallelHint: { color: COLORS.textMuted, fontSize: 13, textAlign: 'center', marginTop: 16 },
  parallelPreview: { backgroundColor: COLORS.surfaceLight, padding: 14, borderRadius: 12 },
  parallelPreviewText: { color: COLORS.text, fontSize: 13, lineHeight: 20 },
  parallelPreviewMore: { color: COLORS.parallel, fontSize: 12, marginTop: 4 },

  // Feature 12: Sensory Environment
  sensoryContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  sensoryCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  sensoryTitle: { color: COLORS.text, fontSize: 22, fontWeight: '600', marginBottom: 8 },
  sensorySubtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: 24 },
  sensorySectionLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, marginTop: 16 },
  sensoryOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  sensoryOption: { backgroundColor: COLORS.surfaceLight, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  sensoryOptionSelected: { backgroundColor: COLORS.accent + '30', borderColor: COLORS.accent },
  sensoryOptionText: { color: COLORS.textMuted, fontSize: 14 },
  sensoryOptionTextSelected: { color: COLORS.accent },
  sensoryActions: { flexDirection: 'row', gap: 12, marginTop: 24 },
  sensorySkip: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  sensorySkipText: { color: COLORS.textMuted, fontSize: 16 },
  sensorySubmit: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.accent, alignItems: 'center' },
  sensorySubmitText: { color: COLORS.bg, fontSize: 16, fontWeight: '600' },
  sensoryPreview: { backgroundColor: COLORS.surfaceLight, padding: 16, borderRadius: 12, alignItems: 'center' },
  sensoryPreviewText: { color: COLORS.text, fontSize: 15, fontWeight: '500' },

  // Feature 11: External Motivation (uses existing toggle styles)
  motivationBanner: { backgroundColor: COLORS.motivation + '20', padding: 14, borderBottomWidth: 1, borderBottomColor: COLORS.motivation + '40' },
  motivationBannerText: { color: COLORS.motivation, fontSize: 14, textAlign: 'center' },

  // ============ FEATURES 16-35 STYLES ============

  // Feature 16: Recovery
  recoveryContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  recoveryCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  recoveryTitle: { color: COLORS.recovery, fontSize: 22, fontWeight: '600', marginBottom: 12 },
  recoveryMessage: { color: COLORS.text, fontSize: 16, lineHeight: 24, marginBottom: 24 },
  recoveryActions: { flexDirection: 'row', gap: 12 },
  recoveryButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  recoveryButtonPrimary: { backgroundColor: COLORS.recovery },
  recoveryButtonText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '500' },
  recoveryButtonTextPrimary: { color: COLORS.bg, fontSize: 15, fontWeight: '600' },

  // Feature 17: Decision
  decisionContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  decisionCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  decisionTitle: { color: COLORS.decision, fontSize: 22, fontWeight: '600', marginBottom: 12 },
  decisionMessage: { color: COLORS.textMuted, fontSize: 15, marginBottom: 20 },
  decisionTaskCard: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 18, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: COLORS.decision },
  decisionTaskText: { color: COLORS.text, fontSize: 18, fontWeight: '500' },
  decisionActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  decisionButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  decisionButtonPrimary: { backgroundColor: COLORS.decision },
  decisionButtonText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '500' },
  decisionButtonTextPrimary: { color: COLORS.bg, fontSize: 15, fontWeight: '600' },
  decisionDismiss: { padding: 12, alignItems: 'center' },
  decisionDismissText: { color: COLORS.textDim, fontSize: 14 },

  // Feature 18: Dopamine Menu
  dopamineContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  dopamineCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400, maxHeight: '80%' },
  dopamineTitle: { color: COLORS.dopamine, fontSize: 22, fontWeight: '600', marginBottom: 4 },
  dopamineSubtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: 20 },
  dopamineList: { maxHeight: 300 },
  dopamineItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16, marginBottom: 10 },
  dopamineItemName: { color: COLORS.text, fontSize: 15, flex: 1 },
  dopamineItemDuration: { color: COLORS.dopamine, fontSize: 13, fontWeight: '600' },
  dopamineDismiss: { padding: 12, alignItems: 'center', marginTop: 8 },
  dopamineDismissText: { color: COLORS.textDim, fontSize: 14 },

  // Feature 19: Time Anchor
  timeAnchorCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '90%', maxWidth: 380 },
  timeAnchorTitle: { color: COLORS.timeBlinds, fontSize: 16, fontWeight: '600', marginBottom: 12 },
  timeAnchorMessage: { color: COLORS.text, fontSize: 18, lineHeight: 26, marginBottom: 24 },
  timeAnchorButton: { backgroundColor: COLORS.surfaceLight, padding: 16, borderRadius: 12, alignItems: 'center' },
  timeAnchorButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '500' },

  // Feature 20: Emotional Check
  emotionalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emotionalCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 420 },
  emotionalTitle: { color: COLORS.emotional, fontSize: 22, fontWeight: '600', marginBottom: 4 },
  emotionalSubtitle: { color: COLORS.textMuted, fontSize: 14, marginBottom: 20 },
  emotionalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  emotionalOption: { backgroundColor: COLORS.surfaceLight, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border },
  emotionalOptionSelected: { backgroundColor: COLORS.emotional + '30', borderColor: COLORS.emotional },
  emotionalOptionText: { color: COLORS.textMuted, fontSize: 14 },
  emotionalOptionTextSelected: { color: COLORS.emotional },
  intensitySlider: { marginBottom: 20 },
  intensityLabel: { color: COLORS.textMuted, fontSize: 13, marginBottom: 10 },
  intensityButtons: { flexDirection: 'row', gap: 8 },
  intensityButton: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  intensityButtonSelected: { backgroundColor: COLORS.emotional },
  intensityButtonText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },
  emotionalActions: { flexDirection: 'row', gap: 12 },
  emotionalSkip: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  emotionalSkipText: { color: COLORS.textMuted, fontSize: 16 },
  emotionalSubmit: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: COLORS.emotional, alignItems: 'center' },
  emotionalSubmitDisabled: { opacity: 0.5 },
  emotionalSubmitText: { color: COLORS.text, fontSize: 16, fontWeight: '600' },

  // Feature 21: Procrastination
  procrastinationContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  procrastinationCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400 },
  procrastinationTitle: { color: COLORS.text, fontSize: 22, fontWeight: '600', marginBottom: 8 },
  procrastinationTask: { color: COLORS.textMuted, fontSize: 14, marginBottom: 20 },
  procrastinationOptions: { maxHeight: 280 },
  procrastinationOption: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 16, marginBottom: 10 },
  procrastinationOptionText: { color: COLORS.text, fontSize: 15 },
  procrastinationDismiss: { padding: 12, alignItems: 'center', marginTop: 8 },
  procrastinationDismissText: { color: COLORS.textDim, fontSize: 14 },

  // Feature 22: Impulse Buffer
  impulseContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  impulseCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  impulseTitle: { color: COLORS.impulse, fontSize: 18, fontWeight: '600', marginBottom: 16 },
  impulseMessage: { color: COLORS.text, fontSize: 18, lineHeight: 26, marginBottom: 8 },
  impulseCost: { color: COLORS.impulse, fontSize: 24, fontWeight: '700', marginBottom: 16 },
  impulseQuestion: { color: COLORS.textMuted, fontSize: 15, marginBottom: 24 },
  impulseActions: { flexDirection: 'row', gap: 12 },
  impulseButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  impulseButtonPrimary: { backgroundColor: COLORS.impulse },
  impulseButtonText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '500' },
  impulseButtonTextPrimary: { color: COLORS.text, fontSize: 15, fontWeight: '600' },

  // Feature 23: Social Battery
  socialContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  socialCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 380 },
  socialTitle: { color: COLORS.social, fontSize: 20, fontWeight: '600', marginBottom: 16 },
  batteryIndicator: { height: 20, backgroundColor: COLORS.surfaceLight, borderRadius: 10, marginBottom: 16, overflow: 'hidden' },
  batteryLevel: { height: '100%', backgroundColor: COLORS.delete, borderRadius: 10 },
  socialMessage: { color: COLORS.text, fontSize: 15, lineHeight: 22, marginBottom: 24 },
  socialButton: { backgroundColor: COLORS.surfaceLight, padding: 16, borderRadius: 12, alignItems: 'center' },
  socialButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '500' },
  batteryRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  batteryIndicatorSmall: { flex: 1, height: 12, backgroundColor: COLORS.surfaceLight, borderRadius: 6, overflow: 'hidden' },
  batteryLevelSmall: { height: '100%', borderRadius: 6 },
  batteryText: { color: COLORS.text, fontSize: 14, fontWeight: '600' },

  // Feature 24: Rumination
  ruminationContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  ruminationCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  ruminationTitle: { color: COLORS.rumination, fontSize: 20, fontWeight: '600', marginBottom: 12 },
  ruminationMessage: { color: COLORS.text, fontSize: 16, lineHeight: 24, marginBottom: 24 },
  ruminationActions: { gap: 10, marginBottom: 16 },
  ruminationButton: { padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  ruminationButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '500' },
  ruminationDismiss: { padding: 12, alignItems: 'center' },
  ruminationDismissText: { color: COLORS.textDim, fontSize: 14 },

  // Feature 25: Relationships
  relationshipRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  relationshipName: { color: COLORS.text, fontSize: 15 },
  relationshipAction: { color: COLORS.relationship, fontSize: 14 },

  // Feature 27: Shame
  shameContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  shameCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  shameTitle: { color: COLORS.shame, fontSize: 20, fontWeight: '600', marginBottom: 12 },
  shameMessage: { color: COLORS.text, fontSize: 16, lineHeight: 24, marginBottom: 24 },
  shameActions: { flexDirection: 'row', gap: 12, marginBottom: 16 },
  shameButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  shameButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '500' },
  shameDismiss: { padding: 12, alignItems: 'center' },
  shameDismissText: { color: COLORS.textDim, fontSize: 14 },

  // Feature 32: Win Journal
  winJournalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  winJournalCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 24, width: '100%', maxWidth: 400, maxHeight: '80%' },
  winJournalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  winJournalTitle: { color: COLORS.wins, fontSize: 22, fontWeight: '600' },
  winJournalClose: { color: COLORS.textMuted, fontSize: 24, padding: 4 },
  winJournalEmpty: { color: COLORS.textMuted, fontSize: 15, textAlign: 'center', paddingVertical: 32 },
  winJournalList: { maxHeight: 300 },
  winEntry: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 14, marginBottom: 10 },
  winEntryText: { color: COLORS.text, fontSize: 15, marginBottom: 4 },
  winEntryDate: { color: COLORS.textDim, fontSize: 12 },
  winJournalAdd: { backgroundColor: COLORS.wins + '20', borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 12 },
  winJournalAddText: { color: COLORS.wins, fontSize: 15, fontWeight: '600' },

  // Feature 34: Task Swap
  swapContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  swapCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  swapTitle: { color: COLORS.swap, fontSize: 20, fontWeight: '600', marginBottom: 8 },
  swapMessage: { color: COLORS.textMuted, fontSize: 15, marginBottom: 20 },
  swapTaskCard: { backgroundColor: COLORS.surfaceLight, borderRadius: 12, padding: 18, marginBottom: 24, borderLeftWidth: 3, borderLeftColor: COLORS.swap },
  swapTaskText: { color: COLORS.text, fontSize: 16, fontWeight: '500' },
  swapActions: { flexDirection: 'row', gap: 12 },
  swapButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  swapButtonPrimary: { backgroundColor: COLORS.swap },
  swapButtonText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '500' },
  swapButtonTextPrimary: { color: COLORS.bg, fontSize: 15, fontWeight: '600' },

  // Feature 35: Commitments
  commitmentContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  commitmentCard: { backgroundColor: COLORS.surface, borderRadius: 24, padding: 28, width: '100%', maxWidth: 400 },
  commitmentTitle: { color: COLORS.commitment, fontSize: 18, fontWeight: '600', marginBottom: 16 },
  commitmentMessage: { color: COLORS.text, fontSize: 18, lineHeight: 26, marginBottom: 8 },
  commitmentDeadline: { color: COLORS.textDim, fontSize: 14, marginBottom: 24 },
  commitmentActions: { flexDirection: 'row', gap: 12 },
  commitmentButton: { flex: 1, padding: 16, borderRadius: 12, backgroundColor: COLORS.surfaceLight, alignItems: 'center' },
  commitmentButtonPrimary: { backgroundColor: COLORS.commitment },
  commitmentButtonText: { color: COLORS.textMuted, fontSize: 15, fontWeight: '500' },
  commitmentButtonTextPrimary: { color: COLORS.text, fontSize: 15, fontWeight: '600' },

  // Settings - New Feature Buttons
  featureButton: { backgroundColor: COLORS.surfaceLight, padding: 16, borderRadius: 12, alignItems: 'center' },
  featureButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '500' },
  featurePreview: { backgroundColor: COLORS.surfaceLight, padding: 14, borderRadius: 12 },
  featurePreviewText: { color: COLORS.text, fontSize: 14 },
  featurePreviewMore: { color: COLORS.textMuted, fontSize: 12, marginTop: 4 },
});
