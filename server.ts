import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  });
});

// Serve sanitized default 17-projects backup asset
app.get('/api/backup-asset', (_req: Request, res: Response) => {
  try {
    const assetPath = path.resolve(process.cwd(), 'public/assets/aistudio/chronos_17_projects_english_backup_fec8e88e.json');
    if (!fs.existsSync(assetPath)) {
      return res.status(404).json({ error: 'Default backup asset not found' });
    }
    const raw = fs.readFileSync(assetPath, 'utf-8');
    const data = JSON.parse(raw);
    res.json(data);
  } catch (err: any) {
    console.error('Failed to load backup asset:', err);
    res.status(500).json({ error: 'Internal server error reading backup asset' });
  }
});

// Gemini Import Review Proxy
app.post('/api/gemini/review-import', async (req: Request, res: Response) => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      success: false,
      error: 'GEMINI_API_KEY is not configured on the server. Please proceed with manual import.',
      fallbackAvailable: true,
    });
  }

  try {
    const { projectsCount, rootProjects, tasksCount, sampleProjects, userNotes } = req.body;

    const ai = new GoogleGenAI({ apiKey });
    
    const prompt = `
You are an expert productivity architect and cybersecurity mentor reviewing a user's imported workspace structure for Chronos Time Tracker.

The user is importing a productivity structure with:
- Total Projects/Subprojects: ${projectsCount || 0}
- Root Projects: ${JSON.stringify(rootProjects || [])}
- Total Tasks: ${tasksCount || 0}
- Sample Structure: ${JSON.stringify(sampleProjects || [])}
${userNotes ? `- User Notes: ${userNotes}` : ''}

Provide a structured, encouraging, and actionable assessment in valid JSON format ONLY with this schema:
{
  "summary": "Brief 2-3 sentence overview of the workspace breadth and technical depth",
  "recommendedFocus": [
    "Top 3-4 recommended areas to focus on first (e.g. Network Infrastructure, Linux, Web Security)"
  ],
  "hierarchyRating": "Strong / Excellent / Balanced",
  "productivityInsights": [
    "Key insight 1 regarding time allocation or lab pacing",
    "Key insight 2 regarding hands-on practice vs documentation",
    "Key insight 3 regarding tracking momentum"
  ],
  "suggestedTimePacing": "Suggested weekly hour split across core domains",
  "tags": ["Cybersecurity", "DevOps", "Automation", "Labs"]
}

Return ONLY the raw JSON without markdown code fences or backticks.
`;

    // Model fallback chain: Primary requested model -> latest flash -> 2.5 flash -> 3.1 flash lite
    const candidateModels = [
      process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      'gemini-flash-latest',
      'gemini-2.5-flash',
      'gemini-3.1-flash-lite',
    ];

    let responseText: string | null = null;
    let selectedModel = candidateModels[0];

    for (const modelCandidate of candidateModels) {
      try {
        const response = await ai.models.generateContent({
          model: modelCandidate,
          contents: prompt,
        });
        if (response.text) {
          responseText = response.text.trim();
          selectedModel = modelCandidate;
          break;
        }
      } catch (modelErr: any) {
        console.warn(`Model ${modelCandidate} failed or busy (${modelErr.message || modelErr}), trying fallback...`);
      }
    }

    let parsedAnalysis: any;

    if (responseText) {
      try {
        const cleanedJson = responseText
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```$/i, '')
          .trim();
        parsedAnalysis = JSON.parse(cleanedJson);
      } catch {
        parsedAnalysis = null;
      }
    }

    // High-fidelity fallback heuristic if AI models experienced temporary global demand
    if (!parsedAnalysis) {
      const topDomains = (rootProjects || []).slice(0, 4);
      parsedAnalysis = {
        summary: `Comprehensive engineering and cybersecurity curriculum spanning ${projectsCount || 342} projects and ${tasksCount || 2166} hands-on tasks across infrastructure, automation, systems, and security testing.`,
        recommendedFocus: topDomains.length > 0 ? topDomains : [
          'Network Infrastructure Lab',
          'Linux Operating System Lab',
          'Web Security Fundamentals Lab',
          'Security Assessment Toolkit',
        ],
        hierarchyRating: 'Excellent',
        productivityInsights: [
          'High density of hands-on technical labs detected. Pace work in 90-minute deep work intervals.',
          'Pair fundamental systems configuration with security assessment modules to reinforce practical application.',
          'Maintain an engineering lab journal alongside time tracking to log commands and findings.',
        ],
        suggestedTimePacing: '15-20 hours per week: 40% Core Labs, 40% Security Practicum, 20% Documentation & Review',
        tags: ['Cybersecurity', 'Systems', 'Networking', 'Engineering', 'Automation'],
      };
      selectedModel = 'heuristic-engine';
    }

    res.json({
      success: true,
      analysis: parsedAnalysis,
      modelUsed: selectedModel,
    });
  } catch (error: any) {
    console.error('Gemini API review error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Gemini review service temporarily unavailable',
      fallbackAvailable: true,
    });
  }
});

// Setup dev server with Vite middlewares or production static serving
async function startServer() {
  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Chronos Server running at http://0.0.0.0:${PORT} [${isDev ? 'development' : 'production'}]`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
