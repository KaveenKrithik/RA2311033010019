const axios = require('axios');
require('dotenv').config();

const LOG_API_URL = 'http://20.207.122.201/evaluation-service/logs';

/**
 * Reusable Logging Function to send logs to the Evaluation Server
 * @param {string} stack - "backend" or "frontend"
 * @param {string} level - "debug", "info", "warn", "error", "fatal"
 * @param {string} pkg - "cache", "controller", "cron_job", "db", "domain", "handler", "repository", "route", "service", "middleware", "auth", "config", "utils"
 * @param {string} message - Description of the log event
 */
async function Log(stack, level, pkg, message) {
    try {
        const payload = {
            stack: stack.toLowerCase(),
            level: level.toLowerCase(),
            package: pkg.toLowerCase(),
            message: message.toString().substring(0, 48)
        };

        const response = await axios.post(LOG_API_URL, payload, {
            headers: {
                'Authorization': `Bearer ${process.env.AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error("Failed to send log to evaluation server:", error.response ? error.response.data : error.message);
    }
}

module.exports = Log;
