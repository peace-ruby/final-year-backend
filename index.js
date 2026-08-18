import express from 'express';
import cors from 'cors';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import chatRouter from './chat.js';

dotenv.config();

const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const USERS_FILE = path.join(process.cwd(), 'users.json');

const app = express();
app.use(express.json());
app.use(cors())

app.use('/api/chat', chatRouter);

const User = {
  async readUsers() {
    try {
      const data = await fs.readFile(USERS_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        await fs.writeFile(USERS_FILE, '[]');
        return [];
      }
      throw error;
    }
  },
  async findOne(query) {
    const users = await this.readUsers();
    if (query.email) return users.find(u => u.email === query.email);
    if (query.id) return users.find(u => u.id === query.id);
    return null;
  },
  async create(userData) {
    const users = await this.readUsers();
    const newUser = {
      ...userData,
      createdAt: new Date().toISOString(),
      privacyAccepted: false
    };
    users.push(newUser);
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    return newUser;
  },
  async update(id, updates) {
    const users = await this.readUsers();
    const userIndex = users.findIndex(u => u.id === id);
    if (userIndex === -1) return null;
    users[userIndex] = { ...users[userIndex], ...updates };
    await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
    return users[userIndex];
  }
};

const signToken = (user) => {
  return jwt.sign({ id: user.id, email: user.email, name: user.name }, JWT_SECRET, {
    expiresIn: '7d',
  });
};

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Missing auth token.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

app.get("/ping",(req, res)=>{
  res.status(201).json({message:"pinged"})
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;
  const normalizedName = name?.trim();
  const normalizedEmail = email?.toLowerCase().trim();

  if (!normalizedName || !normalizedEmail || !password) {
    return res.status(400).json({ message: 'Name, email, and password are required.' });
  }

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(409).json({ message: 'A user with that email already exists.' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = await User.create({
    id: crypto.randomUUID(),
    name: normalizedName,
    email: normalizedEmail,
    password: hashedPassword,
  });

  const token = signToken(user);
  res.status(201).json({ token, user: { id: user.id, name: user.name, email: user.email, privacyAccepted: user.privacyAccepted } });
});

app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  const normalizedEmail = email?.toLowerCase().trim();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const isValidPassword = await bcrypt.compare(password, user.password);
  if (!isValidPassword) {
    return res.status(401).json({ message: 'Invalid credentials.' });
  }

  const token = signToken(user);
  res.json({ token, user: { id: user.id, name: user.name, email: user.email, privacyAccepted: user.privacyAccepted } });
});

app.get('/api/auth/me', authenticate, async (req, res) => {
  const user = await User.findOne({ id: req.user.id });
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }

  res.json({ user: { id: user.id, name: user.name, email: user.email, privacyAccepted: user.privacyAccepted } });
});

app.post('/api/auth/accept-privacy', authenticate, async (req, res) => {
  const user = await User.update(req.user.id, { privacyAccepted: true });
  if (!user) {
    return res.status(404).json({ message: 'User not found.' });
  }
  res.json({ message: 'Privacy policy accepted.', user: { id: user.id, name: user.name, email: user.email, privacyAccepted: user.privacyAccepted } });
});

app.listen(PORT, () => {
  console.log(`Auth server listening on http://localhost:${PORT} (Using JSON storage)`);
});