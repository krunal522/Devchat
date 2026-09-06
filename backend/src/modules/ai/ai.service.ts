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
- Built-in Image Generator: When a user wants to visualize, draw, create, or generate an image, wallpaper, artwork, vehicle, scene, or visual photography, reply with:
  { "action": "image_generation", "prompt": "<detailed English visual prompt describing the subject, lighting, camera, and style>" }

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

// Detect if user is asking to create/generate an image (English, Hindi, Hinglish, universal ChatGPT/Midjourney style)
export function isImageGenerationRequest(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();

  // Slash commands
  if (/^\/(?:image|imagine|img|pic|photo|draw|generate|paint|render)\b/i.test(p)) return true;

  // Exact image noun keywords (including logo, icon, badge, emblem, etc.)
  const hasImageNoun = /\b(?:image|images|photo|photos|photograph|photographs|photography|picture|pictures|pic|pics|portrait|portraits|wallpaper|wallpapers|illustration|illustrations|artwork|drawing|drawings|sketch|sketches|avatar|avatars|logo|logos|icon|icons|badge|emblem|symbol|banner|poster|sticker|mascot|render|renders|tasveer|chhabi)\b/i.test(p);

  // Exact creation verb / intent keywords (including chiye, chahiye, etc.)
  const hasCreationIntent = /\b(?:create|created|creating|generate|generated|generating|draw|drawing|paint|painting|render|rendering|make|making|produce|design|banao|bana|banaye|banayein|banake|dikhao|dekhao|chahiye|chiye|chahie|dejiye|dejie|karo|kijiye|nikalo|kheecho|khincho)\b/i.test(p);

  if (hasImageNoun && hasCreationIntent) return true;

  // Direct phrasing like 'image of a cat', 'photo of sunset', 'picture of sports car', 'logo for company'
  if (/\b(?:image|photo|photograph|picture|pic|portrait|wallpaper|drawing|illustration|avatar|tasveer|logo|icon)\s+(?:of|for|showing|depicting|with)\b/i.test(p)) return true;

  // Direct creation starters like 'draw a...', 'can you draw a...', 'paint a...', 'sketch a...'
  if (/^(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:draw|paint|sketch|render|illustrate)\s+(?:me\s+)?(?:a|an|the|some)?\s*\w+/i.test(p)) return true;

  // Coding guard: prevent coding questions from triggering image generation (unless asking for logo/icon/avatar/wallpaper)
  const isLogoOrGraphic = /\b(?:logo|logos|icon|icons|badge|emblem|symbol|avatar|wallpaper|poster|banner|sticker)\b/i.test(p);
  const isCoding = !isLogoOrGraphic && /\b(?:code|app|website|page|function|api|component|database|sql|table|hook|script|frontend|backend|server|bug|error|npm|install|debug|syntax|compiler|typescript|javascript|python|java|react|nextjs|class|method|interface|schema)\b/i.test(p);

  // Photographic and visual style tags (e.g. "commercial car photography", "cinematic lighting", "8k resolution", "digital art")
  const hasPhotoStyle = /\b(?:commercial\s+(?:car\s+|product\s+|fashion\s+|portrait\s+)?photography|automotive\s+photography|car\s+photography|portrait\s+photography|product\s+photography|street\s+photography|wildlife\s+photography|landscape\s+photography|fashion\s+photography|nature\s+photography|cinematic\s+photography|macro\s+photography|aerial\s+photography|drone\s+photography|photorealistic|hyperrealistic|hyper-realistic|octane\s+render|unreal\s+engine|concept\s+art|digital\s+art|digital\s+illustration|matte\s+painting|3d\s+render|vector\s+art|cinematic\s+lighting|dramatic\s+lighting|studio\s+lighting|soft\s+lighting|volumetric\s+lighting|motion\s+blur|depth\s+of\s+field|bokeh|sharp\s+focus|8k\s+resolution|4k\s+wallpaper|high-end\s+commercial|shot\s+on\s+35mm|wide\s+angle\s+shot|close-up\s+shot|telephoto|isometric\s+view)\b/i.test(p);

  if (!isCoding && hasPhotoStyle) {
    return true;
  }

  // Prompts that explicitly end with image/photo/photography/wallpaper/avatar/render/logo
  if (/\b(?:avatar\s+image|user\s+avatar|profile\s+picture|profile\s+photo|profile\s+pic)\b/i.test(p)) return true;
  if (/\b(?:image|images|photo|photos|photograph|photographs|photography|pic|pics|wallpaper|portrait|illustration|render|drawing|artwork|logo|logos|icon|icons)$/i.test(p) && !isCoding) return true;

  // Hindi direct phrasing like '... ki photo', '... ka pic', '... ki tasveer', '... ka logo', '... chiye'
  if (/(?:ki|ka|ke)\s+(?:photo|image|tasveer|picture|pic|logo|icon|wallpaper|avatar)\b/i.test(p)) return true;
  if (/\b(?:ek\s+)?(?:photo|image|picture|pic|tasveer|logo|icon|wallpaper|avatar)\s+(?:banao|banado|chahiye|chiye|chahie|dejiye|dejie)/i.test(p)) return true;

  // 'banao ...' or '... banao' for visual entities (unless coding/technical query)
  if (!isCoding && /\b(?:banao|bana\s*do|banayein?)\b/i.test(p) && !/\b(?:kaise|kyu|kya|why|how)\b/i.test(p)) {
    return true;
  }

  return false;
}

// Extract the raw visual subject cleanly
export function extractImagePrompt(prompt: string): string {
  let p = prompt.trim();
  p = p.replace(/^\/(?:image|imagine|img|pic|photo|draw|generate|paint|render)\s*/i, '');
  p = p.replace(/^(?:can\s+you\s+|could\s+you\s+|please\s+)?(?:generate|create|make|draw|paint|render|illustrate)\s+(?:me\s+)?(?:an?\s+)?(?:image|photo|picture|pic|artwork|illustration|portrait|wallpaper|logo|icon)?\s*(?:of|for|showing|depicting)?\s*:?/i, '');
  p = p.replace(/\b(?:image|images|photo|photos|pic|pics|picture|pictures|tasveer|logo)\s+(?:created|generate|banao|bana\s+do|banaye|chahiye|chiye)\b/gi, '');
  p = p.replace(/^(?:banao|banaye|dikhao)\s+(?:ek\s+)?/i, '');
  p = p.replace(/\b(?:ki|ka|ke)\s+(?:image|photo|tasveer|picture|pic|logo|icon)\b/gi, '');
  p = p.replace(/\s*(?:banao|banado|chahiye|chiye|chahie|kar\s+dejie|kar\s+do|karo|dejiye)$/i, '');
  p = p.replace(/\s*(?:bekar\s+nay|bekar\s+nahi|bekar\s+nhi|accha\s+sa|acha\s+sa|best\s+quality).*$/i, '');
  p = p.replace(/\s*(?:ki|ka|ke)$/i, '');
  p = p.replace(/\s*\.{2,}\s*/g, ' ');
  p = p.replace(/\s+but$/i, '');
  return p.trim() || prompt.trim();
}

// Generate ChatGPT-Grade Visual Plan using Gemini
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
                text: `You are the Expert AI Art Director & Visual Creator for DevChat AI (operating with ChatGPT / DALL-E 3 visual mastery).
A user named "${userName}" requested to create an image: "${userPrompt}".

Your tasks:
1. Identify the exact subject the user wants (e.g. portraits, people, user avatars, luxury cars, animals, anime, landscapes, architecture, cyberpunk cities, 3D art, fantasy, product design). NEVER assume it is a car unless the user specifically asked for a vehicle or car!
2. Translate & craft an ultra-detailed, photorealistic, cinematic prompt in English for Black Forest Labs FLUX.1 (including camera lens, lighting, atmospheric details, composition, 8k resolution, photorealistic, sharp focus, no watermarks, lifelike textures).
CRITICAL FOR TECH & BRAND LOGOS (e.g. React, React Native, Python, JavaScript, Docker, Flutter, Android, Apple, Node.js):
- You MUST preserve and explicitly describe the EXACT REAL-WORLD ICONIC SHAPE, GEOMETRY, AND OFFICIAL COLOR CODES!
- For React / React Native: Describe the "official iconic cyan blue (#61DAFB) atom symbol with three intersecting elliptical orbital rings and central circular nucleus dot on clean dark background". NEVER replace it with a generic sphere, bowling ball, or unrelated glass orb!
- For Python: Two interlocking snakes in official blue (#306998) and yellow (#FFD438).
- For Node.js: Green hexagon (#339933) with clean Node geometry.
- For Docker: Blue whale carrying shipping containers.
- If it's a general company/startup logo, design a clean vector tech emblem with geometric precision.
3. Write a sleek, friendly, ChatGPT-style companion message in the EXACT SAME LANGUAGE and tone as the user (Hinglish/Hindi if user asked in Hinglish/Hindi, English if user asked in English):
   - subjectTitle: Clean, elegant title of the image (e.g., "Cyberpunk Street at Night", "Portrait of a Software Engineer", "Golden Retriever Puppy in Sunshine")
   - metaAiGreeting: A natural, polite introduction (e.g., "Ye lijiye, aapke liye **${userPrompt}** ki high-definition image taiyar hai ✨" or "Here is your photorealistic image of **[subject]** ✨")
   - metaAiHighlights: 1-2 sentences highlighting the key visual aesthetic (lighting, mood, textures, composition)
   - metaAiFollowUps: Array of 3 creative, relevant follow-up variations SPECIFIC to the subject (e.g., for a person: ["Studio cinematic close-up", "Outdoor golden hour lighting", "Black and white editorial portrait"]; for a landscape: ["Sunset golden hour", "Nighttime star-filled sky", "Winter snow atmosphere"]; for a car: ["Cockpit interior view", "Motion blur highway shot", "Track race drifting action"])
   - metaAiClosing: A short, friendly closing prompt (e.g., "Aapko kaunsa style sabse accha laga?" or "Which variation would you like to see next?")

Respond ONLY with valid JSON (no markdown ticks or extra text):
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
          temperature: 0.3,
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
              metaAiGreeting: parsed.metaAiGreeting || `Ye lijiye — aapke liye **${parsed.subjectTitle}** taiyar hai ✨`,
              metaAiHighlights: parsed.metaAiHighlights || '',
              metaAiFollowUps: Array.isArray(parsed.metaAiFollowUps) ? parsed.metaAiFollowUps : ['Cinematic close-up detailed shot', 'Dramatic studio lighting variation', 'Vibrant artistic atmosphere'],
              metaAiClosing: parsed.metaAiClosing || 'Batao kis variation me aur banau?',
            };
          }
        }
      }
    } catch (err) {
      logger.warn(`Gemini Meta AI image planning failed, using intelligent fallback: ${err}`);
    }
  }

  // Intelligent Fallback (handles any subject: people, animals, cars, nature, architecture, art, sci-fi)
  const rawSubject = extractImagePrompt(userPrompt);
  const isHindi = /kar\s+dejie|kar\s+do|banao|chahiye|chiye|dejiye|karo|dikhao|kheecho/i.test(userPrompt);
  const isLogo = /\b(logo|logos|icon|icons|badge|emblem|symbol|branding|mascot)\b/i.test(userPrompt);
  const isReact = /\b(react|react\s*js|reactjs|react\s*native)\b/i.test(userPrompt);
  const isPython = /\bpython\b/i.test(userPrompt);
  const isNode = /\b(node|nodejs|node\s*js)\b/i.test(userPrompt);
  const isDocker = /\bdocker\b/i.test(userPrompt);
  const isPerson = /\b(man|woman|boy|girl|person|portrait|face|model|actor|actress|developer|engineer|coder|avatar|ladka|ladki|aadmi|aurat)\b/i.test(userPrompt);
  const isCar = /\b(car|cars|gadi|gaadi|vehicle|bike|motorcycle|supercar|ferrari|bmw|audi|lamborghini|porsche|swift|tesla|mercedes)\b/i.test(userPrompt);
  const isAnimal = /\b(cat|dog|puppy|kitten|lion|tiger|bird|eagle|horse|wolf|pet|animal|janwar|kutta|billi|sher)\b/i.test(userPrompt);
  const isLandscape = /\b(nature|mountain|mountains|sea|ocean|beach|sunset|sunrise|forest|river|sky|space|galaxy|pahar|samundar)\b/i.test(userPrompt);
  const isArchitecture = /\b(house|home|building|room|interior|mansion|villa|city|street|skyscraper|cafe|ghar|kamra)\b/i.test(userPrompt);

  let subjectTitle = rawSubject ? rawSubject.charAt(0).toUpperCase() + rawSubject.slice(1) : 'Creative Visual';

  let enhancedPrompt = '';
  let metaAiFollowUps: string[] = [];

  if (isReact) {
    subjectTitle = 'Official React JS Atom Logo';
    enhancedPrompt = 'High-end 3D render of the official React JS logo, iconic glowing electric cyan blue (#61DAFB) atom symbol with three intersecting elliptical orbital rings around a central circular nucleus dot, clean dark charcoal studio background, ray-tracing, cinematic lighting, 8k resolution, sharp focus, masterpiece';
    metaAiFollowUps = isHindi
      ? ['Minimalist flat cyan vector React logo', 'Neon glowing cyberpunk React atom wallpaper', 'Metallic embossed React 3D badge']
      : ['Minimalist flat cyan vector React logo', 'Neon glowing cyberpunk React atom wallpaper', 'Metallic embossed React 3D badge'];
  } else if (isPython) {
    subjectTitle = 'Official Python Logo';
    enhancedPrompt = 'High-end 3D render of the official Python programming language logo, two interlocking snakes in official vibrant blue (#306998) and yellow (#FFD438), clean dark background, ray-tracing, 8k resolution, masterpiece';
    metaAiFollowUps = isHindi
      ? ['Flat minimalist vector Python logo', 'Cyberpunk neon Python emblem', 'Gold and metallic Python badge']
      : ['Flat minimalist vector Python logo', 'Cyberpunk neon Python emblem', 'Gold and metallic Python badge'];
  } else if (isNode) {
    subjectTitle = 'Official Node.js Logo';
    enhancedPrompt = 'High-end 3D render of the official Node.js hexagon logo, vibrant emerald green (#339933), clean dark background, ray-tracing, 8k resolution, masterpiece';
    metaAiFollowUps = isHindi
      ? ['Minimalist green vector Node.js icon', 'Glowing neon Node.js hexagon', 'Metallic 3D badge look']
      : ['Minimalist green vector Node.js icon', 'Glowing neon Node.js hexagon', 'Metallic 3D badge look'];
  } else if (isDocker) {
    subjectTitle = 'Official Docker Logo';
    enhancedPrompt = 'High-end 3D render of the official Docker logo, iconic blue whale carrying stacked shipping containers, ocean ambient reflections, 8k resolution, masterpiece';
    metaAiFollowUps = isHindi
      ? ['Flat vector Docker whale logo', 'Cyberpunk neon Docker graphic', 'Minimalist container badge']
      : ['Flat vector Docker whale logo', 'Cyberpunk neon Docker graphic', 'Minimalist container badge'];
  } else if (isLogo) {
    enhancedPrompt = `Professional modern vector logo design for ${rawSubject}, sharp geometric lines, clean minimalist tech branding aesthetic, centered vector graphic, balanced corporate identity, dark mode background, 8k resolution, vector art, masterpiece`;
    metaAiFollowUps = isHindi
      ? ['Dark mode glowing neon effect logo', 'Minimalist black and white monochrome version', '3D embossed metallic badge variation']
      : ['Dark mode glowing neon logo effect', 'Minimalist black & white monochrome version', '3D embossed metallic badge look'];
  } else if (isPerson) {
    enhancedPrompt = `Ultra-detailed photorealistic portrait photograph of ${rawSubject}, natural skin textures, 85mm f/1.4 lens, soft cinematic studio lighting, shallow depth of field, catchlights in eyes, high-fashion editorial aesthetic, 8k resolution, masterpiece`;
    metaAiFollowUps = isHindi
      ? ['Cinematic close-up portrait with golden hour lighting', 'Studio black and white editorial style', 'Neon cyberpunk aesthetic look']
      : ['Cinematic close-up with golden hour lighting', 'Black & white studio editorial portrait', 'Cyberpunk neon atmosphere'];
  } else if (isCar) {
    enhancedPrompt = `Commercial automotive photography of modern sleek ${rawSubject}, glossy reflective metallic paint, headlights on, dynamic studio lighting, showroom reflections on polished floor, photorealistic, 8k resolution, octane render`;
    metaAiFollowUps = isHindi
      ? ['Cockpit interior and dashboard view', 'Road pe high-speed cinematic shot', 'Night city neon reflections view']
      : ['Luxury interior and cockpit view', 'Cinematic motion shot on scenic road', 'Night city neon reflection view'];
  } else if (isAnimal) {
    enhancedPrompt = `Award-winning National Geographic wildlife photograph of ${rawSubject}, sharp fur details, natural soft sunlight, macro depth of field, beautiful environmental background, 8k resolution, lifelike and photorealistic`;
    metaAiFollowUps = isHindi
      ? ['Close-up expressive portrait shot', 'Natural habitat action shot', 'Studio dramatic lighting portrait']
      : ['Close-up expressive portrait', 'Action shot in natural habitat', 'Dramatic studio lighting variation'];
  } else if (isLandscape) {
    enhancedPrompt = `Breathtaking landscape photography of ${rawSubject}, dramatic atmospheric golden hour lighting, volumetric light rays, ultra-wide angle 16mm lens, crisp natural textures, 8k resolution, photorealistic`;
    metaAiFollowUps = isHindi
      ? ['Dramatic sunset golden hour view', 'Night scene with Milky Way starry sky', 'Atmospheric foggy morning shot']
      : ['Golden hour sunset variation', 'Nighttime starry galaxy sky', 'Misty morning aerial perspective'];
  } else if (isArchitecture) {
    enhancedPrompt = `Architectural Digest photography of ${rawSubject}, minimalist modern interior design, warm natural ambient lighting, marble and wood textures, clean lines, photorealistic, 8k resolution`;
    metaAiFollowUps = isHindi
      ? ['Cozy night illumination view', 'Minimalist daylight interior shot', 'Exterior modern architectural view']
      : ['Warm night illumination view', 'Minimalist daylight wide interior', 'Modern exterior architectural angle'];
  } else {
    enhancedPrompt = `Ultra-high-definition 8k photorealistic commercial photograph of ${rawSubject}, highly detailed textures, beautiful cinematic studio lighting, sharp focus, professional depth of field, award-winning composition, lifelike masterpiece`;
    metaAiFollowUps = isHindi
      ? ['Cinematic close-up detailed shot', 'Studio dramatic lighting variation', 'Cyberpunk vibrant color style']
      : ['Cinematic close-up detailed shot', 'Dramatic studio lighting variation', 'Vibrant artistic atmosphere'];
  }

  const metaAiGreeting = isHindi
    ? `Ye lijiye — aapke liye **${subjectTitle}** ki high-definition visual image taiyar hai ✨`
    : `Here is your photorealistic image of **${subjectTitle}** ✨`;

  const metaAiHighlights = isHindi
    ? `Maine is visual ko 1024×1024 ultra-HD resolution, natural lighting aur realistic textures ke sath craft kiya hai.`
    : `Rendered with 1024×1024 resolution, balanced cinematic lighting, and realistic details.`;

  const metaAiClosing = isHindi
    ? 'Aapko ye presentation kaisi lagi? Batao kis variation me aur banau?'
    : 'How does this look? Let me know which variation or perspective you would like next!';

  return {
    subjectTitle,
    enhancedPrompt,
    metaAiGreeting,
    metaAiHighlights,
    metaAiFollowUps,
    metaAiClosing,
  };
}

// Generate image buffer using Ultra-Fast FLUX engine with multi-tiered fallback
async function fetchHuggingFaceImageBuffer(enhancedPrompt: string): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const hfToken = env.HUGGINGFACE_API_KEY?.trim() || process.env.HF_TOKEN?.trim() || '';

  // Method 1: Ultra-Fast High-Definition FLUX via Pollinations AI (~2.5s - 3.5s, 100% Free & Unlimited)
  try {
    logger.info('Calling ultra-fast FLUX image engine (Pollinations AI)...');
    const seed = Math.floor(Math.random() * 10000000);
    const pollinationsUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(enhancedPrompt)}?model=flux&width=1024&height=1024&seed=${seed}&nologo=true`;
    const res = await fetch(pollinationsUrl, { signal: AbortSignal.timeout(9000) });
    if (res.ok) {
      const arrayBuf = await res.arrayBuffer();
      if (arrayBuf.byteLength > 1000) {
        logger.info(`Successfully generated ultra-fast FLUX image (${arrayBuf.byteLength} bytes) in ~3s`);
        return {
          buffer: Buffer.from(arrayBuf),
          mimeType: res.headers.get('content-type') || 'image/jpeg',
        };
      }
    }
  } catch (pollErr: any) {
    logger.warn(`Fast FLUX engine error (${pollErr?.message || pollErr}) — falling back to Hugging Face...`);
  }

  // Method 2: Hugging Face Official Inference API with FLUX.1-schnell (Ultra fast ~4-5s with nscale)
  if (hfToken) {
    try {
      logger.info('Calling Hugging Face Inference API with FLUX.1-schnell...');
      const hf = new HfInference(hfToken);
      const blob: any = await hf.textToImage({
        model: 'black-forest-labs/FLUX.1-schnell',
        inputs: enhancedPrompt,
      });

      if (blob) {
        const arrayBuf = await blob.arrayBuffer();
        if (arrayBuf.byteLength > 1000) {
          logger.info(`Successfully generated FLUX image (${arrayBuf.byteLength} bytes) in ultra-HD`);
          return {
            buffer: Buffer.from(arrayBuf),
            mimeType: blob.type || 'image/jpeg',
          };
        }
      }
    } catch (err: any) {
      logger.warn(`Hugging Face FLUX.1-schnell API error: ${err?.message || err}`);
    }
  }

  // Method 2: Hugging Face Official Inference API with Stable Diffusion XL (SDXL 1.0)
  if (hfToken) {
    try {
      logger.info('Calling Hugging Face Inference API with SDXL 1.0 backup...');
      const hf = new HfInference(hfToken);
      const blob: any = await hf.textToImage({
        model: 'stabilityai/stable-diffusion-xl-base-1.0',
        inputs: enhancedPrompt,
      });

      if (blob) {
        const arrayBuf = await blob.arrayBuffer();
        if (arrayBuf.byteLength > 1000) {
          logger.info(`Successfully generated SDXL backup image (${arrayBuf.byteLength} bytes)`);
          return {
            buffer: Buffer.from(arrayBuf),
            mimeType: blob.type || 'image/jpeg',
          };
        }
      }
    } catch (err: any) {
      logger.warn(`Hugging Face SDXL API error: ${err?.message || err}`);
    }
  }

  // Method 3: Hugging Face Gradio Space (black-forest-labs/FLUX.1-schnell)
  try {
    logger.info('Calling Hugging Face Gradio Space FLUX.1-schnell backup...');
    const client = await Client.connect('black-forest-labs/FLUX.1-schnell', hfToken ? { token: hfToken as any } : undefined);
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
        if (arrayBuf.byteLength > 1000) {
          return {
            buffer: Buffer.from(arrayBuf),
            mimeType: res.headers.get('content-type') || 'image/webp',
          };
        }
      }
    }
  } catch (err: any) {
    logger.warn(`Hugging Face Gradio Space error: ${err?.message || err}`);
  }

  return null;
}

// Generate AI image using Hugging Face FLUX with pure ChatGPT-Grade Experience
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

    // Resilient DB Persistence for AI images on ephemeral container restarts
    try {
      await prisma.fileUpload.upsert({
        where: { filename: savedDiskName },
        update: {
          mimeType,
          size: fileSize,
          data: new Uint8Array(imageResult.buffer),
        },
        create: {
          filename: savedDiskName,
          mimeType,
          size: fileSize,
          data: new Uint8Array(imageResult.buffer),
        },
      });
      logger.info(`Persisted AI image ${savedDiskName} to database`);
    } catch (dbErr) {
      logger.error('Failed to backup AI image to database:', dbErr);
    }
  }

  // Format cleanly like ChatGPT / DALL-E (Zero third-party credits, dynamic contextual suggestions)
  const isHindi = /kar\s+dejie|kar\s+do|banao|chahiye|dejiye|karo|dikhao|kheecho/i.test(prompt);

  const followUpBullets = plan.metaAiFollowUps && plan.metaAiFollowUps.length > 0
    ? plan.metaAiFollowUps.map((item) => `• ✦ ${item}`).join('\n')
    : '';

  const followUpSection = followUpBullets
    ? `\n\n${isHindi ? '**Aap chahein toh mai isme aur variations bana sakta hu:**' : '**Looking for variations? You can also explore:**'}\n${followUpBullets}\n\n${plan.metaAiClosing}`
    : '';

  const text = `${plan.metaAiGreeting}

${fileUrl ? `![${plan.subjectTitle}](${fileUrl})\n\n` : ''}${plan.metaAiHighlights ? `${plan.metaAiHighlights}` : ''}${followUpSection}`;

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

        // ⚡ Intercept tool/action call JSON for image generation from Gemini
        if (text.includes('"action"') && text.includes('"image_generation"')) {
          logger.info('Detected Gemini image_generation action JSON — intercepting and executing image generator');
          let extractedPrompt = userPrompt;
          try {
            const actionMatch = text.match(/\{[\s\S]*?"action"\s*:\s*"image_generation"[\s\S]*?\}/);
            if (actionMatch) {
              const parsed = JSON.parse(actionMatch[0]);
              if (parsed.prompt && typeof parsed.prompt === 'string' && parsed.prompt.trim()) {
                extractedPrompt = parsed.prompt.trim();
              }
            }
          } catch {
            const promptMatch = text.match(/"prompt"\s*:\s*"([^"]+)"/);
            if (promptMatch && promptMatch[1]) {
              extractedPrompt = promptMatch[1];
            }
          }
          return await generateAIImage(extractedPrompt, userName);
        }

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

export function generateSmartFallbackResponse(prompt: string, userName: string, hasImage: boolean = false): string {
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

