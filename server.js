require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.OPENWEATHER_API_KEY;

// Add request logging for debugging
const morgan = require('morgan');
app.use(morgan('combined'));

// Add compression for better performance
const compression = require('compression');
app.use(compression());

// Add helmet for security headers
const helmet = require('helmet');
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com/ajax/libs", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com/ajax/libs", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "https://openweathermap.org", "https: data:"]
        }
    }
}));

// Add rate limiting to prevent API abuse
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again after 15 minutes',
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply rate limiting to API routes
app.use('/check-weather', limiter);

// Middleware
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Add cache control for static files
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1d', // Cache static files for 1 day
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        }
    }
}));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err.stack);
    res.status(500).render('error', {
        title: 'Server Error',
        message: 'Something went wrong on our end. Please try again later.',
        error: process.env.NODE_ENV === 'development' ? err.message : {}
    });
});

// Home route - render form
app.get('/', (req, res) => {
    res.render('index', { 
        title: 'Will It Rain Tomorrow?',
        error: null,
        result: null,
        currentYear: new Date().getFullYear()
    });
});

// Health check endpoint for Render monitoring
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'weather-rain-checker'
    });
});

// Weather check route
app.post('/check-weather', async (req, res) => {
    try {
        const { location, units = 'metric' } = req.body;
        
        // Validate input
        if (!location || location.trim() === '') {
            return res.render('index', {
                title: 'Will It Rain Tomorrow?',
                error: 'Please enter a location',
                result: null,
                currentYear: new Date().getFullYear()
            });
        }

        // Trim and clean location input
        const cleanLocation = location.trim();
        
        // Validate location length
        if (cleanLocation.length > 100) {
            return res.render('index', {
                title: 'Will It Rain Tomorrow?',
                error: 'Location name is too long. Please enter a valid city name.',
                result: null,
                currentYear: new Date().getFullYear()
            });
        }

        // Check if API key is set
        if (!API_KEY || API_KEY === 'your_api_key_here') {
            console.error('API_KEY is not properly configured');
            throw new Error('Weather service is currently unavailable. Please try again later.');
        }

        // Get coordinates for the location
        const geocodeUrl = `https://api.openweathermap.org/geo/1.0/direct?q=${encodeURIComponent(cleanLocation)}&limit=1&appid=${API_KEY}`;
        
        console.log(`Geocoding: ${cleanLocation}`);
        const geoResponse = await axios.get(geocodeUrl, {
            timeout: 10000 // 10 second timeout
        });
        
        if (!geoResponse.data || geoResponse.data.length === 0) {
            return res.render('index', {
                title: 'Will It Rain Tomorrow?',
                error: `Location "${cleanLocation}" not found. Please try a different city name.`,
                result: null,
                currentYear: new Date().getFullYear()
            });
        }

        const { lat, lon, name, country, state } = geoResponse.data[0];
        console.log(`Found location: ${name}, ${country} (${lat}, ${lon})`);

        // Get weather forecast (5 day / 3 hour forecast)
        const forecastUrl = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;
        
        // Get current weather for additional context
        const currentWeatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&units=${units}&appid=${API_KEY}`;

        // Make both API calls in parallel for better performance
        const [forecastResponse, currentResponse] = await Promise.all([
            axios.get(forecastUrl, { timeout: 10000 }),
            axios.get(currentWeatherUrl, { timeout: 10000 })
        ]);

        // Process forecast data
        const forecasts = forecastResponse.data.list;
        const cityName = forecastResponse.data.city.name;
        
        // Get tomorrow's date
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        
        const tomorrowEnd = new Date(tomorrow);
        tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
        
        // Filter forecasts for tomorrow
        const tomorrowForecasts = forecasts.filter(forecast => {
            const forecastTime = new Date(forecast.dt * 1000);
            return forecastTime >= tomorrow && forecastTime < tomorrowEnd;
        });

        // If no forecasts for tomorrow (edge case), use next 24 hours
        const fallbackForecasts = tomorrowForecasts.length === 0 
            ? forecasts.slice(0, 8) // First 24 hours (8 * 3-hour segments)
            : tomorrowForecasts;

        // Check if it will rain tomorrow
        let willRain = false;
        let rainDetails = [];
        let maxRain = 0;
        let totalRain = 0;

        fallbackForecasts.forEach(forecast => {
            if (forecast.rain && forecast.rain['3h']) {
                willRain = true;
                const rainAmount = forecast.rain['3h'];
                totalRain += rainAmount;
                if (rainAmount > maxRain) maxRain = rainAmount;
                
                rainDetails.push({
                    time: new Date(forecast.dt * 1000).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        hour12: true 
                    }),
                    rainAmount: rainAmount,
                    description: forecast.weather[0].description,
                    icon: forecast.weather[0].icon,
                    temp: Math.round(forecast.main.temp),
                    humidity: forecast.main.humidity,
                    windSpeed: forecast.wind.speed,
                    date: new Date(forecast.dt * 1000).toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric'
                    })
                });
            }
        });

        // Calculate chance of rain
        const chanceOfRain = fallbackForecasts.length > 0 
            ? (rainDetails.length / fallbackForecasts.length) * 100 
            : 0;

        // Format location name
        const displayLocation = state 
            ? `${cityName}, ${state}, ${country}`
            : `${cityName}, ${country}`;

        // Prepare result object
        const result = {
            location: displayLocation,
            coordinates: { lat, lon },
            willRain: willRain,
            chanceOfRain: Math.round(chanceOfRain),
            maxRainAmount: maxRain,
            totalRainAmount: totalRain.toFixed(1),
            rainDetails: rainDetails,
            tomorrowDate: tomorrow.toLocaleDateString('en-US', { 
                weekday: 'long', 
                month: 'long', 
                day: 'numeric',
                year: 'numeric'
            }),
            currentWeather: {
                temp: Math.round(currentResponse.data.main.temp),
                feelsLike: Math.round(currentResponse.data.main.feels_like),
                description: currentResponse.data.weather[0].description,
                icon: currentResponse.data.weather[0].icon,
                humidity: currentResponse.data.main.humidity,
                pressure: currentResponse.data.main.pressure,
                windSpeed: currentResponse.data.wind.speed,
                windDirection: currentResponse.data.wind.deg,
                visibility: (currentResponse.data.visibility / 1000).toFixed(1), // Convert to km
                sunrise: new Date(currentResponse.data.sys.sunrise * 1000).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                }),
                sunset: new Date(currentResponse.data.sys.sunset * 1000).toLocaleTimeString([], { 
                    hour: '2-digit', 
                    minute: '2-digit',
                    hour12: true 
                })
            },
            units: units === 'metric' ? 'mm' : 'inches',
            temperatureUnit: units === 'metric' ? '°C' : '°F',
            windUnit: units === 'metric' ? 'm/s' : 'mph',
            visibilityUnit: units === 'metric' ? 'km' : 'miles',
            forecastCount: fallbackForecasts.length,
            searchLocation: cleanLocation
        };

        // Log successful request
        console.log(`Successfully fetched weather for: ${displayLocation}`);

        res.render('result', {
            title: 'Rain Check Results',
            result: result,
            error: null,
            currentYear: new Date().getFullYear()
        });

    } catch (error) {
        console.error('Weather API Error:', error.message);
        console.error('Error details:', error.response?.data || 'No response data');
        
        let userMessage = 'An error occurred while fetching weather data.';
        
        if (error.code === 'ENOTFOUND') {
            userMessage = 'Network error. Please check your internet connection and try again.';
        } else if (error.response) {
            // OpenWeatherMap API errors
            switch (error.response.status) {
                case 401:
                    userMessage = 'Weather service authentication failed. Please contact support.';
                    break;
                case 404:
                    userMessage = 'Weather service is currently unavailable. Please try again later.';
                    break;
                case 429:
                    userMessage = 'Too many requests. Please wait a few minutes and try again.';
                    break;
                case 500:
                case 502:
                case 503:
                case 504:
                    userMessage = 'Weather service is temporarily unavailable. Please try again in a few minutes.';
                    break;
                default:
                    userMessage = `Weather service error: ${error.response.status}. Please try again.`;
            }
        } else if (error.message.includes('timeout')) {
            userMessage = 'Request timeout. The weather service is taking too long to respond. Please try again.';
        }
        
        res.render('index', {
            title: 'Will It Rain Tomorrow?',
            error: userMessage,
            result: null,
            currentYear: new Date().getFullYear()
        });
    }
});

// 404 handler for undefined routes
app.use((req, res) => {
    res.status(404).render('error', {
        title: 'Page Not Found',
        message: 'The page you are looking for does not exist.',
        error: {}
    });
});

// Handle Render's shutdown signal gracefully
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});

// Start server with error handling
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📡 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔑 API Key configured: ${API_KEY ? 'Yes' : 'No'}`);
    console.log(`🌐 Access the app at: http://localhost:${PORT}`);
    console.log(`💡 Health check: http://localhost:${PORT}/health`);
});

// Handle server errors
server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use`);
        process.exit(1);
    } else {
        console.error('Server error:', error);
        throw error;
    }
});

// Export for testing (if needed)
module.exports = app;