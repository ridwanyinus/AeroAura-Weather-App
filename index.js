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
  const location = req.query.location || req.session.location;
  req.session.location = location;

  const day = req.session.dailyId;

  try {
    const result = await axios.get('http://api.weatherapi.com/v1/forecast.json', {
      params: {
        key: WEATHER_API_KEY,
        q: location,
        days: 3, // Forecast for 3 days
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
    if (error.response) {
      // Axios received a response with an error status code (e.g., 400, 404, etc.)
      console.log('Error response data:', error.response.data);
      console.log('Error response status:', error.response.status);
      console.log('Error response headers:', error.response.headers);

      // res.status(error.response.status).send(error.response.data);
    } else if (error.request) {
      // Request was made but no response was received
      console.error('No response received:', error.request);
      res.status(503).send('Service Unavailable');
    }
    if (error.response && error.response.status === 400 && error.response.data.error.code === 1006) {
      res.render('not-found');
    } else {
      console.error('Error fetching weather data:', error.message);
      res.status(500).send('Internal Server Error');
    }
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

    function checkUv(uv) {
      if (uv <= 2) {
        return 'Low';
      } else if (uv <= 5) {
        return 'Moderate ';
      } else if (uv <= 7) {
        return 'High ';
      } else if (uv <= 10) {
        return 'Very High ';
      } else {
        return 'Extreme ';
      }
    }

    const uvIndex = weatherThree.day.uv;
    const uvRiskLevel = checkUv(uvIndex);
    console.log(uvRiskLevel);

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
    if (error.response && error.response.status === 400 && error.response.data.error.code === 1006) {
      res.render('not-found');
    } else {
      console.error('Error fetching weather data:', error.message);
      res.status(500).send('Internal Server Error');
    }
  }
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
