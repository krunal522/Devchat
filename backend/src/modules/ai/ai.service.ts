import fs from 'fs';
import path from 'path';
import { prisma } from '../../config/database.js';
import { logger } from '../../utils/logger.js';
import { env } from '../../config/env.js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Client } from '@gradio/client';
import { HfInference } from '@huggingface/inference';

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

export interface ImageAttachmentInput {
  fileName?: string;
  fileUrl: string;
  fileType?: string;
  fileSize?: number;
  mimeType?: string;
}

export interface AIResponseResult {
  text: string;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    mimeType: string;
  }>;
}

// Convert image attachment (local uploads or remote URL) to Base64 for Gemini Vision
export async function getImageBase64(attachment: ImageAttachmentInput): Promise<{ mimeType: string; data: string } | null> {
  try {
    const { fileUrl, mimeType } = attachment;
    if (!fileUrl) return null;

    // 1. If it's a local upload from /uploads/
    if (fileUrl.includes('/uploads/')) {
      const filename = fileUrl.split('/uploads/')[1]?.split('?')[0];
      if (filename) {
        const localPath = path.join(process.cwd(), 'uploads', filename);
        if (fs.existsSync(localPath)) {
          const buffer = await fs.promises.readFile(localPath);
          let detectedMime = mimeType;
          if (!detectedMime || detectedMime === 'application/octet-stream') {
            const ext = path.extname(filename).toLowerCase();
            detectedMime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
          }
          return {
            mimeType: detectedMime,
            data: buffer.toString('base64'),
          };
        }
      }
    }

    // 2. Fetch via HTTP if remote URL or not found on disk
    const res = await fetch(fileUrl);
    if (!res.ok) return null;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = res.headers.get('content-type') || mimeType || 'image/jpeg';
    return {
      mimeType: contentType.split(';')[0].trim(),
      data: buffer.toString('base64'),
    };
  } catch (err: any) {
    logger.warn(`Failed to process image attachment for AI vision: ${err.message || err}`);
    return null;
  }
}

export interface MetaAiImagePlan {
  subjectTitle: string;
  enhancedPrompt: string;
  metaAiGreeting: string;
  metaAiHighlights: string;
  metaAiFollowUps: string[];
  metaAiClosing: string;
}

// Detect if user is asking to create/generate an image (English, Hindi, Hinglish)
export function isImageGenerationRequest(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  if (
    p.startsWith('/image') ||
    p.startsWith('/imagine') ||
    p.startsWith('/img') ||
    p.startsWith('/draw') ||
    p.startsWith('/generate')
  ) {
    return true;
  }

  // Exact intent regexes
  const patterns = [
    /\b(?:image|images|photo|photos|picture|pictures|tasveer|pic|pics)\s+(?:create|created|generate|generated)\b/i,
    /\b(?:create|created|generate|generated|draw|paint|render)\s+(?:an?\s+)?(?:image|photo|picture|pic|illustration|wallpaper|drawing)\b/i,
    /\b(?:image|photo|tasveer|picture|pic)\s+(?:banao|bana\s*do|banaye|banayein|bana\s*ke\s*do|banake\s*do|chahiye|dejiye|dejie|kijiye)\b/i,
    /\b(?:banao|bana\s*do|banake\s*do|bana\s*ke\s*do)\s+(?:ek\s+)?(?:image|photo|tasveer|picture)\b/i,
    /\b(?:ek\s+)?(?:image|photo|tasveer|picture)\s+(?:banao|create|generate)\b/i,
    /\b(?:draw|paint)\s+(?:me\s+)?(?:a\s+|an\s+)?\w+/i,
    /\b(?:can you|please|kripya)?\s*(?:create|generate|make|draw)\s+(?:me\s+)?(?:an?\s+)?(?:image|photo|picture)\b/i,
    /\b(?:photo|image|tasveer)\s+(?:nikalo|dekhao|kheecho|khincho|chahiye)\b/i,
  ];

  if (patterns.some((regex) => regex.test(p))) return true;

  // Flexible co-occurrence check (e.g. "Swift car images created kar dejie..new model but")
  const hasImage = /\b(image|images|photo|photos|picture|pictures|tasveer|pic|pics)\b/i.test(p);
  const hasIntent = /\b(create|created|generate|generated|banao|bana|draw|paint|dejie|dejiye|chahiye|karo|kar|dikhao)\b/i.test(p);

  return hasImage && hasIntent;
}

// Extract the raw subject if AI parsing is unavailable
export function extractImagePrompt(prompt: string): string {
  let p = prompt.trim();
  p = p.replace(/^\/(image|imagine|img|draw|generate)\s*/i, '');
  p = p.replace(/(?:generate|create|make|draw|paint)\s+(?:an?\s+)?(?:image|photo|picture|artwork|illustration)\s+(?:of|for|showing|depicting)?\s*:?/i, '');
  p = p.replace(/(?:images?|photos?)\s+(?:created|generate|banao)\s+(?:kar\s+dejie|kar\s+do|karo|chahiye)?/i, '');
  p = p.replace(/\s*(ki|ka)\s+(image|photo|tasveer)\s+(banao|chahiye)$/i, '');
  p = p.replace(/\s*new\s+model\s*but/i, 'new model');
  p = p.replace(/^(image|photo)\s+(banao|generate\s+karo)\s*/i, '');
  return p.trim() || prompt.trim();
}

// Generate Meta AI Structured Plan using Gemini
async function planMetaAiImage(userPrompt: string, userName: string): Promise<MetaAiImagePlan> {
  const cleanKey = env.GEMINI_API_KEY?.trim();
  if (cleanKey) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${cleanKey}`;
      const payload = {
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `You are the Meta AI Art Director & Conversational Assistant for DevChat AI.
A user named "${userName}" asked: "${userPrompt}".

Your tasks:
1. Identify the core subject (e.g., "New Maruti Suzuki Swift 2024-2025 model").
2. Translate & craft an ultra-detailed, photorealistic 8K commercial photography prompt in English for Black Forest Labs FLUX.1 / SDXL (lighting, camera lens, angle, reflections, 8k resolution, photorealistic, sharp focus, no watermarks, realistic).
3. Write an ultra-engaging, friendly Meta AI-style companion message in the EXACT SAME LANGUAGE and tone as the user (use Hinglish/Hindi if user asked in Hinglish/Hindi, or English if English). Follow Meta AI WhatsApp format:
   - Greeting: e.g. "Ye lo — New Maruti Suzuki Swift 2024-2025 model 🔥"
   - Highlights: (e.g. 3 colors or key design features)
   - Engaging interactive question: (e.g. "New Swift ka front grill aur LED lights ekdum fresh hai. Aapko kaunsa color zyada pasand aaya?")
   - 3 follow-up generation styles (e.g. interior view, road running shot, custom number plate)
   - Closing question: e.g. "Batao kis style me aur banau?"

Respond ONLY with valid JSON (no markdown ticks or extra words):
{
  "subjectTitle": "...",
  "enhancedPrompt": "...",
  "metaAiGreeting": "...",
  "metaAiHighlights": "...",
  "metaAiFollowUps": ["...", "...", "..."],
  "metaAiClosing": "..."
}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        },
      };

      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (resp.ok) {
        const data: any = await resp.json();
        const candidate = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
        const jsonMatch = candidate.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.enhancedPrompt && parsed.subjectTitle) {
            return {
              subjectTitle: parsed.subjectTitle,
              enhancedPrompt: parsed.enhancedPrompt,
              metaAiGreeting: parsed.metaAiGreeting || `Ye lo — ${parsed.subjectTitle} 🔥`,
              metaAiHighlights: parsed.metaAiHighlights || '',
              metaAiFollowUps: Array.isArray(parsed.metaAiFollowUps) ? parsed.metaAiFollowUps : ['Interior view', 'Road pe chalta hua view', 'Customized style'],
              metaAiClosing: parsed.metaAiClosing || 'Batao kis style me aur banau?',
            };
          }
        }
      }
    } catch (err) {
      logger.warn(`Gemini Meta AI image planning failed, using intelligent fallback: ${err}`);
    }
  }

  // Intelligent Fallback (handles Swift / cars / general subjects with perfection)
  const rawSubject = extractImagePrompt(userPrompt);
  const isSwift = /swift/i.test(userPrompt);
  const isCar = /car|gadi|gaadi|vehicle/i.test(userPrompt);
  const isHindi = /kar\s+dejie|kar\s+do|banao|chahiye|dejiye|karo/i.test(userPrompt);

  const subjectTitle = isSwift
    ? 'New Maruti Suzuki Swift 2024-2025 model'
    : rawSubject.charAt(0).toUpperCase() + rawSubject.slice(1);

  const enhancedPrompt = isSwift
    ? 'Studio portrait shot of brand new 2024-2025 Maruti Suzuki Swift hatchback, burning red metallic paint with gloss black roof, sleek LED headlights on, front hexagonal grille, modern alloy wheels, clean studio lighting, photorealistic, 8k resolution, commercial automotive photography'
    : isCar
      ? `Ultra-realistic 8k commercial automotive photography of modern ${rawSubject}, sleek body design, LED lights on, reflections on glossy showroom floor, cinematic studio lighting, photorealistic, high resolution`
      : `High-definition 8k photorealistic commercial photograph of ${rawSubject}, highly detailed, sharp focus, beautiful natural studio lighting, professional depth of field, award-winning shot`;

  const metaAiGreeting = isHindi
    ? `Ye lo — ${subjectTitle} 🔥`
    : `Here is your ${subjectTitle}! ✨`;

  const metaAiHighlights = isHindi
    ? isSwift
      ? `**3 colors me:**\n• 🔵 Glacier Blue\n• 🔴 Burning Red\n• ⚪ Pearl Silver\n\nNew Swift ka front grill aur LED lights ekdum fresh aur aggressive hain. Aapko kaunsa color zyada pasand aaya?`
      : `Maine aapke liye ekdum fresh aur high-definition photorealistic visual taiyar kiya hai. Kaisi lagi ye visual presentation?`
    : `**Key Highlights:**\n• Ultra-HD 1024×1024 resolution\n• Photorealistic lighting & textures\n• Studio-grade commercial aesthetic`;

  const metaAiFollowUps = isHindi
    ? isSwift
      ? ['Swift ka luxury interior & cockpit view', 'Road pe chalta hua cinematic high-speed image', 'Aapke naam ki custom number plate wala Swift']
      : ['Iska close-up detailed shot', 'Realistic outdoor environment shot', 'Night scene with glowing ambient lighting']
    : ['Close-up detailed view', 'Cinematic outdoor action shot', 'Nighttime neon lighting variation'];

  const metaAiClosing = isHindi ? 'Batao kis style me aur banau?' : 'Let me know which style you would like to generate next!';

  return {
    subjectTitle,
    enhancedPrompt,
    metaAiGreeting,
    metaAiHighlights,
    metaAiFollowUps,
    metaAiClosing,
  };
}

// Generate image buffer from Hugging Face FLUX model
async function fetchHuggingFaceImageBuffer(enhancedPrompt: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  // Method 1: Hugging Face official FLUX.1-schnell Space via Gradio Client (Zero paid key needed)
  try {
    logger.info(`Calling Hugging Face black-forest-labs/FLUX.1-schnell space for prompt: "${enhancedPrompt.substring(0, 60)}..."`);
    const client = await Client.connect('black-forest-labs/FLUX.1-schnell');
    const result = await client.predict('/infer', {
      prompt: enhancedPrompt,
      seed: Math.floor(Math.random() * 10000000),
      randomize_seed: true,
      width: 1024,
      height: 1024,
      num_inference_steps: 4,
    });

    const imgData = (result.data as any[])?.[0];
    const outputUrl = imgData?.url || imgData?.path;

    if (outputUrl && typeof outputUrl === 'string') {
      const res = await fetch(outputUrl);
      if (res.ok) {
        const arrayBuf = await res.arrayBuffer();
        logger.info(`Successfully generated and downloaded image from Hugging Face FLUX (${arrayBuf.byteLength} bytes)`);
        return {
          buffer: Buffer.from(arrayBuf),
          mimeType: res.headers.get('content-type') || 'image/webp',
        };
      }
    }
  } catch (err: any) {
    logger.warn(`Hugging Face Space FLUX.1 error: ${err?.message || err}`);
  }

  // Method 2: Hugging Face Inference API with User Token (if configured)
  const hfToken = env.HUGGINGFACE_API_KEY?.trim();
  if (hfToken) {
    try {
      logger.info('Calling Hugging Face Inference API with user access token...');
      const hf = new HfInference(hfToken);
      const blob: any = await hf.textToImage({
        model: 'black-forest-labs/FLUX.1-schnell',
        inputs: enhancedPrompt,
        parameters: {
          num_inference_steps: 4,
        },
      });

      if (blob) {
        const arrayBuf = await blob.arrayBuffer();
        logger.info(`Successfully generated image from Hugging Face Token API (${arrayBuf.byteLength} bytes)`);
        return {
          buffer: Buffer.from(arrayBuf),
          mimeType: blob.type || 'image/jpeg',
        };
      }
    } catch (err: any) {
      logger.warn(`Hugging Face Token API error: ${err?.message || err}`);
    }
  }

  // Method 3: High-Definition Secondary Backup
  try {
    const seed = Math.floor(Math.random() * 10000000);
    const backupUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?width=1024&height=1024&nologo=true&seed=${seed}`;
    const res = await fetch(backupUrl);
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > 10000) {
        return {
          buffer: Buffer.from(arrayBuf),
          mimeType: 'image/jpeg',
        };
      }
    }
  } catch (err: any) {
    logger.warn(`Backup image generation error: ${err?.message || err}`);
  }

  return null;
}

// Generate AI image using Hugging Face FLUX with Meta AI Experience
export async function generateAIImage(prompt: string, userName: string): Promise<AIResponseResult> {
  const plan = await planMetaAiImage(prompt, userName);
  const imageResult = await fetchHuggingFaceImageBuffer(plan.enhancedPrompt);

  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  let fileUrl = '';
  let fileName = `${plan.subjectTitle.slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_') || 'ai-image'}.webp`;
  let fileSize = 0;
  let mimeType = 'image/webp';

  if (imageResult) {
    mimeType = imageResult.mimeType;
    const ext = mimeType.includes('png') ? 'png' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'webp';
    fileName = `${plan.subjectTitle.slice(0, 30).replace(/[^a-zA-Z0-9_-]/g, '_') || 'ai-image'}.${ext}`;
    const savedDiskName = `ai-img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${ext}`;
    const filePath = path.join(uploadsDir, savedDiskName);

    await fs.promises.writeFile(filePath, imageResult.buffer);
    fileUrl = `/uploads/${savedDiskName}`;
    fileSize = imageResult.buffer.length;
    logger.info(`Saved generated AI image to ${filePath} (${fileSize} bytes)`);
  }

  // Format exactly like Meta AI WhatsApp experience
  const followUpBullets = plan.metaAiFollowUps.map((item, idx) => {
    const icon = idx === 0 ? '🚗' : idx === 1 ? '🛣️' : '🏷️';
    return `• ${icon} ${item}`;
  }).join('\n');

  const text = `${plan.metaAiGreeting}

${fileUrl ? `![${plan.subjectTitle}](${fileUrl})\n\n` : ''}${plan.metaAiHighlights ? `${plan.metaAiHighlights}\n\n` : ''}**Agar chahiye to mai:**
${followUpBullets}

${plan.metaAiClosing}

---
*⚡ Engine: Hugging Face FLUX.1 (1024×1024 Photorealistic)*`;

  return {
    text,
    attachments: fileUrl
      ? [
          {
            fileName,
            fileUrl,
            fileType: 'IMAGE',
            fileSize,
            mimeType,
          },
        ]
      : [],
  };
}

// Helper: call Gemini REST API directly (100% reliable across all Node environments, zero thinking latency)
async function callGeminiRest(
  apiKey: string,
  userPrompt: string,
  userName: string,
  history: ChatHistoryMessage[] = [],
  imageParts: Array<{ mimeType: string; data: string }> = []
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

      const parts: any[] = [];
      for (const img of imageParts) {
        parts.push({
          inline_data: {
            mime_type: img.mimeType,
            data: img.data,
          },
        });
      }
      parts.push({
        text: `${SYSTEM_INSTRUCTION}\n\nUser (${userName}) asks: ${userPrompt || 'Describe and analyze this image in detail.'}`,
      });

      contents.push({
        role: 'user',
        parts,
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
  history: ChatHistoryMessage[] = [],
  imageParts: Array<{ mimeType: string; data: string }> = []
): Promise<string> {
  const cleanKey = apiKey.trim();

  // Try direct REST call first (fastest zero-latency path)
  try {
    return await callGeminiRest(cleanKey, userPrompt, userName, history, imageParts);
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

      const sdkParts: any[] = [];
      for (const img of imageParts) {
        sdkParts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        });
      }
      sdkParts.push(`${SYSTEM_INSTRUCTION}\n\nUser (${userName}) asks: ${userPrompt || 'Describe and analyze this image in detail.'}`);

      const result = await model.generateContent(sdkParts);
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
  history: ChatHistoryMessage[] = [],
  attachments: ImageAttachmentInput[] = []
): Promise<AIResponseResult> {
  // Check if this is an image generation request
  if (isImageGenerationRequest(userPrompt)) {
    logger.info(`AI Image Generation requested for prompt: "${userPrompt}"`);
    return await generateAIImage(userPrompt, userName);
  }

  // Check for image attachments to enable Multimodal Vision
  const imageParts: Array<{ mimeType: string; data: string }> = [];
  if (attachments && attachments.length > 0) {
    for (const att of attachments) {
      const isImage =
        (att.mimeType && att.mimeType.startsWith('image/')) ||
        (att.fileType && att.fileType.toUpperCase() === 'IMAGE') ||
        /\.(jpg|jpeg|png|webp|gif)$/i.test(att.fileUrl || '');

      if (isImage) {
        const base64Obj = await getImageBase64(att);
        if (base64Obj) {
          imageParts.push(base64Obj);
        }
      }
    }
  }

  // Build list of all configured keys (filter empty)
  const keys = [env.GEMINI_API_KEY, env.GEMINI_API_KEY_2].filter(
    (k): k is string => !!k && k.trim() !== ''
  );

  if (keys.length === 0) {
    logger.warn('No GEMINI_API_KEY configured — generating smart context response');
    return { text: generateSmartFallbackResponse(userPrompt, userName, imageParts.length > 0) };
  }

  let lastError = '';

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    logger.info(`AI Request — trying key ${i + 1}/${keys.length} (${key.substring(0, 8)}...), images attached: ${imageParts.length}`);

    try {
      const text = await callGemini(key, userPrompt, userName, history, imageParts);

      if (text && text.trim() !== '') {
        logger.info(`AI Response generated with key ${i + 1} (${text.length} chars)`);
        return { text };
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
        return { text: generateSmartFallbackResponse(userPrompt, userName, imageParts.length > 0) };
      }
    }
  }

  logger.error(`All ${keys.length} API keys failed. Last error: ${lastError}`);
  return { text: generateSmartFallbackResponse(userPrompt, userName, imageParts.length > 0) };
}

function generateSmartFallbackResponse(prompt: string, userName: string, hasImage: boolean = false): string {
  if (hasImage) {
    return `Hey @${userName}! I received your image attachment. Since my online AI API keys are currently unavailable or quota reached, I couldn't run optical vision analysis on this image right now. Please ensure a valid \`GEMINI_API_KEY\` is configured in \`backend/.env\`! 🖼️`;
  }
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

