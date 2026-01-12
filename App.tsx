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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ============ TYPES ============
interface Message {
  id: string;
  role: 'user' | 'nero';
  content: string;
  timestamp: string;
}

interface UserMemory {
  // Layer 1: Who you are (facts)
  facts: {
    name?: string;
    timezone?: string;
    firstSeen: string;
    lastSeen: string;
    totalConversations: number;
  };
  // Layer 2: What's happening (threads)
  threads: {
    recentTopics: string[];
    openLoops: string[]; // things mentioned but not resolved
    commitments: string[]; // things user said they'd do
  };
  // Layer 3: Patterns (learned over time)
  patterns: {
    preferredGreeting?: string;
    communicationStyle?: string;
    knownStruggles: string[];
    whatHelps: string[];
    whatDoesntHelp: string[];
  };
  // Raw important things Nero should remember
  remembered: string[];
}

// ============ CONSTANTS ============
const COLORS = {
  bg: '#0a0a0f',
  surface: '#16161f',
  surfaceLight: '#1e1e2a',
  primary: '#6366f1',
  primaryMuted: '#4f46e5',
  text: '#f4f4f5',
  textMuted: '#a1a1aa',
  textDim: '#52525b',
  border: '#27272a',
};

// Nero's core personality - this shapes every response
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

YOUR MEMORY:
You have access to memories about this person. Use them naturally - don't announce "according to my records." Just know them like a friend would.`;

// ============ HELPERS ============
const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

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

// ============ API SERVICE ============
const callNero = async (
  messages: Message[],
  memory: UserMemory,
  apiKey: string
): Promise<string> => {
  // Build context from memory
  const memoryContext = buildMemoryContext(memory);
  
  // Format conversation history
  const conversationHistory = messages.slice(-20).map(m => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }));

  // If no API key, use thoughtful fallback responses
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
        max_tokens: 500,
        system: `${NERO_SYSTEM_PROMPT}\n\n${memoryContext}`,
        messages: conversationHistory,
      }),
    });

    if (!response.ok) {
      throw new Error('API request failed');
    }

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
    parts.push('\nOPEN THREADS (mentioned but not resolved):');
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

  if (memory.patterns.whatHelps.length > 0) {
    parts.push('\nWHAT HELPS THEM:');
    memory.patterns.whatHelps.forEach(item => {
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

  // First time meeting
  if (isFirstTime) {
    return "Hey. I'm Nero. I'm here to help you get things done - not by giving you another system to maintain, but by actually knowing you and what you're dealing with. What's on your mind?";
  }

  // Greeting patterns
  if (lastMessage.match(/^(hey|hi|hello|morning|afternoon|evening)/i)) {
    const greetings = [
      `Hey${name ? ` ${name}` : ''}. What's going on?`,
      `Hey. How are you doing?`,
      `Good ${timeOfDay}. What's on your mind?`,
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  // "What should we do" pattern
  if (lastMessage.includes('what should') || lastMessage.includes('what do')) {
    if (memory.threads.commitments.length > 0) {
      return `You mentioned wanting to ${memory.threads.commitments[0]}. Want to start with that?`;
    }
    return "What's the one thing that would make today feel like a win if it got done?";
  }

  // Feeling stuck/overwhelmed
  if (lastMessage.match(/(stuck|overwhelmed|can't|too much|hard)/i)) {
    return "Okay. Forget the whole list. What's one tiny thing we could knock out in the next 5 minutes?";
  }

  // Default - keep it open but grounded
  const defaults = [
    "I'm here. What do you need?",
    "What's going on?",
    "Talk to me. What's on your mind?",
    "I'm listening.",
  ];
  return defaults[Math.floor(Math.random() * defaults.length)];
};

// Extract things to remember from conversation
const extractMemories = (message: string): string[] => {
  const memories: string[] = [];
  const lower = message.toLowerCase();

  // Name detection
  const nameMatch = message.match(/(?:I'm|I am|my name is|call me)\s+([A-Z][a-z]+)/i);
  if (nameMatch) {
    memories.push(`NAME: ${nameMatch[1]}`);
  }

  // Commitment detection
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

  // Struggle detection
  if (lower.match(/(struggle|hard for me|difficult|can't seem to|always have trouble)/)) {
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
    threads: {
      recentTopics: [],
      openLoops: [],
      commitments: [],
    },
    patterns: {
      knownStruggles: [],
      whatHelps: [],
      whatDoesntHelp: [],
    },
    remembered: [],
  });
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [apiKey, setApiKey] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const scrollRef = useRef<ScrollView>(null);

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Save data when it changes
  useEffect(() => {
    if (!isLoading) {
      saveData();
    }
  }, [messages, memory, apiKey]);

  // Auto-scroll to bottom
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const loadData = async () => {
    try {
      const [savedMessages, savedMemory, savedApiKey] = await Promise.all([
        AsyncStorage.getItem('@nero/messages'),
        AsyncStorage.getItem('@nero/memory'),
        AsyncStorage.getItem('@nero/apiKey'),
      ]);

      if (savedMessages) {
        setMessages(JSON.parse(savedMessages));
      }

      if (savedMemory) {
        const parsedMemory = JSON.parse(savedMemory);
        // Update last seen and increment conversation count
        parsedMemory.facts.lastSeen = new Date().toISOString();
        parsedMemory.facts.totalConversations = (parsedMemory.facts.totalConversations || 0) + 1;
        setMemory(parsedMemory);
      } else {
        // First time - show welcome message
        const welcomeMessage: Message = {
          id: generateId(),
          role: 'nero',
          content: "Hey. I'm Nero. I'm here to help you get things done - not by giving you another system to maintain, but by actually knowing you and what you're dealing with. What's on your mind?",
          timestamp: new Date().toISOString(),
        };
        setMessages([welcomeMessage]);
      }

      if (savedApiKey) {
        setApiKey(JSON.parse(savedApiKey));
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = async () => {
    try {
      await Promise.all([
        AsyncStorage.setItem('@nero/messages', JSON.stringify(messages.slice(-100))),
        AsyncStorage.setItem('@nero/memory', JSON.stringify(memory)),
        AsyncStorage.setItem('@nero/apiKey', JSON.stringify(apiKey)),
      ]);
    } catch (error) {
      console.error('Error saving data:', error);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isThinking) return;

    // Create user message
    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsThinking(true);

    // Extract any memories from the message
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

    // Update last seen
    updatedMemory.facts.lastSeen = new Date().toISOString();
    setMemory(updatedMemory);

    // Get Nero's response
    const allMessages = [...messages, userMessage];
    const response = await callNero(allMessages, updatedMemory, apiKey);

    const neroMessage: Message = {
      id: generateId(),
      role: 'nero',
      content: response,
      timestamp: new Date().toISOString(),
    };

    setMessages(prev => [...prev, neroMessage]);
    setIsThinking(false);
  };

  const clearHistory = async () => {
    const confirmMessage: Message = {
      id: generateId(),
      role: 'nero',
      content: "Starting fresh. I still remember who you are, but our conversation history is cleared. What's on your mind?",
      timestamp: new Date().toISOString(),
    };
    setMessages([confirmMessage]);
    setShowSettings(false);
  };

  const clearEverything = async () => {
    await AsyncStorage.multiRemove(['@nero/messages', '@nero/memory', '@nero/apiKey']);
    setMessages([]);
    setMemory({
      facts: {
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        totalConversations: 0,
      },
      threads: { recentTopics: [], openLoops: [], commitments: [] },
      patterns: { knownStruggles: [], whatHelps: [], whatDoesntHelp: [] },
      remembered: [],
    });
    setApiKey('');
    setShowSettings(false);
    
    // Show fresh welcome
    const welcomeMessage: Message = {
      id: generateId(),
      role: 'nero',
      content: "Hey. I'm Nero. I'm here to help you get things done - not by giving you another system to maintain, but by actually knowing you and what you're dealing with. What's on your mind?",
      timestamp: new Date().toISOString(),
    };
    setMessages([welcomeMessage]);
  };

  // ============ RENDER ============

  if (isLoading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
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
              <TouchableOpacity 
                style={[styles.settingsButton, styles.dangerButton]} 
                onPress={clearEverything}
              >
                <Text style={styles.dangerButtonText}>Reset Everything</Text>
              </TouchableOpacity>
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
          <Text style={styles.headerTitle}>Nero</Text>
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
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Talk to Nero..."
            placeholderTextColor={COLORS.textDim}
            multiline
            maxLength={2000}
            onSubmitEditing={sendMessage}
            blurOnSubmit={false}
          />
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isThinking) && styles.sendButtonDisabled]}
            onPress={sendMessage}
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
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
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
    gap: 12,
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
    marginBottom: 8,
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
  dangerButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  dangerButtonText: {
    color: '#ef4444',
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
});
