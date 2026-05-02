const express = require('express');
const axios = require('axios');
const Log = require('../logging_middleware/index.js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const EXTERNAL_API_URL = 'http://20.207.122.201/evaluation-service/notifications';

const loggingMiddleware = (req, res, next) => {
    req.log = (level, pkg, message) => Log("backend", level, pkg, message);

    req.log("info", "middleware", `Incoming Request: ${req.method} ${req.url}`);
    
    res.on('finish', async () => {
        const level = res.statusCode >= 400 ? "error" : "info";
        await req.log(level, "middleware", `Response Sent: ${res.statusCode} for ${req.method} ${req.url}`);
    });
    
    next();
};

app.use(loggingMiddleware);
app.use(express.json());

// Priority Map for Sorting
const PRIORITY_WEIGHTS = {
    'Placement': 3,
    'Result': 2,
    'Event': 1
};

// Priority Inbox Endpoint
app.get('/notifications/priority', async (req, res) => {
    try {
        await req.log("info", "handler", "Fetching notifications from evaluation API");
        
        const response = await axios.get(EXTERNAL_API_URL, {
            headers: {
                // Assuming bearer token might be required for the notifications API too based on evaluation standards,
                // Though it's a GET, the problem says "API is a protected Route"
                'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
            }
        });
        
        if (!response.data || !response.data.notifications) {
            await req.log("error", "handler", "Invalid data format received from external API");
            return res.status(500).json({ error: 'Invalid data format from external API' });
        }

        const notifications = response.data.notifications;
        await req.log("info", "service", `Successfully fetched ${notifications.length} notifications. Sorting...`);

        notifications.sort((a, b) => {
            // First level: Sort by Priority Weight
            const weightA = PRIORITY_WEIGHTS[a.Type] || 0;
            const weightB = PRIORITY_WEIGHTS[b.Type] || 0;
            
            if (weightA !== weightB) {
                return weightB - weightA; // Descending weight
            }
            
            // Second level: Sort by Recency (Timestamp)
            const timeA = new Date(a.Timestamp).getTime();
            const timeB = new Date(b.Timestamp).getTime();
            
            return timeB - timeA; // Descending timestamp (newest first)
        });

        // Slice top 10
        const top10Notifications = notifications.slice(0, 10);
        
        await req.log("info", "handler", `Successfully processed priority sorting. Returning top ${top10Notifications.length} items.`);

        res.status(200).json({
            status: 'success',
            data: top10Notifications
        });

    } catch (error) {
        await req.log("error", "handler", `Error processing priority inbox: ${error.message}`);
        res.status(500).json({
            error: 'Internal Server Error'
        });
    }
});

app.listen(PORT, async () => {
    await Log("backend", "info", "config", `Server started and listening on port ${PORT}`);
});
