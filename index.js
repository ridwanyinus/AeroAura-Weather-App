import axios from 'axios';
import express from 'express';
import bodyParser from 'body-parser';
import RedisStore from 'connect-redis';
import session from 'express-session';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const API_URL = 'http://api.weatherapi.com/v1/forecast.json';

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');

const WEATHER_API_KEY = process.env.WEATHER_API_KEY || 'd15046a04b314a7386484452242209';
const REDIS_TOKEN = process.env.REDIS_TOKEN;
const REDIS_URL = process.env.REDIS_URL;
const REDIS_PORT = process.env.REDIS_PORT || 6379;

const isProd = process.env.NODE_ENV === 'production';

if (isProd) {
  dotenv.config();
}

// Initialize client.
let redisClient = createClient({
  password: REDIS_TOKEN,
  socket: {
    host: REDIS_URL,
    port: REDIS_PORT,
  },
});

await redisClient.connect().catch(console.error);

// Initialize store.
let redisStore = new RedisStore({
  client: redisClient,
  prefix: 'aeroaura:',
});

app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: true,
    cookie: {
      secure: isProd,
      httpOnly: true,
      sameSite: isProd ? 'none' : 'lax',
    },
    rolling: true,
  }),
);

app.get('/', async (req, res) => {
  res.render('index');
});

app.post('/search/', (req, res) => {
  const coords = req.body.search;
  if (coords) {
    req.session.location = coords;
  }
  res.redirect(`/search-results?location=${encodeURIComponent(coords)}`);
});

const now = new Date();
const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });

app.get('/search-results', async (req, res) => {
  const location = req.query.location;
  if (location) {
    req.session.location = location;
  }
  const day = req.session.dailyId;
  try {
    const result = await axios.get(`${API_URL}?key=${WEATHER_API_KEY}&q=${location}&days=3`);
    const daily = result.data.forecast.forecastday;
    const sunrise = day !== undefined ? daily[day].astro.sunrise.slice(0, 5) : daily[0].astro.sunrise.slice(0, 5);
    const sunriseUnit = daily[0].astro.sunrise.slice(-2);
    const sunset = day !== undefined ? daily[day].astro.sunset.slice(0, 5) : daily[0].astro.sunset.slice(0, 5);
    const sunsetUnit = daily[0].astro.sunset.slice(-2);
    const currentHour = now.getHours();
    const sortedForecast = daily[0].hour.filter((forecast) => new Date(forecast.time).getHours() >= currentHour).sort((a, b) => new Date(a.time) - new Date(b.time));

    const forecast = day !== undefined ? daily[day].hour.filter((forecast) => new Date(forecast.time).getHours() >= currentHour).sort((a, b) => new Date(a.time) - new Date(b.time)) : sortedForecast;

    const date = formatDate(new Date());
    const dailyDate = day !== undefined ? formatDate(new Date(daily[day].date), false) : date;

    res.render('search', { forecast: result.data, sunrise, sunriseUnit, sunset, sunsetUnit, date: dailyDate, time, sortedForecast: forecast, formatHour, daily, formatDay });
  } catch (error) {
    console.error('Error fetching weather data:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/search-daily/:id', async (req, res) => {
  const dailyId = req.params.id;
  if (dailyId) {
    req.session.dailyId = dailyId;
  }
  res.redirect(`/search-results?location=${encodeURIComponent(req.session.location)}`);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

function formatDate(date, includeDay = true) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthIndex = date.getMonth();
  const day = date.getDate();
  const year = date.getFullYear();

  if (includeDay) {
    const currentDay = daysOfWeek[now.getDay()];
    return `${currentDay}, ${day} ${months[monthIndex]} ${year}`;
  } else {
    return `${day} ${months[monthIndex]} ${year}`;
  }
}

function formatHour(hourlyTime) {
  const formatedHour = new Date(hourlyTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
  return formatedHour;
}

function formatDay(params) {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDay = daysOfWeek[new Date(params).getDay()];
  return currentDay;
}
