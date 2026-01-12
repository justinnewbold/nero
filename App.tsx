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
  isVoice?: boolean;
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
  listening: '#ef4444',
  speaking: '#22c55e',
};

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

IMPORTANT FOR VOICE:
- Keep responses conversational and natural for speaking aloud.
- Shorter is better for voice. 1-3 sentences ideal.
- No special characters, markdown, or formatting.
- Write numbers as words when spoken (five instead of 5).

WHAT YOU UNDERSTAND ABOUT ADHD:
- The gap between knowing and doing is the real problem.
- Decision fatigue is real. Sometimes people need you to just decide.
- "Just do it" doesn't work. Breaking things tiny does.
- Shame and guilt make everything worse. Never add to them.
- Some days are just hard. That's okay. You meet them where they are.

WHAT YOU NEVER DO:
- Never ask multiple questions at once
- Never give long lectures or explanations
- Never guilt or shame, even subtly
- Never be relentlessly positive - be real
- Never offer generic advice - be specific to THIS person`;

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

// ============ VOICE SERVICE ============
class VoiceService {
  private recognition: any = null;
  private synthesis: SpeechSynthesis | null = null;
  private selectedVoice: SpeechSynthesisVoice | null = null;
  public isSupported: boolean = false;
  public isSpeechSupported: boolean = false;

  constructor() {
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      // Speech Recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = false;
        this.recognition.lang = 'en-US';
        this.isSupported = true;
      }

      // Speech Synthesis
      if ('speechSynthesis' in window) {
        this.synthesis = window.speechSynthesis;
        this.isSpeechSupported = true;
        this.loadVoices();
        
        // Voices load async in some browsers
        if (this.synthesis.onvoiceschanged !== undefined) {
          this.synthesis.onvoiceschanged = () => this.loadVoices();
        }
      }
    }
  }

  private loadVoices() {
    if (!this.synthesis) return;
    
    const voices = this.synthesis.getVoices();
    // Prefer a natural-sounding English voice
    this.selectedVoice = voices.find(v => 
      v.name.includes('Samantha') || 
      v.name.includes('Google US English') ||
      v.name.includes('Microsoft Zira') ||
      (v.lang.startsWith('en') && v.localService)
    ) || voices.find(v => v.lang.startsWith('en')) || voices[0];
  }

  startListening(
    onResult: (text: string) => void,
    onError: (error: string) => void,
    onEnd: () => void
  ) {
    if (!this.recognition) {
      onError('Speech recognition not supported');
      return;
    }

    this.recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      onResult(text);
    };

    this.recognition.onerror = (event: any) => {
      onError(event.error);
    };

    this.recognition.onend = onEnd;

    try {
      this.recognition.start();
    } catch (e) {
      onError('Could not start listening');
    }
  }

  stopListening() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {}
    }
  }

  speak(text: string, onEnd?: () => void): Promise<void> {
    return new Promise((resolve) => {
      if (!this.synthesis || !this.isSpeechSupported) {
        resolve();
        return;
      }

      // Cancel any ongoing speech
      this.synthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = this.selectedVoice;
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      utterance.onend = () => {
        onEnd?.();
        resolve();
      };

      utterance.onerror = () => {
        onEnd?.();
        resolve();
      };

      this.synthesis.speak(utterance);
    });
  }

  stopSpeaking() {
    if (this.synthesis) {
      this.synthesis.cancel();
    }
  }

  isSpeaking(): boolean {
    return this.synthesis?.speaking || false;
  }
}

// Create singleton
const voiceService = new VoiceService();

// ============ API SERVICE ============
const callNero = async (
  messages: Message[],
  memory: UserMemory,
  apiKey: string
): Promise<string> => {
  const memoryContext = buildMemoryContext(memory);
  
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
        max_tokens: 300,
        system: `${NERO_SYSTEM_PROMPT}\n\n${memoryContext}`,
        messages: conversationHistory,
      }),
    });

    if (!response.ok) throw new Error('API request failed');

    const data = await response.json();
    return data.content[0]?.text || "I'm here. What's going on?";
  } catch (error) {
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
    parts.push(`- This is your second conversation`);
  } else {
    parts.push(`- This is your first conversation`);
  }

  if (memory.remembered.length > 0) {
    parts.push('\nTHINGS TO REMEMBER:');
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
    return "Hey. I'm Nero. I'm here to help you get things done, not by giving you another system, but by actually knowing you. What's on your mind?";
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
    return "Okay. Forget the whole list. What's one tiny thing we could knock out in five minutes?";
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

  // Voice state
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [autoSpeak, setAutoSpeak] = useState(true);

  const scrollRef = useRef<ScrollView>(null);

  // Load data
  useEffect(() => {
    loadData();
  }, []);

  // Save data
  useEffect(() => {
    if (!isLoading) saveData();
  }, [messages, memory, apiKey, voiceEnabled, autoSpeak]);

  // Auto-scroll
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages]);

  const loadData = async () => {
    try {
      const [savedMessages, savedMemory, savedApiKey, savedVoice, savedAutoSpeak] = await Promise.all([
        AsyncStorage.getItem('@nero/messages'),
        AsyncStorage.getItem('@nero/memory'),
        AsyncStorage.getItem('@nero/apiKey'),
        AsyncStorage.getItem('@nero/voiceEnabled'),
        AsyncStorage.getItem('@nero/autoSpeak'),
      ]);

      if (savedMessages) setMessages(JSON.parse(savedMessages));
      if (savedApiKey) setApiKey(JSON.parse(savedApiKey));
      if (savedVoice !== null) setVoiceEnabled(JSON.parse(savedVoice));
      if (savedAutoSpeak !== null) setAutoSpeak(JSON.parse(savedAutoSpeak));

      if (savedMemory) {
        const parsedMemory = JSON.parse(savedMemory);
        parsedMemory.facts.lastSeen = new Date().toISOString();
        parsedMemory.facts.totalConversations = (parsedMemory.facts.totalConversations || 0) + 1;
        setMemory(parsedMemory);
      } else {
        const welcomeMessage: Message = {
          id: generateId(),
          role: 'nero',
          content: "Hey. I'm Nero. I'm here to help you get things done, not by giving you another system, but by actually knowing you. What's on your mind?",
          timestamp: new Date().toISOString(),
        };
        setMessages([welcomeMessage]);
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
        AsyncStorage.setItem('@nero/apiKey', JSON.stringify(apiKey)),
        AsyncStorage.setItem('@nero/voiceEnabled', JSON.stringify(voiceEnabled)),
        AsyncStorage.setItem('@nero/autoSpeak', JSON.stringify(autoSpeak)),
      ]);
    } catch (error) {
      console.error('Save error:', error);
    }
  };

  const sendMessage = async (text: string, isVoice: boolean = false) => {
    const trimmed = text.trim();
    if (!trimmed || isThinking) return;

    const userMessage: Message = {
      id: generateId(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      isVoice,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsThinking(true);

    // Extract memories
    const newMemories = extractMemories(trimmed);
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
      }
    }

    updatedMemory.facts.lastSeen = new Date().toISOString();
    setMemory(updatedMemory);

    // Get response
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

    // Speak response if voice mode
    if (autoSpeak && (isVoice || isSpeaking)) {
      setIsSpeaking(true);
      await voiceService.speak(response, () => setIsSpeaking(false));
    }
  };

  const startListening = () => {
    if (!voiceService.isSupported) {
      alert('Voice input not supported in this browser. Try Chrome.');
      return;
    }

    // Stop any ongoing speech
    voiceService.stopSpeaking();
    setIsSpeaking(false);

    setIsListening(true);
    voiceService.startListening(
      (text) => {
        setIsListening(false);
        sendMessage(text, true);
      },
      (error) => {
        console.error('Voice error:', error);
        setIsListening(false);
      },
      () => setIsListening(false)
    );
  };

  const stopListening = () => {
    voiceService.stopListening();
    setIsListening(false);
  };

  const toggleSpeaking = () => {
    if (isSpeaking) {
      voiceService.stopSpeaking();
      setIsSpeaking(false);
    }
  };

  const clearHistory = () => {
    const confirmMessage: Message = {
      id: generateId(),
      role: 'nero',
      content: "Fresh start. I still remember who you are, but our conversation history is cleared. What's on your mind?",
      timestamp: new Date().toISOString(),
    };
    setMessages([confirmMessage]);
    setShowSettings(false);
  };

  const clearEverything = async () => {
    await AsyncStorage.multiRemove(['@nero/messages', '@nero/memory', '@nero/apiKey', '@nero/voiceEnabled', '@nero/autoSpeak']);
    setMessages([]);
    setMemory({
      facts: { firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), totalConversations: 0 },
      threads: { recentTopics: [], openLoops: [], commitments: [] },
      patterns: { knownStruggles: [], whatHelps: [], whatDoesntHelp: [] },
      remembered: [],
    });
    setApiKey('');
    setShowSettings(false);
    
    const welcomeMessage: Message = {
      id: generateId(),
      role: 'nero',
      content: "Hey. I'm Nero. I'm here to help you get things done, not by giving you another system, but by actually knowing you. What's on your mind?",
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
            {/* Voice Settings */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Voice</Text>
              
              <TouchableOpacity 
                style={styles.settingRow}
                onPress={() => setAutoSpeak(!autoSpeak)}
              >
                <View>
                  <Text style={styles.settingRowText}>Nero speaks responses</Text>
                  <Text style={styles.settingRowHint}>When you use voice, Nero talks back</Text>
                </View>
                <View style={[styles.toggle, autoSpeak && styles.toggleOn]}>
                  <View style={[styles.toggleKnob, autoSpeak && styles.toggleKnobOn]} />
                </View>
              </TouchableOpacity>

              {!voiceService.isSupported && (
                <Text style={styles.warningText}>
                  Voice input not available. Try Chrome browser.
                </Text>
              )}
            </View>

            {/* API Key */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Claude API Key</Text>
              <Text style={styles.settingsHint}>For smarter responses. Leave empty for basic mode.</Text>
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

            {/* Memory */}
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
            </View>

            {/* Actions */}
            <View style={styles.settingsSection}>
              <Text style={styles.settingsLabel}>Data</Text>
              <TouchableOpacity style={styles.settingsButton} onPress={clearHistory}>
                <Text style={styles.settingsButtonText}>Clear Conversation History</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.settingsButton, styles.dangerButton]} onPress={clearEverything}>
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
      <KeyboardAvoidingView style={styles.keyboardView} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Nero</Text>
          <View style={styles.headerRight}>
            {isSpeaking && (
              <TouchableOpacity onPress={toggleSpeaking} style={styles.speakingIndicator}>
                <Text style={styles.speakingText}>●</Text>
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
              style={[
                styles.messageBubble,
                message.role === 'user' ? styles.userBubble : styles.neroBubble,
              ]}
            >
              <Text style={[styles.messageText, message.role === 'user' ? styles.userText : styles.neroText]}>
                {message.content}
              </Text>
              {message.isVoice && (
                <Text style={styles.voiceIndicator}>🎤</Text>
              )}
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
          <TouchableOpacity
            style={[
              styles.voiceButton,
              isListening && styles.voiceButtonActive,
            ]}
            onPress={isListening ? stopListening : startListening}
            disabled={isThinking}
          >
            <Text style={styles.voiceButtonText}>
              {isListening ? '⏹' : '🎤'}
            </Text>
          </TouchableOpacity>

          {/* Text Input */}
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder={isListening ? 'Listening...' : 'Talk to Nero...'}
            placeholderTextColor={isListening ? COLORS.listening : COLORS.textDim}
            multiline
            maxLength={2000}
            editable={!isListening}
          />

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || isThinking) && styles.sendButtonDisabled]}
            onPress={() => sendMessage(input)}
            disabled={!input.trim() || isThinking}
          >
            <Text style={styles.sendButtonText}>↑</Text>
          </TouchableOpacity>
        </View>

        {/* Listening Overlay */}
        {isListening && (
          <View style={styles.listeningOverlay}>
            <View style={styles.listeningPulse}>
              <Text style={styles.listeningEmoji}>🎤</Text>
            </View>
            <Text style={styles.listeningText}>Listening...</Text>
            <TouchableOpacity style={styles.cancelButton} onPress={stopListening}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  speakingIndicator: {
    padding: 4,
  },
  speakingText: {
    color: COLORS.speaking,
    fontSize: 16,
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
    position: 'relative',
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
  voiceIndicator: {
    position: 'absolute',
    top: -8,
    right: -8,
    fontSize: 12,
  },

  // Input
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    gap: 8,
  },
  voiceButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButtonActive: {
    backgroundColor: COLORS.listening,
  },
  voiceButtonText: {
    fontSize: 20,
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

  // Listening Overlay
  listeningOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.bg,
    paddingVertical: 40,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  listeningPulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.listening,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  listeningEmoji: {
    fontSize: 32,
  },
  listeningText: {
    color: COLORS.text,
    fontSize: 18,
    marginBottom: 20,
  },
  cancelButton: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderRadius: 20,
  },
  cancelButtonText: {
    color: COLORS.textMuted,
    fontSize: 16,
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
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  settingRowText: {
    color: COLORS.text,
    fontSize: 16,
  },
  settingRowHint: {
    color: COLORS.textDim,
    fontSize: 13,
    marginTop: 2,
  },
  toggle: {
    width: 50,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.surfaceLight,
    padding: 2,
  },
  toggleOn: {
    backgroundColor: COLORS.primary,
  },
  toggleKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.textMuted,
  },
  toggleKnobOn: {
    backgroundColor: COLORS.text,
    transform: [{ translateX: 22 }],
  },
  warningText: {
    color: COLORS.listening,
    fontSize: 13,
    marginTop: 8,
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
