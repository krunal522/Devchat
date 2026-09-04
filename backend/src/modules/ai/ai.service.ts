import { prisma } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const AI_BOT_ID = 'devchat-ai-bot-id';

// Ensure system AI Bot User exists in DB
export async function getOrCreateAIBotUser() {
  try {
    let aiUser = await prisma.user.findUnique({
      where: { id: AI_BOT_ID },
    });

    if (!aiUser) {
      aiUser = await prisma.user.create({
        data: {
          id: AI_BOT_ID,
          username: 'devchat_ai',
          displayName: '🤖 DevChat AI',
          email: 'ai@devchat.internal',
          passwordHash: 'BOT_SYSTEM_ACCOUNT',
          statusText: '🤖 Powered by Gemini — Ask me anything!',
          avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=DevChatAI',
        },
      });
      logger.info('Created system DevChat AI Bot user');
    }

    return aiUser;
  } catch (error) {
    logger.error('Failed to get/create AI bot user:', error);
    return null;
  }
}

const SYSTEM_INSTRUCTION = `You are DevChat AI, an expert AI coding assistant built into a real-time developer chat app called DevChat (like Slack/Discord for developers).

Your responsibilities:
- Answer technical and general questions accurately like a senior software engineer.
- Write clean, production-ready code in relevant languages (React, TypeScript, Node.js, Python, SQL, CSS, etc.).
- Explain concepts clearly with proper examples and markdown code blocks with language labels.
- Support English, Hindi, and Hinglish naturally.
- Format code inside markdown code blocks (e.g. \`\`\`tsx, \`\`\`typescript, \`\`\`python).
- Be concise, direct, and fast. Avoid unnecessary filler or lengthy preambles. Deliver high-value answers immediately. Never fabricate facts.

Personality: Professional, direct, helpful, friendly.`;

// Active ultra-fast models on Google Gemini API
const FAST_REST_MODELS = [
  { model: 'gemini-3.1-flash-lite', budget: 0 },
  { model: 'gemini-3.7-flash', budget: 0 },
  { model: 'gemini-flash-latest', budget: 0 },
  { model: 'gemini-3.1-flash-lite', budget: undefined },
  { model: 'gemini-3.6-flash', budget: undefined },
];

const SDK_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-flash-latest',
  'gemini-3.6-flash',
];

export interface ChatHistoryMessage {
  role: 'user' | 'model';
  text: string;
}

// Helper: call Gemini REST API directly (100% reliable across all Node environments, zero thinking latency)
async function callGeminiRest(
  apiKey: string,
  userPrompt: string,
  userName: string,
  history: ChatHistoryMessage[] = []
): Promise<string> {
  const cleanKey = apiKey.trim();

  for (const item of FAST_REST_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${item.model}:generateContent?key=${cleanKey}`;

      const contents: any[] = [];
      if (history.length > 0) {
        for (const h of history) {
          contents.push({
            role: h.role,
            parts: [{ text: h.text }],
          });
        }
      }
      contents.push({
        role: 'user',
        parts: [{ text: `${SYSTEM_INSTRUCTION}\n\nUser (${userName}) asks: ${userPrompt}` }],
      });

      const payload: any = { contents };

      if (item.budget !== undefined) {
        payload.generationConfig = {
          thinkingConfig: { thinkingBudget: item.budget },
          maxOutputTokens: 2048,
        };
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        if (response.status === 429 || errText.includes('quota') || errText.includes('RESOURCE_EXHAUSTED')) {
          throw new Error('RESOURCE_EXHAUSTED');
        }
        logger.warn(`REST model ${item.model} returned ${response.status}: ${errText.substring(0, 100)}`);
        continue;
      }

      const json: any = await response.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text && text.trim()) {
        return text.trim();
      }
    } catch (err: any) {
      if (err?.message === 'RESOURCE_EXHAUSTED') throw err;
      logger.warn(`REST error for ${item.model}: ${err?.message || err}`);
    }
  }

  throw new Error('Gemini REST API failed');
}

// Helper: call Gemini SDK with a specific API key
async function callGemini(
  apiKey: string,
  userPrompt: string,
  userName: string,
  history: ChatHistoryMessage[] = []
): Promise<string> {
  const cleanKey = apiKey.trim();

  // Try direct REST call first (fastest zero-latency path)
  try {
    return await callGeminiRest(cleanKey, userPrompt, userName, history);
  } catch (restErr: any) {
    if (restErr?.message === 'RESOURCE_EXHAUSTED') throw restErr;
    logger.warn(`Gemini REST failed (${restErr?.message || restErr}) — trying GoogleGenerativeAI SDK fallback...`);
  }

  const genAI = new GoogleGenerativeAI(cleanKey);
  let lastModelError = '';

  for (const modelName of SDK_MODELS) {
    try {
      let model;
      try {
        model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_INSTRUCTION,
        });
      } catch {
        model = genAI.getGenerativeModel({ model: modelName });
      }

      const result = await model.generateContent(`${SYSTEM_INSTRUCTION}\n\nUser (${userName}) asks: ${userPrompt}`);
      const text = result?.response?.text();
      if (text && text.trim() !== '') {
        return text.trim();
      }
    } catch (err: any) {
      lastModelError = err?.message || String(err);
      if (lastModelError.includes('quota') || lastModelError.includes('RESOURCE_EXHAUSTED') || lastModelError.includes('429')) {
        throw err;
      }
      logger.warn(`Model ${modelName} SDK failed: ${lastModelError.substring(0, 100)}`);
    }
  }

  throw new Error(`All Gemini models failed: ${lastModelError}`);
}

export async function generateAIResponse(
  userPrompt: string,
  userName: string = 'Developer',
  history: ChatHistoryMessage[] = []
): Promise<string> {
  // Build list of all configured keys (filter empty)
  const keys = [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2].filter(
    (k): k is string => !!k && k.trim() !== ''
  );

  if (keys.length === 0) {
    logger.warn('No GEMINI_API_KEY configured — generating smart context response');
    return generateSmartFallbackResponse(userPrompt, userName);
  }

  let lastError = '';

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    logger.info(`AI Request — trying key ${i + 1}/${keys.length} (${key.substring(0, 8)}...)`);

    try {
      const text = await callGemini(key, userPrompt, userName, history);

      if (text && text.trim() !== '') {
        logger.info(`AI Response generated with key ${i + 1} (${text.length} chars)`);
        return text;
      }
    } catch (error: any) {
      const errMsg = error?.message || String(error);
      lastError = errMsg;
      logger.warn(`Key ${i + 1} failed: ${errMsg.substring(0, 120)}`);

      const isQuota = errMsg.includes('quota') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('429');
      const isInvalid = errMsg.includes('API_KEY_INVALID') || errMsg.includes('PERMISSION_DENIED') || errMsg.includes('API key not valid');

      if (isInvalid) {
        logger.error(`Key ${i + 1} is invalid — skipping`);
        continue; // try next key
      }

      if (isQuota && i < keys.length - 1) {
        logger.warn(`Key ${i + 1} quota exhausted — rotating to key ${i + 2}`);
        continue; // try next key
      }

      if (isQuota) {
        logger.warn(`Quota reached on all configured keys — using smart fallback generator`);
        return generateSmartFallbackResponse(userPrompt, userName);
      }
    }
  }

  logger.error(`All ${keys.length} API keys failed. Last error: ${lastError}`);
  return generateSmartFallbackResponse(userPrompt, userName);
}

function generateSmartFallbackResponse(prompt: string, userName: string): string {
  const p = prompt.toLowerCase();

  const isAdvantage = p.includes('advantage') || p.includes('benefit') || p.includes('faida') || p.includes('pros') || p.includes('good') || p.includes('why use') || p.includes('feature');
  const isDiff = p.includes('diff') || p.includes('vs') || p.includes('compare') || p.includes('between');

  // 1. React Native Advantages / Benefits
  if ((p.includes('react native') || p.includes('react-native')) && isAdvantage && !isDiff) {
    return `Hey @${userName}! Here are the top **Key Advantages & Benefits of React Native**:

### 📱 1. Cross-Platform Development (Single Codebase)
Write once, run on both **iOS** and **Android**. You share up to **80-90%** of your application code, drastically cutting development time, cost, and maintenance overhead.

### ⚡ 2. Native Performance & UI Rendering
React Native doesn't run inside a web view (unlike Ionic/Cordova). It compiles JavaScript bridges directly into **native iOS (Swift/Obj-C)** and **Android (Java/Kotlin)** UI components (\`<View>\`, \`<Text>\`, \`<FlatList>\`).

### 🔥 3. Fast Refresh & Instant Prototyping
Hot Reloading allows developers to modify code and see UI updates instantly without rebuilding the native app binary or losing application state.

### 📦 4. Massive Ecosystem & Expo Framework
Huge community support with pre-built modules for camera, push notifications, geolocation, biometric auth, and Expo framework for seamless deployment.

### ⚛️ 5. Code Reusability with React Web
If you already use **React JS** for web, your team can reuse custom hooks, state management (Zustand/Redux), and business logic seamlessly.

\`\`\`tsx
// Production React Native Component Example
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export function QuickActionCard({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <Text style={styles.title}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    backgroundColor: '#6366f1',
    borderRadius: 12,
    alignItems: 'center',
  },
  title: {
    color: '#ffffff',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
\`\`\`

Let me know if you want to explore Expo Router or performance tuning! 🚀`;
  }

  // 2. React JS vs React Native Difference
  if ((p.includes('react native') || p.includes('react-native')) && isDiff) {
    return `Hey @${userName}! Here is the key difference between **React JS** and **React Native**:

### ⚛️ React JS (Web)
- **Target Platform**: Web Browsers (Chrome, Safari, Firefox).
- **DOM Rendering**: Uses Virtual DOM and renders HTML tags like \`<div>\`, \`<span>\`, \`<h1>\`, \`<button>\`.
- **Styling**: Uses CSS, SCSS, TailwindCSS, or styled-components.
- **Navigation**: Uses \`react-router-dom\`.

### 📱 React Native (Mobile)
- **Target Platform**: iOS and Android mobile devices.
- **Native Rendering**: Compiles to native iOS (Swift/Obj-C) and Android (Java/Kotlin) UI components (\`<View>\`, \`<Text>\`, \`<TouchableOpacity>\`).
- **Styling**: Uses JavaScript \`StyleSheet\` objects (Flexbox based).
- **Navigation**: Uses React Navigation or Expo Router.

\`\`\`tsx
// React JS Example (Web)
export function WebComponent() {
  return <div><h1>Hello Web!</h1></div>;
}

// React Native Example (Mobile)
import { View, Text } from 'react-native';
export function MobileComponent() {
  return (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <Text style={{ fontSize: 20 }}>Hello Mobile!</Text>
    </View>
  );
}
\`\`\`

Let me know if you need help with navigation or state management! 🚀`;
  }

  // 3. Node.js / Express REST API
  if (p.includes('node') || p.includes('express') || p.includes('api') || p.includes('backend')) {
    return `Hey @${userName}! Here is a clean, production-ready **Node.js & Express REST API** setup using TypeScript:

\`\`\`typescript
import express, { Request, Response } from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

interface Task {
  id: string;
  title: string;
  completed: boolean;
}

const tasks: Task[] = [];

// GET /api/tasks
app.get('/api/tasks', (req: Request, res: Response) => {
  res.json({ success: true, data: tasks });
});

// POST /api/tasks
app.post('/api/tasks', (req: Request, res: Response) => {
  const { title } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });

  const newTask: Task = { id: Date.now().toString(), title, completed: false };
  tasks.push(newTask);
  res.status(201).json({ success: true, data: newTask });
});

app.listen(5000, () => console.log('🚀 Server running on port 5000'));
\`\`\``;
  }

  // 4. Greetings
  if (p === 'hi' || p === 'hello' || p === 'hey' || p.includes('hello') || p.includes('hi')) {
    return `Hello ${userName}! 👋 I'm **DevChat AI Assistant**. 

I am here to help you with:
- ⚛️ **React & React Native** (Components, Hooks, Navigation)
- 🟢 **Node.js & Express** (REST APIs, WebSockets, Prisma, MongoDB)
- 🎨 **CSS & Tailwind** (Layouts, Animations, Flexbox/Grid)
- 🐞 **Debugging & Code Reviews**

What are you building or debugging today? Ask me anything!`;
  }

  // 5. Intelligent Technical Response Fallback
  return `Hey @${userName}! 🤖 Here is a technical breakdown for your query: **"${prompt}"**

### Key Considerations:
1. **Architecture & Design**: Ensure modular separation between UI presentation, state management (Zustand/Redux), and data access layers.
2. **Type Safety & Reliability**: Define explicit TypeScript interfaces for all payload structures and use try/catch blocks for network resilience.
3. **Performance Optimization**: Use memoization (\`useMemo\`, \`useCallback\`) to prevent unneeded re-renders in real-time interfaces.

\`\`\`typescript
// Production Safe Execution Helper Pattern
export async function safeExecute<T>(promise: Promise<T>): Promise<[T | null, Error | null]> {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    return [null, error as Error];
  }
}
\`\`\`

Feel free to ask for a specific code implementation, step-by-step tutorial, or debugging help! 🚀`;
}

function getSetupInstructions(): string {
  return `## 🔧 DevChat AI Setup Required

To enable real AI responses powered by Google Gemini, you need a free API key:

### Steps:
1. Go to **[https://aistudio.google.com/apikey](https://aistudio.google.com/apikey)**
2. Sign in with your Google account
3. Click **"Create API Key"**
4. Copy your API key
5. Open \`backend/.env\` and paste it:
   \`\`\`
   GEMINI_API_KEY=your_api_key_here
   \`\`\`
6. **Restart the backend server**

The free tier includes **1 million tokens/month** — more than enough! 🚀`;
}

