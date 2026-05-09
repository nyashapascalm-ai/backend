import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import productsRouter from './routes/products.ts';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Root route
app.get('/', (req, res) => {
  res.send('API is running');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Products routes
app.use('/products', productsRouter);

app.listen(3000, () => {
  console.log('API running on http://localhost:3000');
});
