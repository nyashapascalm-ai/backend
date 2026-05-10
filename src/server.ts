import express from 'express';
import cors from 'cors';
import productsRouter from './routes/products.ts';
import authRouter from './routes/auth.ts';
import contentRouter from './routes/content.ts';
import trackRouter from './routes/track.ts';
import dashboardRouter from './routes/dashboard.ts';
import alertsRouter from './routes/alerts.ts';
import importRouter from './routes/import.ts';
import reportsRouter from './routes/reports.ts';
import awinRouter from './routes/awin.ts';
import wordpressRouter from './routes/wordpress.ts';
import pinterestRouter from './routes/pinterest.ts';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/debug-env', (req, res) => {
  res.json({
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    hasDbUrl: !!process.env.DATABASE_URL,
    hasResendKey: !!process.env.RESEND_API_KEY,
    hasAwinToken: !!process.env.AWIN_API_TOKEN,
    hasPinterestToken: !!process.env.PINTEREST_TOKEN,
    nodeEnv: process.env.NODE_ENV,
  });
});

app.use('/products', productsRouter);
app.use('/auth', authRouter);
app.use('/content', contentRouter);
app.use('/track', trackRouter);
app.use('/dashboard', dashboardRouter);
app.use('/alerts', alertsRouter);
app.use('/import', importRouter);
app.use('/reports', reportsRouter);
app.use('/awin', awinRouter);
app.use('/wordpress', wordpressRouter);
app.use('/pinterest', pinterestRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});