import { Hono } from 'hono';
import { healthRoute } from './routes/health';

export const app = new Hono();

app.route('/health', healthRoute);
