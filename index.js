import axios from 'axios';
import express from 'express';
import bodyParser from 'body-parser';

const app = express();
const port = 3000;
const API_URL = 'http://api.weatherapi.com/v1/forecast.json';

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());
app.set('view engine', 'ejs');

// Sample city list for random fallback
const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix'];
const WEATHER_API_KEY = 'd15046a04b314a7386484452242209';
let location = 'auto:ip';

// Route to render the main page and handle geolocation requests

app.get('/', async (req, res) => {
  const result = await axios.get(`${API_URL}?key=${WEATHER_API_KEY}&q=${location}&days=3`);
  res.render('index', { forecast: result.data });
  console.log(result.data);
});

app.post('/search/', async (req, res) => {
  const coords = req.body.search;
  const result = await axios.get(`${API_URL}?key=${WEATHER_API_KEY}&q=${coords}&days=3`);
  res.render('index.ejs', { forecast: result.data });
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
