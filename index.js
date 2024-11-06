import axios from 'axios';
import express from 'express';
import RedisStore from 'connect-redis';
import session from 'express-session';
import { createClient } from 'redis';
import dotenv from 'dotenv';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const WEATHER_API_KEY = 'd15046a04b314a7386484452242209';

app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
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
  prefix: 'aeroaura-w:',
});

app.use(
  session({
    store: redisStore,
    secret: process.env.SESSION_SECRET || 'keyboard cat',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: 'strict',
      maxAge: 1000 * 60 * 60 * 24,
    },
  }),
);

app.get('/', (req, res) => res.render('index'));

app.post('/search/', (req, res) => {
  const coords = req.body.search;
  if (coords) {
    req.session.location = coords;
  }
  res.redirect(`/search-results?location=${encodeURIComponent(coords)}`);

  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
    }
  });
});

app.get('/search-results', async (req, res) => {
  const location = req.query.location || req.session.location;
  req.session.location = location;

  const day = req.session.dailyId;
  const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
  try {
    const result = await axios.get('http://api.weatherapi.com/v1/forecast.json', {
      params: {
        key: WEATHER_API_KEY,
        q: location,
        days: 3,
      },
    });

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
    handleWeatherError(error, res);
  }
});

app.get('/search-daily/:id', async (req, res) => {
  const dailyId = req.params.id;
  if (dailyId) {
    req.session.dailyId = dailyId;
  }
  const location = req.session.location;
  if (dailyId == 0) {
    return res.redirect(`/search-results?location=${encodeURIComponent(req.session.location)}`);
  }

  try {
    const result = await axios.get('http://api.weatherapi.com/v1/forecast.json', {
      params: {
        key: WEATHER_API_KEY,
        q: location,
        days: 3, // Forecast for 3 days
      },
    });
    const daily = result.data.forecast.forecastday;
    const weatherThree = daily[dailyId];
    const uvRiskLevel = checkUv(weatherThree.day.uv);
    const time = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
    const sunrise = dailyId !== undefined ? daily[dailyId].astro.sunrise.slice(0, 5) : daily[0].astro.sunrise.slice(0, 5);
    const sunriseUnit = daily[0].astro.sunrise.slice(-2);
    const sunset = dailyId !== undefined ? daily[dailyId].astro.sunset.slice(0, 5) : daily[0].astro.sunset.slice(0, 5);
    const sunsetUnit = daily[0].astro.sunset.slice(-2);
    const currentHour = new Date().getHours();

    const sortedForecast = daily[0].hour.filter((forecast) => new Date(forecast.time).getHours() >= currentHour).sort((a, b) => new Date(a.time) - new Date(b.time));

    const forecast =
      dailyId !== undefined ? daily[dailyId].hour.filter((forecast) => new Date(forecast.time).getHours() >= currentHour).sort((a, b) => new Date(a.time) - new Date(b.time)) : sortedForecast;

    const date = formatDate(new Date());
    const dailyDate = dailyId !== undefined ? formatDate(new Date(daily[dailyId].date), false) : date;

    res.render('weather-3days', {
      forecast: result.data,
      sunrise,
      sunriseUnit,
      sunset,
      sunsetUnit,
      date: dailyDate,
      time,
      sortedForecast: forecast,
      formatHour,
      daily,
      formatDay,
      weatherThree,
      uvRiskLevel,
    });
  } catch (error) {
    handleWeatherError(error, res);
  }
});

app.get('/about', (req, res) => res.render('about'));

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

// Utility functions
function formatDate(date, includeDay = true) {
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return includeDay ? `${daysOfWeek[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}` : `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function formatHour(hourlyTime) {
  return new Date(hourlyTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });
}

function formatDay(dateString) {
  const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return daysOfWeek[new Date(dateString).getDay()];
}

function checkUv(uv) {
  if (uv <= 2) return 'Low';
  if (uv <= 5) return 'Moderate';
  if (uv <= 7) return 'High';
  if (uv <= 10) return 'Very High';
  return 'Extreme';
}

function handleWeatherError(error, res) {
  if (error.response && error.response.status === 400 && error.response.data.error.code === 1006) {
    res.render('not-found');
  } else if (error.request) {
    console.error('No response received:', error.request);
    res.status(503).send('Service Unavailable');
  } else {
    console.error('Error fetching weather data:', error.message);
    res.status(500).send('Internal Server Error');
  }
}
