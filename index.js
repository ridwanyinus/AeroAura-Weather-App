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
const WEATHER_API_KEY = 'd15046a04b314a7386484452242209';

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');

let redisClient = createClient({
  password: 'Db21ISWmwueTOAKzxH9YQa1BnlKi7lHf',
  socket: {
    host: 'redis-18790.c275.us-east-1-4.ec2.redns.redis-cloud.com',
    port: 18790,
  },
});

async function connectRedis() {
  try {
    await redisClient.connect();
    console.log('Connected to Redis successfully');
  } catch (error) {
    console.error('Failed to connect to Redis:', error);
  }
}
connectRedis();

redisClient.on('error', (err) => {
  console.log('Could not establish a connection with Redis. ' + err);
});

redisClient.on('connect', () => {
  console.log('Connected to Redis successfully!');
});

// Initialize Redis store
const redisStore = new RedisStore({
  client: redisClient,
  prefix: 'aeroaura:',
});

app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
    },
  }),
);

app.get('/', async (req, res) => {
  res.render('index');
});

app.post('/search/', (req, res) => {
  const coords = req.body.search;
  if (coords) {
    req.session.location = coords; // Save location to session
  }
  res.redirect(`/search-results?location=${encodeURIComponent(coords)}`);
});

const now = new Date();
const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });

app.get('/search-results', async (req, res) => {
  const location = req.query.location || req.session.location || 'auto:ip'; // Fallback to 'auto:ip'
  req.session.location = location; // Update session location if needed

  const day = req.session.dailyId;
  try {
    const result = await axios.get(`${API_URL}?key=${WEATHER_API_KEY}&q=${location}&days=3`);

    const daily = result.data.forecast.forecastday;
    const sunrise = day !== undefined ? daily[day].astro.sunrise.slice(0, 5) : daily[0].astro.sunrise.slice(0, 5);
    const sunriseUnit = daily[0].astro.sunrise.slice(-2);
    const sunset = day !== undefined ? daily[day].astro.sunset.slice(0, 5) : daily[0].astro.sunset.slice(0, 5);
    const sunsetUnit = daily[0].astro.sunset.slice(-2);
    const currentHour = new Date().getHours();

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

app.get('/search-daily/:id', (req, res) => {
  const dailyId = req.params.id;
  if (dailyId) {
    req.session.dailyId = dailyId; // Save daily ID in session
  }
  res.redirect(`/search-results?location=${encodeURIComponent(req.session.location || 'auto:ip')}`);
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
