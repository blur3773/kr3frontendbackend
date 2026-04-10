const contentDiv = document.getElementById('app-content');
const homeBtn = document.getElementById('home-btn');
const aboutBtn = document.getElementById('about-btn');
const categoriesBtn = document.getElementById('categories-btn');

const socket = io('http://localhost:3001');

socket.on('connect', () => {
    console.log('Connected to server:', socket.id);
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

function setActiveButton(activeId) {
    [homeBtn, aboutBtn, categoriesBtn].forEach(btn => btn.classList.remove('active'));
    document.getElementById(activeId).classList.add('active');
}

async function loadContent(page) {
    try {
        const response = await fetch(`/content/${page}.html`);
        const html = await response.text();
        contentDiv.innerHTML = html;

        if (page === 'home') {
            initNotes();
        } else if (page === 'categories') {
            initCategories();
        }
    } catch (err) {
        contentDiv.innerHTML = `<p class="is-center" style="color: #ea4335;">Ошибка загрузки страницы. Проверьте соединение.</p>`;
        console.error(err);
    }
}

homeBtn.addEventListener('click', () => {
    setActiveButton('home-btn');
    loadContent('home');
});

aboutBtn.addEventListener('click', () => {
    setActiveButton('about-btn');
    loadContent('about');
});

categoriesBtn.addEventListener('click', () => {
    setActiveButton('categories-btn');
    loadContent('categories');
});

loadContent('home');

function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

const VAPID_PUBLIC_KEY = 'BB4iOOPqvkx6d7fwxYFLbI3QbCMOm1ov4OBveXgVbpgdX2CES-2aKtrOFL9KWhAB9uT9y_MvAruMU6jNHcfEzyY';

async function subscribeToPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
        await fetch('http://localhost:3001/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(subscription)
        });
        console.log('Push subscription sent to server');
    } catch (err) {
        console.error('Push subscription error:', err);
    }
}

async function unsubscribeFromPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (subscription) {
            await fetch('http://localhost:3001/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endpoint: subscription.endpoint })
            });
            await subscription.unsubscribe();
            console.log('Push unsubscribed');
        }
    } catch (err) {
        console.error('Push unsubscription error:', err);
    }
}

function initNotes() {
    const form = document.getElementById('note-form');
    const input = document.getElementById('note-input');
    const reminderForm = document.getElementById('reminder-form');
    const reminderText = document.getElementById('reminder-text');
    const reminderTime = document.getElementById('reminder-time');
    const list = document.getElementById('notes-list');
    const taskStats = document.getElementById('task-stats');

    function loadNotes() {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');

        const total = notes.length;
        const completed = notes.filter(n => n.completed).length;
        const pending = total - completed;
        if (taskStats) {
            taskStats.textContent = `Всего: ${total} | Выполнено: ${completed} | Ожидает: ${pending}`;
        }

        list.innerHTML = notes.map(note => {
            let reminderInfo = '';
            if (note.reminder) {
                const date = new Date(note.reminder);
                reminderInfo = `<br><small style="color: #ea4335;">⏰ Напоминание: ${date.toLocaleString()}</small>`;
            }
            const categoryInfo = note.category ? `<br><small style="color: #4285f4;">📁 ${getCategoryName(note.category)}</small>` : '';
            return `<li class="card ${note.completed ? 'completed' : ''}" style="margin-bottom: 0.5rem; padding: 0.8rem;">
                        <input type="checkbox" class="task-checkbox" data-id="${note.id}" ${note.completed ? 'checked' : ''}>
                        <span class="task-text">${note.text}${reminderInfo}${categoryInfo}</span>
                        <button class="task-delete" data-id="${note.id}">&times;</button>
                    </li>`;
        }).join('');

        document.querySelectorAll('.task-checkbox').forEach(cb => {
            cb.addEventListener('change', (e) => {
                const id = parseInt(e.target.dataset.id);
                toggleTask(id);
            });
        });

        document.querySelectorAll('.task-delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = parseInt(e.target.dataset.id);
                deleteTask(id);
            });
        });
    }

    function getCategoryName(cat) {
        const names = {
            work: 'Работа',
            personal: 'Личное',
            study: 'Учёба',
            shopping: 'Покупки',
            other: 'Без категории'
        };
        return names[cat] || cat;
    }

    function addNote(text, reminderTimestamp = null, category = null) {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        const newNote = {
            id: Date.now(),
            text,
            completed: false,
            reminder: reminderTimestamp || null,
            category: category || null
        };
        notes.push(newNote);
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotes();

        if (reminderTimestamp) {
            socket.emit('newReminder', {
                id: newNote.id,
                text: text,
                reminderTime: reminderTimestamp
            });
        } else {
            socket.emit('newTask', { text, timestamp: Date.now() });
        }
    }

    function toggleTask(id) {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        const note = notes.find(n => n.id === id);
        if (note) {
            note.completed = !note.completed;
            localStorage.setItem('notes', JSON.stringify(notes));
            loadNotes();
        }
    }

    function deleteTask(id) {
        let notes = JSON.parse(localStorage.getItem('notes') || '[]');
        notes = notes.filter(n => n.id !== id);
        localStorage.setItem('notes', JSON.stringify(notes));
        loadNotes();
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
            addNote(text);
            input.value = '';
        }
    });

    reminderForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = reminderText.value.trim();
        const datetime = reminderTime.value;
        if (text && datetime) {
            const timestamp = new Date(datetime).getTime();
            if (timestamp > Date.now()) {
                addNote(text, timestamp);
                reminderText.value = '';
                reminderTime.value = '';
            } else {
                alert('Дата напоминания должна быть в будущем!');
            }
        }
    });

    loadNotes();
}

function initCategories() {
    const form = document.getElementById('category-form');
    const taskInput = document.getElementById('category-task-input');
    const categorySelect = document.getElementById('category-select');

    updateCategoryCounts();

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = taskInput.value.trim();
        const category = categorySelect.value;
        if (text) {
            const notes = JSON.parse(localStorage.getItem('notes') || '[]');
            const newNote = {
                id: Date.now(),
                text,
                completed: false,
                reminder: null,
                category
            };
            notes.push(newNote);
            localStorage.setItem('notes', JSON.stringify(notes));
            taskInput.value = '';
            updateCategoryCounts();
            socket.emit('newTask', { text, timestamp: Date.now(), category });
        }
    });

    function updateCategoryCounts() {
        const notes = JSON.parse(localStorage.getItem('notes') || '[]');
        const categories = { work: 0, personal: 0, study: 0, shopping: 0, other: 0 };

        notes.forEach(note => {
            const cat = note.category || 'other';
            if (categories.hasOwnProperty(cat)) {
                categories[cat]++;
            } else {
                categories.other++;
            }
        });

        const workEl = document.getElementById('count-work');
        const personalEl = document.getElementById('count-personal');
        const studyEl = document.getElementById('count-study');
        const shoppingEl = document.getElementById('count-shopping');
        const otherEl = document.getElementById('count-other');

        if (workEl) workEl.textContent = categories.work;
        if (personalEl) personalEl.textContent = categories.personal;
        if (studyEl) studyEl.textContent = categories.study;
        if (shoppingEl) shoppingEl.textContent = categories.shopping;
        if (otherEl) otherEl.textContent = categories.other;
    }
}

socket.on('taskAdded', (task) => {
    console.log('Task from another client:', task);
    const notification = document.createElement('div');
    notification.className = 'notification-float';
    notification.textContent = `Новая задача: ${task.text}`;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);

    if (document.getElementById('notes-list')) {
        loadNotes && initNotes();
    }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            console.log('Service Worker registered:', reg.scope);

            const enableBtn = document.getElementById('enable-push');
            const disableBtn = document.getElementById('disable-push');

            if (enableBtn && disableBtn) {
                const subscription = await reg.pushManager.getSubscription();
                if (subscription) {
                    enableBtn.style.display = 'none';
                    disableBtn.style.display = 'inline-block';
                }

                enableBtn.addEventListener('click', async () => {
                    if (Notification.permission === 'denied') {
                        alert('Уведомления запрещены. Разрешите их в настройках браузера.');
                        return;
                    }
                    if (Notification.permission === 'default') {
                        const permission = await Notification.requestPermission();
                        if (permission !== 'granted') {
                            alert('Необходимо разрешить уведомления.');
                            return;
                        }
                    }
                    await subscribeToPush();
                    enableBtn.style.display = 'none';
                    disableBtn.style.display = 'inline-block';
                });

                disableBtn.addEventListener('click', async () => {
                    await unsubscribeFromPush();
                    disableBtn.style.display = 'none';
                    enableBtn.style.display = 'inline-block';
                });
            }
        } catch (err) {
            console.log('Service Worker registration failed:', err);
        }
    });
}
