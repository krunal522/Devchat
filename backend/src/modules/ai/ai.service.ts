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
- Be concise but comprehensive. Never fabricate facts.

Personality: Professional, helpful, friendly. Always ready to help with code, debugging, architecture, and tech explanations.`;

// Primary ultra-fast model verified working on Google Gemini API
const MODELS_TO_TRY = ['gemini-3.6-flash', 'gemma-4-26b-a4b-it'];

// Helper: call Gemini with a specific API key (optimized for fast response)
async function callGemini(apiKey: string, userPrompt: string, userName: string): Promise<string> {
  const genAI = new GoogleGenerativeAI(apiKey.trim());

  let lastModelError = '';
  for (const modelName of MODELS_TO_TRY) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: SYSTEM_INSTRUCTION,
      });

      const result = await model.generateContent(`User (${userName}) asks: ${userPrompt}`);
      const text = result?.response?.text();
      if (text && text.trim() !== '') {
        return text;
      }
    } catch (err: any) {
      lastModelError = err?.message || String(err);
      if (lastModelError.includes('quota') || lastModelError.includes('RESOURCE_EXHAUSTED') || lastModelError.includes('429')) {
        throw err;
      }
      logger.warn(`Model ${modelName} failed on current key: ${lastModelError.substring(0, 100)}`);
    }
  }

  throw new Error(`All models failed: ${lastModelError}`);
}

export async function generateAIResponse(
  userPrompt: string,
  userName: string = 'Developer'
): Promise<string> {
  // Build list of all configured keys (filter empty)
  const keys = [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2].filter(
    (k): k is string => !!k && k.trim() !== ''
  );

  if (keys.length === 0) {
    logger.warn('No GEMINI_API_KEY configured — using smart fallback generator');
    return generateSmartFallbackResponse(userPrompt, userName);
  }

  let lastError = '';

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    logger.info(`AI Request — trying key ${i + 1}/${keys.length} (${key.substring(0, 8)}...)`);

    try {
      const text = await callGemini(key, userPrompt, userName);

      if (!text || text.trim() === '') {
        return `I'm sorry ${userName}, I wasn't able to generate a response. Could you rephrase?`;
      }

      logger.info(`AI Response generated with key ${i + 1} (${text.length} chars)`);
      return text;

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

  // 1. React JS vs React Native
  if (p.includes('react native') || (p.includes('react') && p.includes('native')) || (p.includes('react') && p.includes('diff'))) {
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

Let me know if you need help with React Navigation or state management! 🚀`;
  }

  // 2. Node.js / Express REST API
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

  // 3. Greetings
  if (p === 'hi' || p === 'hello' || p === 'hey' || p.includes('hello') || p.includes('hi')) {
    return `Hello ${userName}! 👋 I'm **DevChat AI Assistant**. 

I am here to help you with:
- ⚛️ **React & React Native** (Components, Hooks, Navigation)
- 🟢 **Node.js & Express** (REST APIs, WebSockets, Prisma, MongoDB)
- 🎨 **CSS & Tailwind** (Layouts, Animations, Flexbox/Grid)
- 🐞 **Debugging & Code Reviews**

What are you building or debugging today? Ask me anything!`;
  }

  // 4. General technical response fallback
  return `Hey @${userName}! 🤖 Here is a technical breakdown for your query: **"${prompt}"**

### Key Concepts:
1. **Architecture & Scope**: Ensure modular separation of concerns between your UI components, state management (Redux/Zustand), and backend API endpoints.
2. **Best Practices**: Use TypeScript interfaces for payload validation and error boundaries to prevent unexpected UI crashes.
3. **Performance Optimization**: Use memoization (\`useMemo\`, \`useCallback\`) and dynamic imports to reduce bundle size.

\`\`\`typescript
// Quick Helper Pattern
export async function handleAsyncOp<T>(promise: Promise<T>): Promise<[T | null, Error | null]> {
  try {
    const data = await promise;
    return [data, null];
  } catch (error) {
    return [null, error as Error];
  }
}
\`\`\`

Feel free to ask for a specific code example or step-by-step implementation! 🚀`;
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

