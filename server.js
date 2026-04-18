const express    = require('express');
const http       = require('http');
const session    = require('express-session');
const { Server } = require('socket.io');
const path       = require('path');

const authRoutes   = require('./routes/auth');
const portalRoutes = require('./routes/portals');
const jobRoutes    = require('./routes/jobs');
const adminRoutes  = require('./routes/admin');
const userRoutes   = require('./routes/user');
const { runScraper } = require('./results/scraper-engine');
const { jobQueries, portalQueries, userQueries, seedKIETPortal } = require('./db/database');
const bcrypt = require('bcryptjs');

const app    = express();
const server = http.createServer(app);

// ─── Session config ───
const sessionMiddleware = session({
  secret: 'results-automation-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
});

app.use(sessionMiddleware);
app.use(express.json({ limit: '5mb' }));

// ─── API Routes ───
app.use('/api/auth', authRoutes);
app.use('/api/portals', portalRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/user', userRoutes);

// ─── Static Files ───
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(path.join(__dirname, 'output')));

// ─── SPA fallback: serve index.html for all non-API routes ───
app.use((req, res, next) => {
  if (!req.path.startsWith('/api/')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    next();
  }
});

// ─── Socket.IO with session sharing ───
const io = new Server(server, { cors: { origin: '*' } });

io.use((socket, next) => {
  sessionMiddleware(socket.request, {}, next);
});

// Active jobs map: jobId -> jobState
const activeJobs = new Map();

io.on('connection', (socket) => {
  // Read session at connection time for logging
  let userId = socket.request.session?.userId;
  console.log(`🔌 Client connected: ${socket.id} (user: ${userId || 'anon'})`);

  if (userId) {
    socket.join(`user:${userId}`);
  }

  // ─── job:auth — just acknowledge (no session needed anymore) ───
  socket.on('job:auth', () => {
    socket.emit('job:auth-ok', { ok: true });
    console.log(`🔑 Socket ${socket.id} auth acknowledged`);
  });

  // ─── Start scraping job ───
  socket.on('job:start', async (data) => {
    const { jobId } = data;
    if (!jobId) {
      socket.emit('job:error', 'Job ID is required.');
      return;
    }

    if (activeJobs.has(jobId)) {
      socket.emit('job:error', 'This job is already running.');
      return;
    }

    // Load job from DB — trust job.user_id (job was created via authenticated HTTP)
    const job = jobQueries.findById.get(jobId);
    if (!job) {
      socket.emit('job:error', 'Job not found.');
      return;
    }

    const userId = job.user_id;
    socket.join(`user:${userId}`);
    console.log(`🚀 Starting job ${jobId} for user ${userId}`);

    const students = JSON.parse(job.students_input || '[]');
    const portal = portalQueries.findById.get(job.portal_id, userId);
    if (!portal) {
      socket.emit('job:error', 'Portal not found.');
      return;
    }

    // Mark as active with pause control
    const pauseControl = { paused: false };
    activeJobs.set(jobId, { startTime: Date.now(), results: [], logs: [], pauseControl });

    const room = `user:${userId}`;

    // Emit only to this socket (prevents duplicates from room + direct)
    const emitToClient = (event, payload) => {
      socket.emit(event, payload);
    };

    emitToClient('job:started', {
      jobId,
      total: students.length,
      headless: job.headless === 1,
    });

    let passCount = 0, backlogCount = 0, errorCount = 0, mismatchCount = 0;

    try {
      await runScraper({
        portal: {
          loginUrl: portal.login_url,
          marksheetUrl: portal.marksheet_url,
          logoutUrl: portal.logout_url,
          defaultPassword: portal.default_password || null,
          selectors: {
            username: portal.username_selector,
            password: portal.password_selector,
            submit: portal.submit_selector,
          }
        },
        students,
        headless: job.headless === 1,
        pauseControl,

        onProgress: (progressData) => {
          emitToClient('job:progress', { jobId, ...progressData });
        },

        onStudentDone: (result, index) => {
          if (result.status === 'SUCCESS' && result.backlogs.length === 0) passCount++;
          else if (result.status === 'SUCCESS' && result.backlogs.length > 0) backlogCount++;
          else if (result.status === 'CREDENTIAL_MISMATCH') mismatchCount++;
          else errorCount++;

          const lite = {
            rollNo: result.rollNo,
            name: result.name,
            status: result.status,
            sgpa: result.sgpa,
            cgpa: result.cgpa,
            percentage: result.percentage,
            totalCredits: result.totalCredits,
            backlogCount: result.backlogs ? result.backlogs.length : 0,
            passedCount: result.passed ? result.passed.length : 0,
            error: result.error,
            index,
          };

          const jobState = activeJobs.get(jobId);
          if (jobState) jobState.results.push(lite);

          emitToClient('job:student-done', { jobId, ...lite });

          // Update DB progress
          jobQueries.updateProgress.run(
            index + 1, passCount, backlogCount, errorCount, mismatchCount, jobId
          );
        },

        onLog: (msg) => {
          const logEntry = { time: new Date().toISOString(), message: msg };
          const jobState = activeJobs.get(jobId);
          if (jobState) jobState.logs.push(logEntry);
          emitToClient('job:log', { jobId, ...logEntry });
        },

        onComplete: (summary) => {
          jobQueries.complete.run(
            summary.total,
            summary.fullPass,
            summary.backlogs,
            summary.errors,
            summary.mismatch,
            JSON.stringify(summary.results.map(r => ({
              rollNo: r.rollNo, name: r.name, status: r.status,
              sgpa: r.sgpa, cgpa: r.cgpa, percentage: r.percentage,
              totalCredits: r.totalCredits,
              backlogCount: r.backlogs ? r.backlogs.length : 0,
              backlogs: r.backlogs || [],
              passed: r.passed || [],
              error: r.error,
            }))),
            summary.excelPath || '',
            summary.elapsed,
            jobId
          );

          emitToClient('job:complete', {
            jobId,
            total: summary.total,
            success: summary.success,
            fullPass: summary.fullPass,
            backlogs: summary.backlogs,
            mismatch: summary.mismatch,
            errors: summary.errors,
            elapsed: summary.elapsed,
            excelFile: summary.excelPath ? path.basename(summary.excelPath) : null,
          });

          activeJobs.delete(jobId);
          console.log(`✅ Job ${jobId} complete`);
        },
      });
    } catch (err) {
      console.error(`❌ Job ${jobId} failed:`, err);
      jobQueries.fail.run(
        `${Math.round((Date.now() - activeJobs.get(jobId)?.startTime || 0) / 1000)}s`,
        jobId
      );
      emitToClient('job:error', { jobId, message: err.message });
      activeJobs.delete(jobId);
    }
  });

  // ─── Get active job status ───
  socket.on('job:status', (data) => {
    const { jobId } = data;
    const jobState = activeJobs.get(jobId);
    if (jobState) {
      socket.emit('job:status', {
        jobId,
        running: true,
        results: jobState.results,
        logs: jobState.logs.slice(-50),
      });
    } else {
      socket.emit('job:status', { jobId, running: false });
    }
  });

  // ─── Pause/Resume job ───
  socket.on('job:pause', (data) => {
    const { jobId } = data;
    const jobState = activeJobs.get(jobId);
    if (jobState && jobState.pauseControl) {
      jobState.pauseControl.paused = true;
      console.log(`⏸ Job ${jobId} paused`);
      socket.emit('job:paused', { jobId });
    }
  });

  socket.on('job:resume', (data) => {
    const { jobId } = data;
    const jobState = activeJobs.get(jobId);
    if (jobState && jobState.pauseControl) {
      jobState.pauseControl.paused = false;
      console.log(`▶ Job ${jobId} resumed`);
      socket.emit('job:resumed', { jobId });
    }
  });

  // ─── Reconnect to running job (push cached results/logs) ───
  socket.on('job:reconnect', (data) => {
    const { jobId } = data;
    const jobState = activeJobs.get(jobId);
    if (jobState) {
      socket.emit('job:reconnect-data', {
        jobId,
        running: true,
        paused: jobState.pauseControl?.paused || false,
        results: jobState.results,
        logs: jobState.logs.slice(-100),
      });
    } else {
      socket.emit('job:reconnect-data', { jobId, running: false });
    }
  });

  socket.on('disconnect', () => {
    console.log(`🔌 Client disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   🎓 RAW (Results Automation Website)           ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log(`║   🌐 http://localhost:${PORT}                      ║`);
  console.log('║   🔐 Login / Signup enabled                     ║');
  console.log('║   📊 Multi-college portal support               ║');
  console.log('║   📂 Excel export on completion                 ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // ─── Seed Admin User ───
  (async () => {
    try {
      const adminEmail = 'yvsns7035@gmail.com';
      const existing = userQueries.findByEmail.get(adminEmail);
      if (!existing) {
        const hash = await bcrypt.hash('@Chirutha7035', 10);
        const result = userQueries.create.run('Admin', adminEmail, hash, 'admin');
        console.log(`✅ Admin user seeded: ${adminEmail}`);
        seedKIETPortal(result.lastInsertRowid);
      } else if (existing.role !== 'admin') {
        // Ensure existing user has admin role if they were created before
        const db = require('./db/database').db;
        db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(adminEmail);
        console.log(`✅ Admin role granted to: ${adminEmail}`);
      }
    } catch (err) {
      console.error('❌ Admin seeding failed:', err);
    }
  })();
});
