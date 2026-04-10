const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const webpush = require('web-push');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const vapidKeys = {
    publicKey: 'BB4iOOPqvkx6d7fwxYFLbI3QbCMOm1ov4OBveXgVbpgdX2CES-2aKtrOFL9KWhAB9uT9y_MvAruMU6jNHcfEzyY',
    privateKey: 'HqKxLblVon4BxTg93IkbxMi8nHDEQWusGO6yFAbNOjY'
};

webpush.setVapidDetails(
    'mailto:your-email@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
);

const app = express();
app.use(cors());
app.use(bodyParser.json());

app.use(express.static(path.join(__dirname)));

let subscriptions = [];

const reminders = new Map();

const server = http.createServer(app);
const io = socketIo(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

io.on('connection', (socket) => {
    console.log('[WS] Client connected:', socket.id);

    socket.on('newTask', (task) => {
        console.log('[WS] New task:', task);
        io.emit('taskAdded', task);

        const payload = JSON.stringify({
            title: 'Новая задача',
            body: task.text
        });

        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload)
                .catch(err => console.error('[Push] Error:', err));
        });
    });

    socket.on('newReminder', (reminder) => {
        const { id, text, reminderTime } = reminder;
        console.log('[WS] New reminder:', reminder);

        const delay = reminderTime - Date.now();
        if (delay <= 0) {
            console.log('[WS] Reminder time is in the past, ignoring');
            return;
        }

        const timeoutId = setTimeout(() => {
            console.log('[WS] Reminder triggered:', id);

            const payload = JSON.stringify({
                title: '⏰ Напоминание',
                body: text,
                reminderId: id
            });

            subscriptions.forEach(sub => {
                webpush.sendNotification(sub, payload)
                    .catch(err => console.error('[Push] Error:', err));
            });

            reminders.delete(id);
        }, delay);

        reminders.set(id, { timeoutId, text, reminderTime });
        console.log(`[WS] Reminder scheduled for ${new Date(reminderTime).toLocaleString()} (delay: ${Math.round(delay / 1000)}s)`);
    });

    socket.on('disconnect', () => {
        console.log('[WS] Client disconnected:', socket.id);
    });
});

app.post('/subscribe', (req, res) => {
    const subscription = req.body;
    const exists = subscriptions.some(sub => sub.endpoint === subscription.endpoint);
    if (!exists) {
        subscriptions.push(subscription);
        console.log('[HTTP] Push subscription saved. Total:', subscriptions.length);
    }
    res.status(201).json({ message: 'Подписка сохранена' });
});

app.post('/unsubscribe', (req, res) => {
    const { endpoint } = req.body;
    subscriptions = subscriptions.filter(sub => sub.endpoint !== endpoint);
    console.log('[HTTP] Push subscription removed. Total:', subscriptions.length);
    res.status(200).json({ message: 'Подписка удалена' });
});

app.post('/snooze', (req, res) => {
    const reminderId = parseInt(req.query.reminderId, 10);

    if (!reminderId || !reminders.has(reminderId)) {
        return res.status(404).json({ error: 'Reminder not found' });
    }

    const reminder = reminders.get(reminderId);

    clearTimeout(reminder.timeoutId);
    console.log('[HTTP] Cancelled existing timer for reminder:', reminderId);

    const newDelay = 5 * 60 * 1000;
    const newTimeoutId = setTimeout(() => {
        console.log('[HTTP] Snoozed reminder triggered:', reminderId);

        const payload = JSON.stringify({
            title: '⏰ Напоминание отложено',
            body: reminder.text,
            reminderId: reminderId
        });

        subscriptions.forEach(sub => {
            webpush.sendNotification(sub, payload)
                .catch(err => console.error('[Push] Error:', err));
        });

        reminders.delete(reminderId);
    }, newDelay);

    reminders.set(reminderId, {
        timeoutId: newTimeoutId,
        text: reminder.text,
        reminderTime: Date.now() + newDelay
    });

    console.log(`[HTTP] Reminder snoozed for 5 minutes: ${reminderId}`);
    res.status(200).json({ message: 'Reminder snoozed for 5 minutes' });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
