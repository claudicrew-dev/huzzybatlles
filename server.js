// ═══════════════════════════════════════════════════════════
// PAINHUB BATTLES — SERVER + BOT + TURSO DATABASE
// ═══════════════════════════════════════════════════════════

require('dotenv').config();
const express = require('express');
const { Telegraf } = require('telegraf');
const { createClient } = require('@libsql/client');
const crypto = require('crypto');
const path = require('path');
const cors = require('cors');

const app = express();
const bot = new Telegraf(process.env.BOT_TOKEN);

// Подключение к Turso
const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN
});

const ADMIN_ID = parseInt(process.env.ADMIN_ID);
const BOT_TOKEN = process.env.BOT_TOKEN;
const MAX_SCORE = 28;

// ═══════════════════════════════════════════════════════════
// КАНАЛЫ ДЛЯ ОБЯЗАТЕЛЬНОЙ ПОДПИСКИ
// ═══════════════════════════════════════════════════════════

const REQUIRED_CHANNELS = [
  { id: '@huzzywrld', name: 'HUZZYWRLD', url: 'https://t.me/huzzywrld' },
  { id: '@huzzybupdates', name: 'HUZZYB UPDATES', url: 'https://t.me/huzzybupdates' }
];

// ═══════════════════════════════════════════════════════════
// DATABASE SETUP
// ═══════════════════════════════════════════════════════════

async function initDatabase() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      username TEXT,
      avatar TEXT,
      score INTEGER DEFAULT 0,
      done INTEGER DEFAULT 0,
      test_at INTEGER,
      answers TEXT,
      avg_time REAL,
      achs TEXT DEFAULT '[]',
      is_admin INTEGER DEFAULT 0,
      is_banned INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS likes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER,
      to_id INTEGER,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000),
      UNIQUE(from_id, to_id)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_a INTEGER,
      user_b INTEGER,
      status TEXT DEFAULT 'pending',
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER,
      to_id INTEGER,
      text TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS reactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_id INTEGER,
      to_id INTEGER,
      reaction TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      message TEXT,
      is_read INTEGER DEFAULT 0,
      created_at INTEGER DEFAULT (strftime('%s','now') * 1000)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS question_stats (
      question_idx INTEGER PRIMARY KEY,
      total INTEGER DEFAULT 0,
      correct INTEGER DEFAULT 0
    )
  `);

  // Индексы
  try {
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_score ON users(score DESC)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_users_done ON users(done)`);
    await db.execute(`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)`);
  } catch (e) {}

  // Добавляем главного админа
  await db.execute({
    sql: `INSERT OR IGNORE INTO users (id, name, is_admin) VALUES (?, 'Admin', 1)`,
    args: [ADMIN_ID]
  });

  console.log('✅ Database initialized');
}

// ═══════════════════════════════════════════════════════════
// ФУНКЦИИ ПРОВЕРКИ ПОДПИСКИ
// ═══════════════════════════════════════════════════════════

async function checkSubscription(userId) {
  const results = [];
  
  for (const channel of REQUIRED_CHANNELS) {
    try {
      const member = await bot.telegram.getChatMember(channel.id, userId);
      const isSubscribed = ['member', 'administrator', 'creator'].includes(member.status);
      results.push({ ...channel, subscribed: isSubscribed });
    } catch (error) {
      console.error(`Error checking ${channel.id}:`, error.message);
      results.push({ ...channel, subscribed: false });
    }
  }
  
  return results;
}

function getSubscriptionKeyboard(subscriptionResults) {
  const buttons = [];
  
  for (const channel of subscriptionResults) {
    const emoji = channel.subscribed ? '✅' : '❌';
    buttons.push([{ text: `${emoji} ${channel.name}`, url: channel.url }]);
  }
  
  buttons.push([{ text: '🔄 Проверить подписку', callback_data: 'check_subscription' }]);
  
  return { inline_keyboard: buttons };
}

function getMainKeyboard() {
  return {
    inline_keyboard: [[
      { text: '🚀 Открыть приложение', web_app: { url: process.env.APP_URL } }
    ]]
  };
}

// ═══════════════════════════════════════════════════════════
// HELPERS (async версии)
// ═══════════════════════════════════════════════════════════

function validateTelegramData(initData) {
  if (!initData) return null;
  
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    
    const dataCheckString = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n');
    
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    
    if (calculatedHash === hash) {
      return JSON.parse(params.get('user') || '{}');
    }
  } catch (e) {
    console.error('Auth error:', e);
  }
  return null;
}

async function getUser(id) {
  const result = await db.execute({
    sql: 'SELECT * FROM users WHERE id = ?',
    args: [id]
  });
  return result.rows[0] || null;
}

async function saveUser(user) {
  const existing = await getUser(user.id);
  if (existing) {
    await db.execute({
      sql: `UPDATE users SET name=?, username=?, avatar=?, score=?, done=?, test_at=?, answers=?, avg_time=?, achs=?, is_admin=?, is_banned=? WHERE id=?`,
      args: [user.name, user.username, user.avatar, user.score, user.done, user.test_at, user.answers, user.avg_time, user.achs, user.is_admin, user.is_banned, user.id]
    });
  } else {
    await db.execute({
      sql: `INSERT INTO users (id, name, username, avatar, score, done, test_at, answers, avg_time, achs, is_admin, is_banned) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [user.id, user.name, user.username, user.avatar, user.score, user.done, user.test_at, user.answers, user.avg_time, user.achs, user.is_admin, user.is_banned]
    });
  }
}

async function getRank(userId) {
  const result = await db.execute({
    sql: `SELECT COUNT(*) + 1 as rank FROM users WHERE score > (SELECT score FROM users WHERE id = ?) AND done = 1 AND is_banned = 0`,
    args: [userId]
  });
  return result.rows[0]?.rank || null;
}

async function addNotification(userId, message) {
  await db.execute({
    sql: 'INSERT INTO notifications (user_id, message, created_at) VALUES (?, ?, ?)',
    args: [userId, message, Date.now()]
  });
  bot.telegram.sendMessage(userId, `🔔 ${message}`).catch(() => {});
}

async function isAdmin(userId) {
  const user = await getUser(userId);
  return user && user.is_admin === 1;
}

// ═══════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ═══════════════════════════════════════════════════════════
// TELEGRAM BOT
// ═══════════════════════════════════════════════════════════

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const subscriptionResults = await checkSubscription(userId);
  const allSubscribed = subscriptionResults.every(r => r.subscribed);
  
  if (allSubscribed) {
    await ctx.reply(
      `йоу, это бот фан паблика @huzzywrld\n\n` +
      `Приглашаем тебя пройти итоговый тест на знание артиста huzzyb и получить звание Ангела Пэинхаба! 🔥`,
      { reply_markup: getMainKeyboard() }
    );
  } else {
    await ctx.reply(
      `👋 Привет!\n\n` +
      `Для доступа к боту подпишись на каналы:\n\n` +
      `${subscriptionResults.map(r => `${r.subscribed ? '✅' : '❌'} ${r.name}`).join('\n')}\n\n` +
      `Подпишись и нажми "Проверить подписку" 👇`,
      { reply_markup: getSubscriptionKeyboard(subscriptionResults) }
    );
  }
});

bot.action('check_subscription', async (ctx) => {
  const userId = ctx.from.id;
  const subscriptionResults = await checkSubscription(userId);
  const allSubscribed = subscriptionResults.every(r => r.subscribed);
  
  if (allSubscribed) {
    await ctx.answerCbQuery('✅ Подписка подтверждена!');
    await ctx.editMessageText(
      `йоу, это бот фан паблика @huzzywrld\n\n` +
      `Приглашаем тебя пройти итоговый тест на знание артиста huzzyb и получить звание Ангела Пэинхаба! 🔥`,
      { reply_markup: getMainKeyboard() }
    );
  } else {
    const notSubscribed = subscriptionResults.filter(r => !r.subscribed);
    await ctx.answerCbQuery(`❌ Подпишись на: ${notSubscribed.map(r => r.name).join(', ')}`, { show_alert: true });
    await ctx.editMessageText(
      `👋 Привет!\n\n` +
      `Для доступа к боту подпишись на каналы:\n\n` +
      `${subscriptionResults.map(r => `${r.subscribed ? '✅' : '❌'} ${r.name}`).join('\n')}\n\n` +
      `Подпишись и нажми "Проверить подписку" 👇`,
      { reply_markup: getSubscriptionKeyboard(subscriptionResults) }
    );
  }
});

// ═══════════════════════════════════════════════════════════
// API ROUTES
// ═══════════════════════════════════════════════════════════

// AUTH
app.post('/api/auth', async (req, res) => {
  try {
    const { initData } = req.body;
    let tgUser = validateTelegramData(initData);
    
    if (!tgUser && req.body.devUser) {
      tgUser = req.body.devUser;
    }
    
    if (!tgUser || !tgUser.id) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    let user = await getUser(tgUser.id);
    
    if (!user) {
      user = {
        id: tgUser.id,
        name: tgUser.first_name || 'Аноним',
        username: tgUser.username || '',
        avatar: tgUser.photo_url || '',
        score: 0,
        done: 0,
        test_at: null,
        answers: null,
        avg_time: null,
        achs: '[]',
        is_admin: tgUser.id === ADMIN_ID ? 1 : 0,
        is_banned: 0
      };
      await saveUser(user);
    } else {
      user.name = tgUser.first_name || user.name;
      user.username = tgUser.username || user.username;
      if (tgUser.photo_url) user.avatar = tgUser.photo_url;
      if (tgUser.id === ADMIN_ID) user.is_admin = 1;
      await saveUser(user);
    }
    
    if (user.is_banned) {
      return res.status(403).json({ error: 'Banned' });
    }
    
    const rank = await getRank(user.id);
    const unreadResult = await db.execute({
      sql: 'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0',
      args: [user.id]
    });
    
    res.json({
      user: { ...user, rank, achs: JSON.parse(user.achs || '[]') },
      unread: unreadResult.rows[0]?.c || 0
    });
  } catch (error) {
    console.error('Auth error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// LEADERBOARD
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await db.execute(`
      SELECT id, name, username, avatar, score, achs, is_admin
      FROM users WHERE done = 1 AND is_banned = 0
      ORDER BY score DESC LIMIT 99
    `);
    
    res.json(result.rows.map((u, i) => ({
      ...u,
      rank: i + 1,
      achs: JSON.parse(u.achs || '[]')
    })));
  } catch (error) {
    console.error('Leaderboard error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// SEARCH USERS
app.get('/api/search', async (req, res) => {
  try {
    const q = req.query.q?.toLowerCase() || '';
    if (q.length < 2) return res.json([]);
    
    const result = await db.execute({
      sql: `SELECT id, name, username, avatar, score, done, achs FROM users WHERE is_banned = 0 AND (LOWER(name) LIKE ? OR LOWER(username) LIKE ?) LIMIT 10`,
      args: [`%${q}%`, `%${q}%`]
    });
    
    res.json(result.rows.map(u => ({ ...u, achs: JSON.parse(u.achs || '[]') })));
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET PROFILE
app.get('/api/profile/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    const viewerId = parseInt(req.query.viewer) || 0;
    
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'Not found' });
    
    const rank = await getRank(userId);
    
    const likesResult = await db.execute({
      sql: 'SELECT COUNT(*) as c FROM likes WHERE to_id = ?',
      args: [userId]
    });
    const likesCount = likesResult.rows[0]?.c || 0;
    
    let isLiked = false;
    let friendStatus = null;
    
    if (viewerId && viewerId !== userId) {
      const likeCheck = await db.execute({
        sql: 'SELECT 1 FROM likes WHERE from_id = ? AND to_id = ?',
        args: [viewerId, userId]
      });
      isLiked = likeCheck.rows.length > 0;
      
      const friendCheck = await db.execute({
        sql: `SELECT status FROM friends WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)`,
        args: [viewerId, userId, userId, viewerId]
      });
      friendStatus = friendCheck.rows[0]?.status || null;
    }
    
    const commentsResult = await db.execute({
      sql: `SELECT c.*, u.name as author_name, u.avatar as author_avatar FROM comments c JOIN users u ON c.from_id = u.id WHERE c.to_id = ? ORDER BY c.created_at DESC LIMIT 20`,
      args: [userId]
    });
    
    res.json({
      user: { ...user, rank, likesCount, achs: JSON.parse(user.achs || '[]') },
      isLiked,
      friendStatus,
      comments: commentsResult.rows
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// SUBMIT QUIZ
app.post('/api/quiz/submit', async (req, res) => {
  try {
    const { userId, score, correct, answers, avgTime, achs } = req.body;
    
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.done) return res.status(400).json({ error: 'Already completed' });
    if (user.is_banned) return res.status(403).json({ error: 'Banned' });
    
    user.done = 1;
    user.test_at = Date.now();
    user.score = score;
    user.answers = JSON.stringify(answers);
    user.avg_time = avgTime;
    user.achs = JSON.stringify(achs);
    await saveUser(user);
    
    // Update question stats
    for (const a of answers) {
      const existing = await db.execute({
        sql: 'SELECT * FROM question_stats WHERE question_idx = ?',
        args: [a.i]
      });
      
      if (existing.rows.length > 0) {
        await db.execute({
          sql: 'UPDATE question_stats SET total = total + 1, correct = correct + ? WHERE question_idx = ?',
          args: [a.ok ? 1 : 0, a.i]
        });
      } else {
        await db.execute({
          sql: 'INSERT INTO question_stats (question_idx, total, correct) VALUES (?, 1, ?)',
          args: [a.i, a.ok ? 1 : 0]
        });
      }
    }
    
    const rank = await getRank(userId);
    res.json({ success: true, rank });
  } catch (error) {
    console.error('Quiz submit error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// QUIT QUIZ
app.post('/api/quiz/quit', async (req, res) => {
  try {
    const { userId, answers } = req.body;
    
    const user = await getUser(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.done) return res.status(400).json({ error: 'Already completed' });
    
    user.done = 1;
    user.test_at = Date.now();
    user.score = 0;
    user.answers = JSON.stringify(answers || []);
    user.avg_time = 0;
    user.achs = '[]';
    await saveUser(user);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Quiz quit error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// LIKE
app.post('/api/like', async (req, res) => {
  try {
    const { fromId, toId } = req.body;
    if (fromId === toId) return res.status(400).json({ error: 'Cannot like yourself' });
    
    const existing = await db.execute({
      sql: 'SELECT 1 FROM likes WHERE from_id = ? AND to_id = ?',
      args: [fromId, toId]
    });
    
    if (existing.rows.length > 0) {
      await db.execute({
        sql: 'DELETE FROM likes WHERE from_id = ? AND to_id = ?',
        args: [fromId, toId]
      });
      res.json({ liked: false });
    } else {
      await db.execute({
        sql: 'INSERT INTO likes (from_id, to_id, created_at) VALUES (?, ?, ?)',
        args: [fromId, toId, Date.now()]
      });
      const fromUser = await getUser(fromId);
      await addNotification(toId, `❤️ ${fromUser?.name || 'Кто-то'} лайкнул тебя!`);
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// FRIEND REQUEST
app.post('/api/friend', async (req, res) => {
  try {
    const { fromId, toId } = req.body;
    if (fromId === toId) return res.status(400).json({ error: 'Cannot add yourself' });
    
    const existing = await db.execute({
      sql: `SELECT * FROM friends WHERE (user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?)`,
      args: [fromId, toId, toId, fromId]
    });
    
    if (existing.rows.length > 0) {
      const friend = existing.rows[0];
      if (friend.status === 'pending' && friend.user_b === fromId) {
        await db.execute({
          sql: 'UPDATE friends SET status = ? WHERE id = ?',
          args: ['accepted', friend.id]
        });
        const fromUser = await getUser(fromId);
        await addNotification(toId, `🤝 ${fromUser?.name} принял заявку в друзья!`);
        return res.json({ status: 'accepted' });
      }
      return res.json({ status: friend.status });
    }
    
    await db.execute({
      sql: 'INSERT INTO friends (user_a, user_b, status, created_at) VALUES (?, ?, ?, ?)',
      args: [fromId, toId, 'pending', Date.now()]
    });
    const fromUser = await getUser(fromId);
    await addNotification(toId, `👋 ${fromUser?.name} хочет добавить тебя в друзья!`);
    res.json({ status: 'pending' });
  } catch (error) {
    console.error('Friend error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ADD COMMENT
app.post('/api/comment', async (req, res) => {
  try {
    const { fromId, toId, text } = req.body;
    if (!text || text.length > 150) return res.status(400).json({ error: 'Invalid text' });
    
    const existing = await db.execute({
      sql: `SELECT 1 FROM comments WHERE from_id = ? AND to_id = ? AND date(created_at/1000, 'unixepoch') = date('now')`,
      args: [fromId, toId]
    });
    
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Daily limit reached' });
    
    await db.execute({
      sql: 'INSERT INTO comments (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)',
      args: [fromId, toId, text, Date.now()]
    });
    const fromUser = await getUser(fromId);
    await addNotification(toId, `💬 ${fromUser?.name} написал комментарий!`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ADD REACTION
app.post('/api/reaction', async (req, res) => {
  try {
    const { fromId, toId, reaction } = req.body;
    
    const existing = await db.execute({
      sql: 'SELECT id FROM reactions WHERE from_id = ? AND to_id = ?',
      args: [fromId, toId]
    });
    
    if (existing.rows.length > 0) {
      await db.execute({
        sql: 'UPDATE reactions SET reaction = ?, created_at = ? WHERE id = ?',
        args: [reaction, Date.now(), existing.rows[0].id]
      });
    } else {
      await db.execute({
        sql: 'INSERT INTO reactions (from_id, to_id, reaction, created_at) VALUES (?, ?, ?, ?)',
        args: [fromId, toId, reaction, Date.now()]
      });
    }
    
    const fromUser = await getUser(fromId);
    await addNotification(toId, `${reaction} ${fromUser?.name} отреагировал на твой результат!`);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Reaction error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET REACTIONS
app.get('/api/reactions/:userId', async (req, res) => {
  try {
    const result = await db.execute({
      sql: 'SELECT reaction, COUNT(*) as count FROM reactions WHERE to_id = ? GROUP BY reaction',
      args: [req.params.userId]
    });
    res.json(result.rows);
  } catch (error) {
    console.error('Reactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// NOTIFICATIONS
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const result = await db.execute({
      sql: `SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`,
      args: [req.params.userId]
    });
    res.json(result.rows);
  } catch (error) {
    console.error('Notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/notifications/read', async (req, res) => {
  try {
    const { userId } = req.body;
    await db.execute({
      sql: 'UPDATE notifications SET is_read = 1 WHERE user_id = ?',
      args: [userId]
    });
    res.json({ success: true });
  } catch (error) {
    console.error('Notifications read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GLOBAL STATS
app.get('/api/stats', async (req, res) => {
  try {
    const total = await db.execute('SELECT COUNT(*) as c FROM users WHERE is_banned = 0');
    const done = await db.execute('SELECT COUNT(*) as c FROM users WHERE done = 1 AND is_banned = 0');
    const avgScore = await db.execute('SELECT AVG(score) as a FROM users WHERE done = 1 AND is_banned = 0');
    const perfect = await db.execute({
      sql: 'SELECT COUNT(*) as c FROM users WHERE score = ? AND is_banned = 0',
      args: [MAX_SCORE]
    });
    
    res.json({
      total: total.rows[0]?.c || 0,
      done: done.rows[0]?.c || 0,
      avg: (avgScore.rows[0]?.a || 0).toFixed(1),
      perfect: perfect.rows[0]?.c || 0
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// QUESTION STATS
app.get('/api/stats/questions', async (req, res) => {
  try {
    const result = await db.execute('SELECT * FROM question_stats');
    const stats = {};
    result.rows.forEach(s => { stats[s.question_idx] = { total: s.total, correct: s.correct }; });
    res.json(stats);
  } catch (error) {
    console.error('Question stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// ADMIN API
// ═══════════════════════════════════════════════════════════

async function adminOnly(req, res, next) {
  const adminId = parseInt(req.body.adminId || req.query.adminId);
  if (!(await isAdmin(adminId))) {
    return res.status(403).json({ error: 'Not admin' });
  }
  next();
}

// Reset user test
app.post('/api/admin/reset-test', adminOnly, async (req, res) => {
  try {
    const { targetId } = req.body;
    const user = await getUser(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.done = 0;
    user.test_at = null;
    user.score = 0;
    user.answers = null;
    user.avg_time = null;
    user.achs = '[]';
    await saveUser(user);
    
    await addNotification(targetId, '🔄 Админ сбросил твой тест. Можешь пройти заново!');
    res.json({ success: true });
  } catch (error) {
    console.error('Reset test error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset user score
app.post('/api/admin/reset-score', adminOnly, async (req, res) => {
  try {
    const { targetId } = req.body;
    const user = await getUser(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.score = 0;
    await saveUser(user);
    res.json({ success: true });
  } catch (error) {
    console.error('Reset score error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Ban user
app.post('/api/admin/ban', adminOnly, async (req, res) => {
  try {
    const { targetId } = req.body;
    const user = await getUser(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.is_banned = 1;
    await saveUser(user);
    res.json({ success: true });
  } catch (error) {
    console.error('Ban error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Unban user
app.post('/api/admin/unban', adminOnly, async (req, res) => {
  try {
    const { targetId } = req.body;
    const user = await getUser(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.is_banned = 0;
    await saveUser(user);
    res.json({ success: true });
  } catch (error) {
    console.error('Unban error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Give admin
app.post('/api/admin/give-admin', adminOnly, async (req, res) => {
  try {
    const { targetId } = req.body;
    const user = await getUser(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.is_admin = 1;
    await saveUser(user);
    await addNotification(targetId, '👑 Тебе выданы права администратора!');
    res.json({ success: true });
  } catch (error) {
    console.error('Give admin error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Take admin
app.post('/api/admin/take-admin', adminOnly, async (req, res) => {
  try {
    const { targetId } = req.body;
    if (parseInt(targetId) === ADMIN_ID) {
      return res.status(400).json({ error: 'Cannot remove main admin' });
    }
    
    const user = await getUser(targetId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    
    user.is_admin = 0;
    await saveUser(user);
    res.json({ success: true });
  } catch (error) {
    console.error('Take admin error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Broadcast
app.post('/api/admin/broadcast', adminOnly, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'No message' });
    
    const users = await db.execute('SELECT id FROM users WHERE is_banned = 0');
    let sent = 0;
    
    for (const u of users.rows) {
      try {
        await bot.telegram.sendMessage(u.id, `📢 ${message}`);
        await db.execute({
          sql: 'INSERT INTO notifications (user_id, message, created_at) VALUES (?, ?, ?)',
          args: [u.id, `📢 ${message}`, Date.now()]
        });
        sent++;
      } catch (e) {}
    }
    
    res.json({ success: true, sent, total: users.rows.length });
  } catch (error) {
    console.error('Broadcast error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset all
app.post('/api/admin/reset-all', adminOnly, async (req, res) => {
  try {
    await db.execute('UPDATE users SET done = 0, test_at = NULL, score = 0, answers = NULL, avg_time = NULL, achs = "[]"');
    await db.execute('DELETE FROM question_stats');
    res.json({ success: true });
  } catch (error) {
    console.error('Reset all error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// ═══════════════════════════════════════════════════════════
// START SERVER
// ═══════════════════════════════════════════════════════════

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 3000;

// Инициализация и запуск
async function start() {
  try {
    console.log('1. Starting...');
    
    await initDatabase();
    
    console.log('2. Database OK, launching bot...');
    
    await bot.launch();
    
    console.log('🤖 Bot started');
    
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start:', error);
    process.exit(1);
  }
}

start();