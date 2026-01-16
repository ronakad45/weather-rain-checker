require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;

// Middleware
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');

// Home route - render form
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Will It Rain Tomorrow?',
        error: null,
        result: null 
    });
});

// Weather check route
app.post('/check-weather', async (req, res) => {
    try {
        const { location, units = 'metric' } = req.body;
        
        if (!location || location.trim() === '') {
            return res.render('index', {
                title: 'Will It Rain Tomorrow?',
                error: 'Please enter a location',
                result: null
            });
        }

        // Get coordinates for the location
        const geocodeUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(location)}&limit=1&appid=${API_KEY}`;
        const geoResponse = await axios.get(geocodeUrl);
        
        if (!geoResponse.data || geoResponse.data.length === 0) {
            throw new Error('Location not found. Please try a different city.');
        }

        const { lat, lon, name, country } = geoResponse.data[0];

        // Get weather forecast (5 day / 3 hour forecast)
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
        const forecastResponse = await axios.get(forecastUrl);

        // Get current weather for additional context
        const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
        const currentResponse = await axios.get(currentWeatherUrl);

        // Process forecast data
        const forecasts = forecastResponse.data.list;
        const cityName = forecastResponse.data.city.name;
        
        // Get tomorrow's date
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
        
        // Filter forecasts for tomorrow
        const tomorrowForecasts = forecasts.filter(forecast => {
            const forecastTime = new Date(forecast.dt * 1000);
            return forecastTime >= tomorrow && forecastTime < tomorrowEnd;
        });

        // Check if it will rain tomorrow
        let willRain = false;
        let rainDetails = [];
        let maxRain = 0;

        tomorrowForecasts.forEach(forecast => {
            if (forecast.rain && forecast.rain['3h']) {
                willRain = true;
                const rainAmount = forecast.rain['3h'];
                if (rainAmount > maxRain) maxRain = rainAmount;
                
                rainDetails.push({
                    time: new Date(forecast.dt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    rainAmount: rainAmount,
                    description: forecast.weather[0].description,
                    icon: forecast.weather[0].icon
                });
            }
        });

        // Calculate chance of rain
        const chanceOfRain = tomorrowForecasts.length > 0 
            ? (rainDetails.length / tomorrowForecasts.length) * 100 
            : 0;

        // Prepare result object
        const result = {
            location: `${cityName}, ${country}`,
            willRain: willRain,
            chanceOfRain: Math.round(chanceOfRain),
            maxRainAmount: maxRain,
            rainDetails: rainDetails,
            tomorrowDate: tomorrow.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
            currentWeather: {
                temp: Math.round(currentResponse.data.main.temp),
                description: currentResponse.data.weather[0].description,
                icon: currentResponse.data.weather[0].icon,
                humidity: currentResponse.data.main.humidity
            },
            units: units === 'metric' ? 'mm' : 'inches',
            temperatureUnit: units === 'metric' ? '°C' : '°F'
        };

        res.render('result', {
            title: 'Rain Check Results',
            result: result,
            error: null
        });

    } catch (error) {
        console.error('Error:', error.message);
        
        let userMessage = 'An error occurred while fetching weather data.';
        if (error.response && error.response.status === 401) {
            userMessage = 'Invalid API key. Please check your OpenWeatherMap API key.';
        } else if (error.message.includes('Location not found')) {
            userMessage = error.message;
        } else if (error.code === 'ENOTFOUND') {
            userMessage = 'Network error. Please check your internet connection.';
        }
        
        res.render('index', {
            title: 'Will It Rain Tomorrow?',
            error: userMessage,
            result: null
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Make sure you have set your OPENWEATHER_API_KEY in the .env file`);
});