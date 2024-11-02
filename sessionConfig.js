// sessionConfig.js
import session from 'express-session';
import RedisStore from 'connect-redis';
import Redis from 'ioredis';

// Initialize Redis client
const redisClient = new Redis(process.env.REDIS_URL); // Use your REDIS_URL from .env

// Configure session middleware
const sessionMiddleware = session({
  store: new RedisStore({
    client: redisClient,
    // Additional Redis options if needed
  }),
  secret: process.env.SESSION_SECRET || '@sjduudhu#bcugugfbufb2345!wertnkvn@ASNIN#@!', // Secret for signing cookies
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // Secure cookies in production
    httpOnly: true, // Prevent client-side access to cookies
    sameSite: 'lax', // CSRF protection
    maxAge: 1000 * 60 * 60 * 24, // Set session expiration (e.g., 24 hours)
  },
});

export default sessionMiddleware;
