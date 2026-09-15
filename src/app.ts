import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { corsOrigins, env, isProd } from './config/env.js';
import { authRouter } from './modules/auth/auth.routes.js';
import { membersRouter } from './modules/members/members.routes.js';
import { boothsRouter } from './modules/booths/booths.routes.js';
import { homeRouter } from './modules/home/home.routes.js';
import { activitiesRouter } from './modules/activities/activities.routes.js';
import { workRouter } from './modules/work/work.routes.js';
import { tasksRouter } from './modules/tasks/tasks.routes.js';
import { meetingsRouter } from './modules/meetings/meetings.routes.js';
import { verificationRouter } from './modules/verification/verification.routes.js';
import { consentsRouter } from './modules/consents/consents.routes.js';
import { geoRouter } from './modules/geo/geo.routes.js';
import { postsRouter } from './modules/posts/posts.routes.js';
import { eventsRouter } from './modules/events/events.routes.js';
import { engagementRouter } from './modules/engagement/engagement.routes.js';
import { activityEventsRouter } from './modules/activity-events/activity-events.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';
import { leaderboardRouter } from './modules/leaderboard/leaderboard.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { mediaPublicUrl } from './lib/storage.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(
    cors({
      origin: isProd ? corsOrigins : true,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(isProd ? 'combined' : 'dev'));
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 400,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
    }),
  );

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      service: env.APP_NAME,
      env: env.NODE_ENV,
      time: new Date().toISOString(),
    });
  });

  const api = express.Router();
  api.use('/auth', authRouter);
  api.use('/members', membersRouter);
  api.use('/booths', boothsRouter);
  api.use('/home', homeRouter);
  api.use('/activities', activitiesRouter);
  api.use('/work', workRouter);
  api.use('/tasks', tasksRouter);
  api.use('/meetings', meetingsRouter);
  api.use('/verification', verificationRouter);
  api.use('/consents', consentsRouter);
  api.use('/geo', geoRouter);
  api.use('/posts', postsRouter);
  api.use('/events', eventsRouter);
  api.use('/engagement', engagementRouter);
  api.use('/activity-events', activityEventsRouter);
  api.use('/admin', adminRouter);
  api.use('/leaderboard', leaderboardRouter);
  api.use('/notifications', notificationsRouter);
  api.get('/media/stream/:id', (req, res) => {
    res.redirect(302, mediaPublicUrl(`stream/${req.params.id}`));
  });
  api.get('/media/:kind/:id/:file', (req, res) => {
    res.redirect(302, mediaPublicUrl(`${req.params.kind}/${req.params.id}/${req.params.file}`));
  });

  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
