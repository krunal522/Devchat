import { prisma } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { GoogleGenAI } from '@google/genai';

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

// Valid Gemini models (fast & free tier)
const MODELS_TO_TRY = ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b'];

// Helper: call Gemini with a specific API key (optimized for ~1 second ultra-fast response)
async function callGemini(apiKey: string, userPrompt: string, userName: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: apiKey.trim() });

  let lastModelError = '';
  for (const modelName of MODELS_TO_TRY) {
    try {
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Response timeout after 4s')), 4200)
      );

      const response: any = await Promise.race([
        ai.models.generateContent({
          model: modelName,
          contents: `User (${userName}) asks: ${userPrompt}`,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            maxOutputTokens: 900,
            temperature: 0.6,
          },
        }),
        timeout,
      ]);

      if (response.text && response.text.trim() !== '') {
        return response.text;
      }
    } catch (err: any) {
      lastModelError = err?.message || String(err);
      // If error is quota limit on this key, throw it to trigger key rotation
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
    logger.warn('No GEMINI_API_KEY configured');
    const lower = userPrompt.toLowerCase().trim();
    if (lower === 'hi' || lower === 'hello' || lower === 'hiii' || lower === 'hey' || lower.includes('hello') || lower.includes('hi')) {
      return `Hello ${userName}! 👋 I'm DevChat AI. How can I help you with your code or technical questions today? Feel free to ask anything!`;
    }
    return `Hello ${userName}! I'm DevChat AI assistant. I can help you with JavaScript, TypeScript, React, Node.js, code reviews, and technical debugging. What are you working on today?`;
  }

  const fullPrompt = `${SYSTEM_INSTRUCTION}\n\nUser (${userName}) asks: ${userPrompt}`;
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

      // Last key also failed with quota
      if (isQuota) {
        return `⚠️ **API quota limit reached on all keys.**\n\nPlease wait a few minutes for the rate-limit window to reset, or add a new key in backend \`.env\` (\`GEMINI_API_KEY_2\`).`;
      }
    }
  }

  logger.error(`All ${keys.length} API keys failed. Last error: ${lastError}`);
  return `⚠️ **AI Error:** All API keys exhausted.\n\nLast error: ${lastError.substring(0, 200)}`;
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

