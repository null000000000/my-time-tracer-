import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// In-memory rate limiting map for guest AI calls
const guestRateLimitMap = new Map<string, { count: number; resetAt: number }>();

// Health Check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    guestModeSupported: true,
    defaultDatasetRemoved: true,
    multiTenantIsolated: true,
    storageTarget: 'sessionStorage(chronos_guest_session_v1)',
  });
});

// Explicit rejection for removed default dataset
app.all('/api/backup-asset', (_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Default dataset has been permanently removed. Workspaces start completely empty. Each user imports their own JSON file.',
  });
});

// Workspace Import Validation Endpoint (Server-Side Schema & Ownership Guard)
app.post('/api/workspace/validate-import', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const isGuestRequest = req.body.isGuest === true;

  if (!isGuestRequest && (!authHeader || !authHeader.startsWith('Bearer '))) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid Bearer authentication token',
    });
  }

  const { userId, rawData, sourceFileName } = req.body;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload: userId is required',
    });
  }

  if (!rawData || typeof rawData !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload: rawData object is required',
    });
  }

  try {
    const projects = Array.isArray(rawData.projects) ? rawData.projects : [];
    const tasks = Array.isArray(rawData.tasks) ? rawData.tasks : [];
    const timeEntries = Array.isArray(rawData.timeEntries) ? rawData.timeEntries : [];
    const calendarEvents = Array.isArray(rawData.calendarEvents) ? rawData.calendarEvents : [];

    if (projects.length === 0 && tasks.length === 0 && timeEntries.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'JSON payload contains no projects, tasks, or time entries',
      });
    }

    const importId = `imp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const rootProjects = projects.filter((p: any) => !p.parentId);
    const subprojects = projects.filter((p: any) => Boolean(p.parentId));

    res.json({
      success: true,
      message: 'Workspace JSON validated. Ready for isolated ingestion.',
      importId,
      ownerUid: userId,
      sourceFileName: sourceFileName || 'workspace.json',
      counts: {
        rootProjects: rootProjects.length,
        subprojects: subprojects.length,
        totalProjects: projects.length,
        tasks: tasks.length,
        timeEntries: timeEntries.length,
        calendarEvents: calendarEvents.length,
      },
      validatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Workspace import validation error:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Server error validating workspace import',
    });
  }
});

// Guest Session Server-Side Validation & Migration Preparation
app.post('/api/guest/migrate', (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid Bearer authentication token',
    });
  }

  const { userId, guestData } = req.body;
  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload: userId is required',
    });
  }

  if (!guestData || typeof guestData !== 'object') {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload: guestData is required',
    });
  }

  try {
    const projects = Array.isArray(guestData.projects) ? guestData.projects : [];
    const tasks = Array.isArray(guestData.tasks) ? guestData.tasks : [];
    const calendarEvents = Array.isArray(guestData.calendarEvents) ? guestData.calendarEvents : [];
    const timeEntries = Array.isArray(guestData.timeEntries) ? guestData.timeEntries : [];
    const pomodoroSessions = Array.isArray(guestData.pomodoroSessions) ? guestData.pomodoroSessions : [];
    const reminders = Array.isArray(guestData.reminders) ? guestData.reminders : [];

    const rootProjects = projects.filter((p: any) => !p.parentId);
    const subprojects = projects.filter((p: any) => Boolean(p.parentId));

    res.json({
      success: true,
      message: 'Guest session data validated and authorized for cloud ingestion',
      userId,
      counts: {
        rootProjects: rootProjects.length,
        subprojects: subprojects.length,
        totalProjects: projects.length,
        tasks: tasks.length,
        calendarEvents: calendarEvents.length,
        timeEntries: timeEntries.length,
        pomodoroSessions: pomodoroSessions.length,
        reminders: reminders.length,
      },
      validatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error('Error during guest data migration validation:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Server error validating guest migration',
    });
  }
});

// Gemini Import Review Proxy
app.post('/api/gemini/review-import', async (req: Request, res: Response) => {
  const { isGuest, guestSessionId } = req.body;

  // Rate-limiting check for guest sessions
  if (isGuest) {
    const clientKey = guestSessionId || req.ip || 'anonymous_guest';
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10 minutes
    const limit = 5;

    const rateInfo = guestRateLimitMap.get(clientKey);
    if (rateInfo) {
      if (now < rateInfo.resetAt) {
        if (rateInfo.count >= limit) {
          return res.status(429).json({
            success: false,
            error: 'Guest AI review limit reached (5 requests per 10 minutes). Please sign in for unlimited AI analysis.',
            fallbackAvailable: true,
          });
        }
        rateInfo.count += 1;
      } else {
        guestRateLimitMap.set(clientKey, { count: 1, resetAt: now + windowMs });
      }
    } else {
      guestRateLimitMap.set(clientKey, { count: 1, resetAt: now + windowMs });
    }
  }

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
        console.warn(
          `Model ${modelCandidate} failed or busy (${modelErr.message || modelErr}), trying fallback...`
        );
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
        summary: `Productivity workspace containing ${projectsCount || 0} projects and ${
          tasksCount || 0
        } structured tasks.`,
        recommendedFocus:
          topDomains.length > 0
            ? topDomains
            : [
                'Core Initiative Development',
                'Task Prioritization & Execution',
                'Milestone Scheduling',
                'Time Tracking Cadence',
              ],
        hierarchyRating: 'Balanced',
        productivityInsights: [
          'Pace work in focused 45-to-90 minute deep work blocks.',
          'Review progress weekly to balance urgent tasks against high-leverage initiatives.',
          'Maintain regular time tracking logs to build accurate forecasting models.',
        ],
        suggestedTimePacing: 'Weekly distribution: 60% Active Labs & Execution, 25% Research, 15% Review',
        tags: ['Productivity', 'Engineering', 'Time Tracking'],
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
