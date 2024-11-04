import axios from 'axios';
import express from 'express';
import bodyParser from 'body-parser';
import session from 'express-session';
import dotenv from 'dotenv';
import { createClient } from 'redis';
import RedisStore from 'connect-redis';

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;
const API_URL = 'http://api.weatherapi.com/v1/forecast.json';

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');

const client = createClient({
  url: process.env.REDIS_URL,
});

client.on('error', (err) => {
  console.log('Could not establish a connection with Redis. ' + err);
});

client.on('connect', () => {
  console.log('Connected to Redis successfully');
});

await client.connect();

app.use(
  session({
    store: new RedisStore({ client: client }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'strict',
    },
  }),
);

const WEATHER_API_KEY = process.env.WEATHER_API_KEY;

// Route to render the main page and handle geolocation requests

app.get('/', async (req, res) => {
  res.render('index');
});

app.post('/search/', (req, res) => {
  const coords = req.body.search;
  req.session.location = coords;
  res.redirect(`/search-results?location=${encodeURIComponent(coords)}`);
});

const now = new Date();
const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: 'numeric', hour12: true });

app.get('/search-results', async (req, res) => {
  const location = req.query.location;
  req.session.location = location;
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
  req.session.dailyId = dailyId;
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
