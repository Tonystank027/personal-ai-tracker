/* ============================================
   Personal AI Agent - Main Application
   ============================================ */

// =============================================
// IndexedDB Database Module
// =============================================

const DB_NAME = 'PersonalAIAgent';
const DB_VERSION = 1;

const DB = {
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Tasks store
                if (!db.objectStoreNames.contains('tasks')) {
                    const tasksStore = db.createObjectStore('tasks', { keyPath: 'id', autoIncrement: true });
                    tasksStore.createIndex('deadline', 'deadline', { unique: false });
                    tasksStore.createIndex('priority', 'priority', { unique: false });
                    tasksStore.createIndex('completed', 'completed', { unique: false });
                    tasksStore.createIndex('category', 'category', { unique: false });
                }

                // Notes store
                if (!db.objectStoreNames.contains('notes')) {
                    const notesStore = db.createObjectStore('notes', { keyPath: 'id', autoIncrement: true });
                    notesStore.createIndex('tags', 'tags', { unique: false });
                    notesStore.createIndex('createdAt', 'createdAt', { unique: false });
                }

                // Settings store
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }

                // Chat history store
                if (!db.objectStoreNames.contains('chatHistory')) {
                    const chatStore = db.createObjectStore('chatHistory', { keyPath: 'id', autoIncrement: true });
                    chatStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    },

    // Generic CRUD operations
    async getAll(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async add(storeName, item) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.add(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async put(storeName, item) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(item);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async delete(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    async get(storeName, id) {
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getSetting(key, defaultValue = null) {
        const setting = await this.get('settings', key);
        return setting ? setting.value : defaultValue;
    },

    async setSetting(key, value) {
        return this.put('settings', { key, value });
    },

    // Export all data
    async exportAll() {
        const tasks = await this.getAll('tasks');
        const notes = await this.getAll('notes');
        const settings = await this.getAll('settings');
        const chatHistory = await this.getAll('chatHistory');

        return {
            version: DB_VERSION,
            exportedAt: new Date().toISOString(),
            tasks,
            notes,
            settings,
            chatHistory
        };
    },

    // Import data
    async importAll(data) {
        const transaction = this.db.transaction(['tasks', 'notes', 'settings', 'chatHistory'], 'readwrite');

        // Clear existing data
        transaction.objectStore('tasks').clear();
        transaction.objectStore('notes').clear();
        transaction.objectStore('settings').clear();
        transaction.objectStore('chatHistory').clear();

        // Import new data
        if (data.tasks) {
            data.tasks.forEach(item => transaction.objectStore('tasks').add(item));
        }
        if (data.notes) {
            data.notes.forEach(item => transaction.objectStore('notes').add(item));
        }
        if (data.settings) {
            data.settings.forEach(item => transaction.objectStore('settings').put(item));
        }
        if (data.chatHistory) {
            data.chatHistory.forEach(item => transaction.objectStore('chatHistory').add(item));
        }

        return new Promise((resolve) => {
            transaction.oncomplete = () => resolve();
        });
    }
};

// =============================================
// Task Manager Module
// =============================================

const TaskManager = {
    async getAll() {
        return await DB.getAll('tasks');
    },

    async add(task) {
        const newTask = {
            ...task,
            completed: false,
            createdAt: new Date().toISOString(),
            tags: task.tags || []
        };
        return await DB.add('tasks', newTask);
    },

    async update(task) {
        return await DB.put('tasks', task);
    },

    async delete(id) {
        return await DB.delete('tasks', id);
    },

    async toggleComplete(id) {
        const task = await DB.get('tasks', id);
        if (task) {
            task.completed = !task.completed;
            if (task.completed) {
                task.completedAt = new Date().toISOString();
            } else {
                delete task.completedAt;
            }
            return await this.update(task);
        }
        return null;
    },

    async getTodayTasks() {
        const tasks = await this.getAll();
        const today = new Date().toDateString();
        return tasks.filter(task => {
            if (!task.deadline) return false;
            return new Date(task.deadline).toDateString() === today;
        });
    },

    async getUpcomingTasks() {
        const tasks = await this.getAll();
        const now = new Date();
        return tasks.filter(task => {
            if (!task.deadline) return false;
            return new Date(task.deadline) > now && !task.completed;
        }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
    },

    async getStats() {
        const tasks = await this.getAll();
        return {
            total: tasks.length,
            completed: tasks.filter(t => t.completed).length,
            pending: tasks.filter(t => !t.completed).length,
            highPriority: tasks.filter(t => t.priority === 'high' && !t.completed).length,
            overdue: tasks.filter(t => {
                if (!t.deadline || t.completed) return false;
                return new Date(t.deadline) < new Date();
            }).length
        };
    }
};

// =============================================
// Notes Manager Module
// =============================================

const NotesManager = {
    async getAll() {
        return await DB.getAll('notes');
    },

    async add(note) {
        const newNote = {
            ...note,
            tags: note.tags ? note.tags.split(',').map(t => t.trim()).filter(t => t) : [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        return await DB.add('notes', newNote);
    },

    async update(note) {
        note.updatedAt = new Date().toISOString();
        note.tags = note.tags ? (Array.isArray(note.tags) ? note.tags : note.tags.split(',').map(t => t.trim()).filter(t => t)) : [];
        return await DB.put('notes', note);
    },

    async delete(id) {
        return await DB.delete('notes', id);
    },

    async search(query) {
        const notes = await this.getAll();
        const lowerQuery = query.toLowerCase();
        return notes.filter(note =>
            note.title.toLowerCase().includes(lowerQuery) ||
            note.content.toLowerCase().includes(lowerQuery) ||
            (note.tags && note.tags.some(tag => tag.toLowerCase().includes(lowerQuery)))
        );
    }
};

// =============================================
// AI Chat Assistant Module - Completions.me (Free) + Fallback
// =============================================

const AIChat = {
    context: {
        tasks: [],
        notes: [],
        stats: null
    },

    config: {
        useCompletions: false,
        completionsKey: '',
        model: 'openrouter/auto'
    },

    async init() {
        // Load settings from IndexedDB
        const useAPI = await DB.getSetting('useCompletions', false);
        const apiKey = await DB.getSetting('completionsKey', '');
        this.config.useCompletions = useAPI;
        this.config.completionsKey = apiKey;
    },

    async updateContext() {
        this.context.tasks = await TaskManager.getAll();
        this.context.notes = await NotesManager.getAll();
        this.context.stats = await TaskManager.getStats();
    },

    async sendMessage(message) {
        await this.updateContext();

        let content;

        if (this.config.useCompletions && this.config.completionsKey) {
            content = await this.callCompletionsMe(message);
        } else {
            content = this.generateFallbackResponse(message.toLowerCase());
        }

        const response = {
            role: 'assistant',
            content: content,
            timestamp: new Date().toISOString()
        };

        // Save to chat history
        await DB.add('chatHistory', {
            userMessage: message,
            assistantResponse: content,
            timestamp: new Date().toISOString()
        });

        return response;
    },

    async callCompletionsMe(userMessage) {
        const { tasks, notes, stats } = this.context;

        const contextData = {
            totalTasks: stats.total,
            completedTasks: stats.completed,
            pendingTasks: stats.pending,
            highPriorityTasks: stats.highPriority,
            todayTasks: tasks.filter(t => {
                if (!t.deadline) return false;
                return new Date(t.deadline).toDateString() === new Date().toDateString();
            }).map(t => t.title),
            pendingTaskList: tasks.filter(t => !t.completed).slice(0, 10).map(t => `- ${t.title} (${t.priority})`),
            recentNotes: notes.slice(-5).map(n => n.title),
            upcomingDeadlines: tasks.filter(t => t.deadline && !t.completed && new Date(t.deadline) > new Date())
                .slice(0, 5)
                .map(t => `${t.title}: ${new Date(t.deadline).toLocaleDateString()}`)
        };

        const systemPrompt = `You are J.A.R.V.I.S., a personal AI assistant integrated into a productivity app. Be helpful, concise, and friendly. Use emojis sparingly. Format responses nicely with line breaks.

Current User Context:
${JSON.stringify(contextData, null, 2)}

When asked about tasks, notes, or schedule, use the context above to provide accurate answers.`;

        try {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.config.completionsKey}`,
                    'HTTP-Referer': window.location.href,
                    'X-Title': 'Personal AI Agent'
                },
                body: JSON.stringify({
                    model: this.config.model,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    max_tokens: 1024
                })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'API request failed');
            }

            const data = await response.json();
            return data.choices[0].message.content;

        } catch (error) {
            console.error('Completions.me Error:', error);
            return `[Fallback Mode] API Error: ${error.message}. Check your API key in Settings.`;
        }
    },

    generateFallbackResponse(message) {
        const { tasks, notes, stats } = this.context;

        // Greeting
        if (message.includes('hello') || message.includes('hi ') || message === 'hi' || message.includes('hey')) {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
            return `${greeting}! I'm J.A.R.V.I.S., your Personal AI Agent. You have ${stats.pending} pending tasks today. How can I help you?`;
        }

        // Task-related queries
        if (message.includes('task') || message.includes('todo') || message.includes('to do')) {
            if (message.includes('how many') || message.includes('count')) {
                return `You have ${stats.total} total tasks: ${stats.completed} completed and ${stats.pending} pending.`;
            }
            if (message.includes('today')) {
                const todayTasks = tasks.filter(t => {
                    if (!t.deadline) return false;
                    return new Date(t.deadline).toDateString() === new Date().toDateString();
                });
                if (todayTasks.length === 0) {
                    return "You have no tasks scheduled for today. Enjoy your free time!";
                }
                const taskList = todayTasks.map(t => `- ${t.title} (${t.priority})`).join('\n');
                return `Today's tasks:\n${taskList}`;
            }
            if (message.includes('pending') || message.includes('left')) {
                const pending = tasks.filter(t => !t.completed);
                if (pending.length === 0) {
                    return "🎉 All tasks completed! Great job!";
                }
                const list = pending.slice(0, 5).map(t => `- ${t.title}`).join('\n');
                return pending.length > 5
                    ? `You have ${pending.length} pending tasks. Here are the first 5:\n${list}`
                    : `Your pending tasks:\n${list}`;
            }
            if (message.includes('high priority') || message.includes('urgent')) {
                const highPriority = tasks.filter(t => t.priority === 'high' && !t.completed);
                if (highPriority.length === 0) {
                    return "No high priority tasks pending. You're all caught up!";
                }
                return highPriority.map(t => `- ${t.title}${t.deadline ? ' (Due: ' + new Date(t.deadline).toLocaleDateString() + ')' : ''}`).join('\n');
            }
        }

        // Notes-related queries
        if (message.includes('note') || message.includes('idea')) {
            if (message.includes('how many') || message.includes('count')) {
                return `You have ${notes.length} notes saved.`;
            }
            if (notes.length === 0) {
                return "You don't have any notes yet. Start jotting down your ideas!";
            }
            const recentNotes = notes.slice(-5).reverse();
            return `Your recent notes:\n${recentNotes.map(n => `- ${n.title}`).join('\n')}`;
        }

        // Schedule/Planner
        if (message.includes('schedule') || message.includes('plan') || message.includes('calendar')) {
            const todayTasks = tasks.filter(t => {
                if (!t.deadline) return false;
                return new Date(t.deadline).toDateString() === new Date().toDateString() && !t.completed;
            }).sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

            if (todayTasks.length === 0) {
                return "No tasks scheduled for today. Your schedule is clear!";
            }

            return `Today's schedule:\n${todayTasks.map(t => `- ${new Date(t.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}: ${t.title}`).join('\n')}`;
        }

        // Progress/Stats
        if (message.includes('progress') || message.includes('stats') || message.includes('productivity')) {
            const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
            return `📊 Your Productivity Stats:\n- Total Tasks: ${stats.total}\n- Completed: ${stats.completed}\n- Pending: ${stats.pending}\n- Completion Rate: ${percentage}%\n- High Priority Pending: ${stats.highPriority}`;
        }

        // Help
        if (message.includes('help') || message.includes('what can you do')) {
            return `I can help you with:\n\n📋 **Tasks**: Ask me about your tasks, what's due today, or what's pending\n📝 **Notes**: Query your saved notes and ideas\n📅 **Schedule**: Get your daily schedule and upcoming deadlines\n📊 **Stats**: Check your productivity and completion rates\n\nJust ask me anything!`;
        }

        // Time/Date queries
        if (message.includes('time') || message.includes('date') || message.includes('day')) {
            const now = new Date();
            return `Current time: ${now.toLocaleString()}`;
        }

        // Motivation
        if (message.includes('motivate') || message.includes('inspire') || message.includes('quote')) {
            const quotes = [
                "The only way to do great work is to love what you do. - Steve Jobs",
                "Believe you can and you're halfway there. - Theodore Roosevelt",
                "Success is not final, failure is not fatal: It is the courage to continue that counts. - Winston Churchill",
                "Your future is created by what you do today, not tomorrow."
            ];
            return quotes[Math.floor(Math.random() * quotes.length)];
        }

        // Joke
        if (message.includes('joke') || message.includes('funny')) {
            const jokes = [
                "Why do programmers prefer dark mode? Because light attracts bugs! 🐛",
                "I told my computer I needed a break, and it said 'No problem, I'll go to sleep.' 💤",
                "Why don't robots ever panic? Because they have good circuits! 🔌"
            ];
            return jokes[Math.floor(Math.random() * jokes.length)];
        }

        // Thank you
        if (message.includes('thank') || message.includes('thanks')) {
            return "You're welcome! I'm always here to help you stay organized and productive!";
        }

        // Default response
        return `I'm in **Fallback Mode** (local responses only). For smarter AI responses:\n\n1. Get a free OpenRouter API key at: openrouter.ai/keys\n2. Go to Settings and enter your API key\n3. Use free models like 'openrouter/auto'\n\nTry asking about:\n- "What tasks do I have today?"\n- "Show my stats"\n- "Tell me a joke"`;
    },

    // Settings methods
    async setAPIKey(key) {
        this.config.completionsKey = key;
        await DB.setSetting('completionsKey', key);
    },

    async toggleAPI(useAPI) {
        this.config.useCompletions = useAPI;
        await DB.setSetting('useCompletions', useAPI);
    },

    async clearAPIKey() {
        this.config.completionsKey = '';
        this.config.useCompletions = false;
        await DB.setSetting('completionsKey', '');
        await DB.setSetting('useCompletions', false);
    }
};

// =============================================
// Notification Manager
// =============================================

const NotificationManager = {
    async requestPermission() {
        if (!('Notification' in window)) {
            alert('This browser does not support notifications');
            return false;
        }
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    },

    async send(title, body) {
        if (Notification.permission === 'granted') {
            new Notification(title, {
                body,
                icon: '🔔'
            });
        }
    },

    async checkReminders() {
        const tasks = await TaskManager.getAll();
        const now = new Date();

        for (const task of tasks) {
            if (task.reminder && !task.completed && task.deadline) {
                const deadline = new Date(task.deadline);
                const timeDiff = deadline - now;

                // Send reminder 15 minutes before deadline
                if (timeDiff > 0 && timeDiff < 15 * 60 * 1000) {
                    await this.send('Task Reminder', `${task.title} is due soon!`);
                }
            }
        }
    }
};

// =============================================
// UI Controller
// =============================================

const UI = {
    currentView: 'dashboard',
    currentFilter: 'all',
    charts: {},

    init() {
        this.setupNavigation();
        this.setupTheme();
        this.setupModals();
        this.setupTaskManager();
        this.setupNotesManager();
        this.setupChat();
        this.setupSettings();
        this.setupSearch();
        this.updateCurrentDate();

        // Start reminder checker
        setInterval(() => NotificationManager.checkReminders(), 60000);
    },

    updateCurrentDate() {
        const now = new Date();
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('current-date').textContent = now.toLocaleDateString('en-US', options);
    },

    setupNavigation() {
        const navItems = document.querySelectorAll('.nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const view = item.dataset.view;
                this.switchView(view);
            });
        });
    },

    switchView(viewName) {
        // Update nav items
        document.querySelectorAll('.nav-item').forEach(item => {
            item.classList.toggle('active', item.dataset.view === viewName);
        });

        // Update views
        document.querySelectorAll('.view').forEach(view => {
            view.classList.toggle('active', view.id === `${viewName}-view`);
        });

        // Update page title
        const titles = {
            dashboard: 'Dashboard',
            tasks: 'Tasks',
            notes: 'Notes',
            chat: 'AI Chat Assistant',
            planner: 'Daily Planner',
            settings: 'Settings'
        };
        document.getElementById('page-title').textContent = titles[viewName];

        this.currentView = viewName;

        // Load view data
        this.loadViewData(viewName);
    },

    async loadViewData(viewName) {
        switch(viewName) {
            case 'dashboard':
                await this.renderDashboard();
                break;
            case 'tasks':
                await this.renderTasks();
                break;
            case 'notes':
                await this.renderNotes();
                break;
            case 'planner':
                await this.renderPlanner();
                break;
        }
    },

    async renderDashboard() {
        const stats = await TaskManager.getStats();

        document.getElementById('total-tasks').textContent = stats.total;
        document.getElementById('completed-tasks').textContent = stats.completed;
        document.getElementById('pending-tasks').textContent = stats.pending;
        document.getElementById('high-priority').textContent = stats.highPriority;

        // Update progress bar
        const percentage = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
        document.getElementById('completion-bar').style.width = percentage + '%';
        document.getElementById('completion-text').textContent = percentage + '% Complete';

        // Today's tasks
        const todayTasks = await TaskManager.getTodayTasks();
        const todayList = document.getElementById('today-tasks-list');
        if (todayTasks.length === 0) {
            todayList.innerHTML = '<li class="empty-state"><p>No tasks for today</p></li>';
        } else {
            todayList.innerHTML = todayTasks.map(task => `
                <li>
                    <input type="checkbox" ${task.completed ? 'checked' : ''} onchange="UI.toggleTask(${task.id})">
                    <span class="task-text ${task.completed ? 'completed' : ''}">${task.title}</span>
                    <span class="task-priority ${task.priority}">${task.priority}</span>
                </li>
            `).join('');
        }

        // Render charts
        this.renderCharts(stats);
    },

    renderCharts(stats) {
        // Destroy existing charts
        if (this.charts.tasks) this.charts.tasks.destroy();
        if (this.charts.priority) this.charts.priority.destroy();

        // Tasks completion chart
        const tasksCtx = document.getElementById('tasks-chart').getContext('2d');
        this.charts.tasks = new Chart(tasksCtx, {
            type: 'doughnut',
            data: {
                labels: ['Completed', 'Pending'],
                datasets: [{
                    data: [stats.completed, stats.pending],
                    backgroundColor: ['#10b981', '#6366f1'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    title: { display: true, text: 'Task Completion' }
                }
            }
        });

        // Priority distribution chart
        TaskManager.getAll().then(tasks => {
            const pending = tasks.filter(t => !t.completed);
            const high = pending.filter(t => t.priority === 'high').length;
            const medium = pending.filter(t => t.priority === 'medium').length;
            const low = pending.filter(t => t.priority === 'low').length;

            const priorityCtx = document.getElementById('priority-chart').getContext('2d');
            this.charts.priority = new Chart(priorityCtx, {
                type: 'bar',
                data: {
                    labels: ['High', 'Medium', 'Low'],
                    datasets: [{
                        label: 'Pending Tasks',
                        data: [high, medium, low],
                        backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
                        borderRadius: 8
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false },
                        title: { display: true, text: 'Priority Distribution' }
                    },
                    scales: {
                        y: { beginAtZero: true, ticks: { stepSize: 1 } }
                    }
                }
            });
        });
    },

    async renderTasks() {
        const container = document.getElementById('tasks-container');
        let tasks = await TaskManager.getAll();

        // Apply filter
        const now = new Date();
        const today = now.toDateString();

        switch(this.currentFilter) {
            case 'today':
                tasks = tasks.filter(t => t.deadline && new Date(t.deadline).toDateString() === today);
                break;
            case 'upcoming':
                tasks = tasks.filter(t => t.deadline && new Date(t.deadline) > now && !t.completed);
                break;
            case 'completed':
                tasks = tasks.filter(t => t.completed);
                break;
        }

        // Sort: pending first, then by priority
        const priorityOrder = { high: 0, medium: 1, low: 2 };
        tasks.sort((a, b) => {
            if (a.completed !== b.completed) return a.completed ? 1 : -1;
            return priorityOrder[a.priority] - priorityOrder[b.priority];
        });

        if (tasks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📋</div>
                    <h3>No tasks found</h3>
                    <p>Add a new task to get started</p>
                </div>
            `;
            return;
        }

        container.innerHTML = tasks.map(task => `
            <div class="task-card ${task.completed ? 'completed' : ''}" draggable="true" data-id="${task.id}">
                <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="UI.toggleTask(${task.id})">
                <div class="task-content">
                    <div class="task-title">${task.title}</div>
                    <div class="task-meta">
                        <span class="task-priority ${task.priority}">${task.priority}</span>
                        ${task.category ? `<span class="task-category">${task.category}</span>` : ''}
                        ${task.deadline ? `<span>📅 ${new Date(task.deadline).toLocaleString()}</span>` : ''}
                        ${task.reminder ? '<span>🔔 Reminder set</span>' : ''}
                    </div>
                </div>
                <div class="task-actions">
                    <button class="task-btn" onclick="UI.editTask(${task.id})">✏️</button>
                    <button class="task-btn delete" onclick="UI.deleteTask(${task.id})">🗑️</button>
                </div>
            </div>
        `).join('');

        this.setupDragAndDrop();
    },

    setupDragAndDrop() {
        const cards = document.querySelectorAll('.task-card');
        let draggedItem = null;

        cards.forEach(card => {
            card.addEventListener('dragstart', () => {
                draggedItem = card;
                card.classList.add('dragging');
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                draggedItem = null;
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                const container = document.getElementById('tasks-container');
                const afterElement = [...container.querySelectorAll('.task-card:not(.dragging)')]
                    .find(item => {
                        const rect = item.getBoundingClientRect();
                        return e.clientY < rect.top + rect.height / 2;
                    });

                if (afterElement) {
                    container.insertBefore(draggedItem, afterElement);
                } else {
                    container.appendChild(draggedItem);
                }
            });
        });
    },

    async renderNotes() {
        const container = document.getElementById('notes-container');
        const notes = await NotesManager.getAll();

        if (notes.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📝</div>
                    <h3>No notes yet</h3>
                    <p>Start capturing your ideas</p>
                </div>
            `;
            return;
        }

        container.innerHTML = notes.map(note => `
            <div class="note-card" onclick="UI.editNote(${note.id})">
                <h4 class="note-title">${note.title}</h4>
                <p class="note-preview">${note.content}</p>
                <div class="note-tags">
                    ${(note.tags || []).slice(0, 3).map(tag => `<span class="note-tag">${tag}</span>`).join('')}
                </div>
            </div>
        `).join('');
    },

    async renderPlanner() {
        const container = document.getElementById('schedule-container');
        const tasks = await TaskManager.getUpcomingTasks();

        if (tasks.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="icon">📅</div>
                    <h3>No upcoming tasks</h3>
                    <p>Your schedule is clear</p>
                </div>
            `;
            return;
        }

        container.innerHTML = tasks.map(task => `
            <div class="schedule-item">
                <div class="schedule-time">${new Date(task.deadline).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                <div class="schedule-task">
                    <strong>${task.title}</strong>
                    <p>${task.description || ''}</p>
                    <span class="task-priority ${task.priority}">${task.priority}</span>
                    ${task.category ? `<span class="task-category">${task.category}</span>` : ''}
                </div>
            </div>
        `).join('');
    },

    setupTheme() {
        const themeBtn = document.getElementById('theme-toggle');
        const toggle = document.getElementById('dark-mode-toggle');

        // Load saved theme
        DB.getSetting('theme', 'light').then(theme => {
            if (theme === 'dark') {
                document.documentElement.setAttribute('data-theme', 'dark');
                toggle.checked = true;
                themeBtn.querySelector('.icon').textContent = '☀️';
                themeBtn.querySelector('span:last-child').textContent = 'Light Mode';
            }
        });

        themeBtn.addEventListener('click', () => {
            const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
            const newTheme = isDark ? 'light' : 'dark';

            document.documentElement.setAttribute('data-theme', newTheme);
            DB.setSetting('theme', newTheme);

            themeBtn.querySelector('.icon').textContent = isDark ? '🌙' : '☀️';
            themeBtn.querySelector('span:last-child').textContent = isDark ? 'Dark Mode' : 'Light Mode';
            toggle.checked = !isDark;
        });

        toggle.addEventListener('change', () => {
            themeBtn.click();
        });
    },

    setupModals() {
        // Task modal
        const taskModal = document.getElementById('task-modal');
        const addTaskBtn = document.getElementById('add-task-btn');
        const taskForm = document.getElementById('task-form');
        const cancelBtns = document.querySelectorAll('.cancel-btn');
        const closeBtns = document.querySelectorAll('.modal .close-btn');

        addTaskBtn.addEventListener('click', () => {
            document.getElementById('task-modal-title').textContent = 'Add New Task';
            taskForm.reset();
            document.getElementById('task-id').value = '';
            taskModal.classList.add('active');
        });

        taskForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('task-id').value;
            const taskData = {
                title: document.getElementById('task-title').value,
                description: document.getElementById('task-description').value,
                priority: document.getElementById('task-priority').value,
                category: document.getElementById('task-category').value,
                deadline: document.getElementById('task-deadline').value ? new Date(document.getElementById('task-deadline').value).toISOString() : null,
                reminder: document.getElementById('task-reminder').checked
            };

            if (id) {
                taskData.id = parseInt(id);
                await TaskManager.update(taskData);
            } else {
                await TaskManager.add(taskData);
            }

            taskModal.classList.remove('active');
            this.renderTasks();
            this.renderDashboard();
        });

        // Note modal
        const noteModal = document.getElementById('note-modal');
        const addNoteBtn = document.getElementById('add-note-btn');
        const noteForm = document.getElementById('note-form');

        addNoteBtn.addEventListener('click', () => {
            document.getElementById('note-modal-title').textContent = 'New Note';
            noteForm.reset();
            document.getElementById('note-id').value = '';
            noteModal.classList.add('active');
        });

        noteForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            const id = document.getElementById('note-id').value;
            const noteData = {
                title: document.getElementById('note-title').value,
                content: document.getElementById('note-content').value,
                tags: document.getElementById('note-tags').value
            };

            if (id) {
                noteData.id = parseInt(id);
                await NotesManager.update(noteData);
            } else {
                await NotesManager.add(noteData);
            }

            noteModal.classList.remove('active');
            this.renderNotes();
        });

        // Close modals
        cancelBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.remove('active');
            });
        });

        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                btn.closest('.modal').classList.remove('active');
            });
        });

        // Close on outside click
        [taskModal, noteModal].forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    },

    setupTaskManager() {
        // Filter buttons
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentFilter = btn.dataset.filter;
                this.renderTasks();
            });
        });
    },

    setupNotesManager() {
        // Notes search
        document.getElementById('notes-search').addEventListener('input', async (e) => {
            const query = e.target.value;
            const container = document.getElementById('notes-container');

            if (!query) {
                this.renderNotes();
                return;
            }

            const notes = await NotesManager.search(query);

            if (notes.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>No notes found</p></div>';
                return;
            }

            container.innerHTML = notes.map(note => `
                <div class="note-card" onclick="UI.editNote(${note.id})">
                    <h4 class="note-title">${note.title}</h4>
                    <p class="note-preview">${note.content}</p>
                    <div class="note-tags">
                        ${(note.tags || []).slice(0, 3).map(tag => `<span class="note-tag">${tag}</span>`).join('')}
                    </div>
                </div>
            `).join('');
        });
    },

    setupChat() {
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-chat-btn');
        const messagesContainer = document.getElementById('chat-messages');

        const addMessage = (content, isUser = false) => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `chat-message ${isUser ? 'user' : ''}`;
            messageDiv.innerHTML = `
                <div class="chat-avatar">${isUser ? '👤' : '🤖'}</div>
                <div class="chat-message-content">${content}</div>
            `;
            messagesContainer.appendChild(messageDiv);
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        };

        const sendMessage = async () => {
            const message = chatInput.value.trim();
            if (!message) return;

            addMessage(message, true);
            chatInput.value = '';

            // Show typing indicator
            const typingDiv = document.createElement('div');
            typingDiv.className = 'chat-message';
            typingDiv.id = 'typing-indicator';
            typingDiv.innerHTML = `
                <div class="chat-avatar">🤖</div>
                <div class="chat-message-content">...</div>
            `;
            messagesContainer.appendChild(typingDiv);

            const response = await AIChat.sendMessage(message);

            typingDiv.remove();
            addMessage(response.content.replace(/\n/g, '<br>'));
        };

        sendBtn.addEventListener('click', sendMessage);
        chatInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        // Welcome message
        setTimeout(() => {
            addMessage("Hi! I'm your Personal AI Assistant. Ask me about your tasks, notes, schedule, or productivity stats!");
        }, 500);
    },

    setupSettings() {
        // API Key handlers
        const apiKeyInput = document.getElementById('claude-api-key');
        const apiStatus = document.getElementById('api-status');

        // Load saved API key
        DB.getSetting('completionsKey', '').then(key => {
            if (key) {
                apiKeyInput.value = key;
                apiStatus.textContent = 'API Key configured';
                apiStatus.style.color = 'var(--success)';
            }
        });

        document.getElementById('save-api-key-btn').addEventListener('click', async () => {
            const key = apiKeyInput.value.trim();
            if (!key) {
                apiStatus.textContent = 'Please enter a valid API key';
                apiStatus.style.color = 'var(--warning)';
                return;
            }
            await AIChat.setAPIKey(key);
            await AIChat.toggleAPI(true);
            apiStatus.textContent = 'API Key saved! Ready to use Completions.me';
            apiStatus.style.color = 'var(--success)';
            setTimeout(() => { apiStatus.textContent = ''; }, 3000);
        });

        document.getElementById('test-api-key-btn').addEventListener('click', async () => {
            const key = apiKeyInput.value.trim();
            if (!key) {
                apiStatus.textContent = 'Please enter an API key first';
                apiStatus.style.color = 'var(--warning)';
                return;
            }
            apiStatus.textContent = 'Testing connection...';
            apiStatus.style.color = 'var(--text-secondary)';

            try {
                const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${key}`,
                        'HTTP-Referer': window.location.href,
                        'X-Title': 'Personal AI Agent'
                    },
                    body: JSON.stringify({
                        model: 'openrouter/auto',
                        messages: [{ role: 'user', content: 'Say hi' }],
                        max_tokens: 50
                    })
                });

                if (response.ok) {
                    apiStatus.textContent = 'Connection successful!';
                    apiStatus.style.color = 'var(--success)';
                    await AIChat.setAPIKey(key);
                    await AIChat.toggleAPI(true);
                } else {
                    const error = await response.json();
                    throw new Error(error.error?.message || 'API request failed');
                }
            } catch (error) {
                apiStatus.textContent = 'Connection failed: ' + error.message;
                apiStatus.style.color = 'var(--danger)';
            }
            setTimeout(() => { apiStatus.textContent = ''; }, 5000);
        });

        document.getElementById('clear-api-key-btn').addEventListener('click', async () => {
            apiKeyInput.value = '';
            await AIChat.clearAPIKey();
            apiStatus.textContent = 'API Key cleared';
            apiStatus.style.color = 'var(--text-muted)';
            setTimeout(() => { apiStatus.textContent = ''; }, 3000);
        });

        // Notifications
        document.getElementById('enable-notifications-btn').addEventListener('click', async () => {
            const granted = await NotificationManager.requestPermission();
            if (granted) {
                alert('Notifications enabled!');
            }
        });

        // Export data
        document.getElementById('export-data-btn').addEventListener('click', async () => {
            const data = await DB.exportAll();
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `personal-ai-agent-backup-${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
        });

        // Import data
        document.getElementById('import-data-btn').addEventListener('click', () => {
            document.getElementById('import-file').click();
        });

        document.getElementById('import-file').addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    await DB.importAll(data);
                    alert('Data imported successfully!');
                    location.reload();
                } catch (err) {
                    alert('Error importing data: ' + err.message);
                }
            };
            reader.readAsText(file);
        });

        // Clear all data
        document.getElementById('clear-all-data-btn').addEventListener('click', async () => {
            if (confirm('Are you sure? This will delete all your tasks, notes, and settings. This cannot be undone!')) {
                const transaction = DB.db.transaction(['tasks', 'notes', 'settings', 'chatHistory'], 'readwrite');
                transaction.objectStore('tasks').clear();
                transaction.objectStore('notes').clear();
                transaction.objectStore('settings').clear();
                transaction.objectStore('chatHistory').clear();

                transaction.oncomplete = () => {
                    alert('All data cleared.');
                    location.reload();
                };
            }
        });
    },

    setupSearch() {
        document.getElementById('global-search').addEventListener('input', async (e) => {
            const query = e.target.value.toLowerCase();
            if (query.length < 2) return;

            // Switch to tasks view and filter
            this.switchView('tasks');
            this.currentFilter = 'all';

            const allTasks = await TaskManager.getAll();
            const filtered = allTasks.filter(t =>
                t.title.toLowerCase().includes(query) ||
                (t.description && t.description.toLowerCase().includes(query)) ||
                (t.category && t.category.toLowerCase().includes(query))
            );

            const container = document.getElementById('tasks-container');
            if (filtered.length === 0) {
                container.innerHTML = '<div class="empty-state"><p>No matching tasks found</p></div>';
            } else {
                container.innerHTML = filtered.map(task => `
                    <div class="task-card ${task.completed ? 'completed' : ''}">
                        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} onchange="UI.toggleTask(${task.id})">
                        <div class="task-content">
                            <div class="task-title">${task.title}</div>
                            <div class="task-meta">
                                <span class="task-priority ${task.priority}">${task.priority}</span>
                                ${task.category ? `<span class="task-category">${task.category}</span>` : ''}
                                ${task.deadline ? `<span>📅 ${new Date(task.deadline).toLocaleString()}</span>` : ''}
                            </div>
                        </div>
                        <div class="task-actions">
                            <button class="task-btn" onclick="UI.editTask(${task.id})">✏️</button>
                            <button class="task-btn delete" onclick="UI.deleteTask(${task.id})">🗑️</button>
                        </div>
                    </div>
                `).join('');
            }
        });
    },

    // Task actions
    async toggleTask(id) {
        await TaskManager.toggleComplete(id);
        this.loadViewData(this.currentView);
    },

    async editTask(id) {
        const task = await DB.get('tasks', id);
        if (!task) return;

        const modal = document.getElementById('task-modal');
        document.getElementById('task-modal-title').textContent = 'Edit Task';
        document.getElementById('task-id').value = task.id;
        document.getElementById('task-title').value = task.title;
        document.getElementById('task-description').value = task.description || '';
        document.getElementById('task-priority').value = task.priority;
        document.getElementById('task-category').value = task.category || '';
        document.getElementById('task-deadline').value = task.deadline ? new Date(task.deadline).toISOString().slice(0, 16) : '';
        document.getElementById('task-reminder').checked = task.reminder || false;

        modal.classList.add('active');
    },

    async deleteTask(id) {
        if (confirm('Delete this task?')) {
            await TaskManager.delete(id);
            this.renderTasks();
            this.renderDashboard();
        }
    },

    // Note actions
    async editNote(id) {
        const note = await DB.get('notes', id);
        if (!note) return;

        const modal = document.getElementById('note-modal');
        document.getElementById('note-modal-title').textContent = 'Edit Note';
        document.getElementById('note-id').value = note.id;
        document.getElementById('note-title').value = note.title;
        document.getElementById('note-content').value = note.content;
        document.getElementById('note-tags').value = (note.tags || []).join(', ');

        modal.classList.add('active');
    },

    async generateSchedule() {
        const tasks = await TaskManager.getUpcomingTasks();
        const container = document.getElementById('schedule-container');

        // Simple scheduling algorithm: sort by priority and deadline
        const priorityWeight = { high: 0, medium: 1, low: 2 };
        tasks.sort((a, b) => {
            const priorityDiff = priorityWeight[a.priority] - priorityWeight[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(a.deadline) - new Date(b.deadline);
        });

        if (tasks.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No tasks to schedule</p></div>';
            return;
        }

        // Generate time slots starting from 9 AM
        let currentTime = new Date();
        currentTime.setHours(9, 0, 0, 0);

        container.innerHTML = tasks.map((task, index) => {
            const timeStr = currentTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            currentTime.setHours(currentTime.getHours() + 1);

            return `
                <div class="schedule-item">
                    <div class="schedule-time">${timeStr}</div>
                    <div class="schedule-task">
                        <strong>${task.title}</strong>
                        <p>${task.description || ''}</p>
                        <span class="task-priority ${task.priority}">${task.priority}</span>
                    </div>
                </div>
            `;
        }).join('');
    }
};

// =============================================
// JARVIS Visual Effects
// =============================================

const JARVISEffects = {
    // Create floating particles
    createParticles() {
        const container = document.getElementById('particles');
        if (!container) return;

        for (let i = 0; i < 50; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.left = Math.random() * 100 + '%';
            particle.style.animationDelay = Math.random() * 20 + 's';
            particle.style.animationDuration = (15 + Math.random() * 20) + 's';
            particle.style.opacity = Math.random() * 0.5 + 0.2;
            particle.style.width = (2 + Math.random() * 4) + 'px';
            particle.style.height = particle.style.width;
            container.appendChild(particle);
        }
    },

    // Hide loader when ready
    hideLoader() {
        const loader = document.getElementById('jarvis-loader');
        if (loader) {
            setTimeout(() => {
                loader.classList.add('hidden');
                setTimeout(() => {
                    loader.style.display = 'none';
                }, 500);
            }, 2000);
        }
    },

    // Typing effect for text
    typeText(element, text, speed = 50) {
        let i = 0;
        element.textContent = '';
        const timer = setInterval(() => {
            if (i < text.length) {
                element.textContent += text.charAt(i);
                i++;
            } else {
                clearInterval(timer);
            }
        }, speed);
    },

    // Sound effect placeholders (can be extended)
    playSound(type) {
        // Audio context can be added for JARVIS-like sounds
        console.log(`Sound: ${type}`);
    }
};

// =============================================
// Initialize Application
// =============================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Initialize JARVIS effects
        JARVISEffects.createParticles();

        await DB.init();
        UI.init();

        // Add generate schedule button handler
        document.getElementById('generate-schedule-btn')?.addEventListener('click', () => {
            UI.generateSchedule();
        });

        // Hide loader after initialization
        JARVISEffects.hideLoader();

        console.log('J.A.R.V.I.S. initialized successfully!');
    } catch (error) {
        console.error('Failed to initialize:', error);
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd + N: New task
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        if (UI.currentView === 'tasks') {
            document.getElementById('add-task-btn').click();
        } else if (UI.currentView === 'notes') {
            document.getElementById('add-note-btn').click();
        }
    }

    // Ctrl/Cmd + K: Focus search
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('global-search').focus();
    }

    // Escape: Close modals
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal.active').forEach(modal => {
            modal.classList.remove('active');
        });
    }
});

// Mobile sidebar toggle
const menuToggle = document.getElementById('menu-toggle');
const sidebar = document.querySelector('.sidebar');
if (menuToggle && sidebar) {
  menuToggle.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!sidebar.contains(e.target) && !menuToggle.contains(e.target)) {
      sidebar.classList.remove('open');
    }
  });
}
