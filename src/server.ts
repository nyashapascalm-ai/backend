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
import imagesRouter from './routes/images.ts';
import subscribersRouter from './routes/subscribers.ts';
import sponsoredRouter from './routes/sponsored.ts';
import refreshRouter from './routes/refresh.ts';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.send('API is running');
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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
app.use('/images', imagesRouter);
app.use('/', subscribersRouter);
app.use('/', sponsoredRouter);
app.use('/', refreshRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});