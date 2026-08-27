# 💬 DevChat — Real-Time Messaging Platform

> A production-grade, Slack-like real-time chat application built with **React**, **Express**, **Socket.io**, **PostgreSQL**, and **Redis**. Designed with a modern 2025 microservice-ready architecture, horizontal WebSocket scaling via Redis pub/sub, cursor-based pagination, and a dark glassmorphism UI.

---

## 🌟 Key Features

- **⚡ Real-Time Messaging**: Built on Socket.io WebSockets with typing indicators, online/offline presence tracking, and optimistic UI updates.
- **📡 Scalable WebSocket Architecture**: Leverages `@socket.io/redis-adapter` for multi-node horizontal scaling. Stateful client sessions are synchronized across nodes via Redis Pub/Sub.
- **💬 Channel & DM System**: Support for public channels, private channels, and 1-on-1 Direct Messaging (DMs).
- **🧵 Threaded Replies**: Native support for message threads and replies.
- **🔐 JWT Authentication & Redis Caching**: Access tokens (15m) + refresh tokens (7d) stored in Redis with revocation capabilities. Password hashing using `bcryptjs`.
- **🗄️ PostgreSQL + Prisma ORM**: Relational schema with index optimizations on `channel_id`, `created_at`, and parent thread references.
- **🎨 Glassmorphism Dark UI**: Built with custom design tokens, CSS Modules, Inter font, custom scrollbars, and smooth micro-animations.

---

## 🏗️ Architecture

```
                       ┌─────────────────────────┐
                       │ React + TypeScript UI   │
                       │ (Vite + Zustand + CSS)  │
                       └───────────┬─────────────┘
                                   │
                     ┌─────────────┴─────────────┐
                     │                           │
              REST API (HTTPS)           WebSockets (WSS)
                     │                           │
                     ▼                           ▼
            ┌───────────────────────────────────────────┐
            │       Express.js + Socket.io Server       │
            └─────────────┬─────────────────┬───────────┘
                          │                 │
                          ▼                 ▼
                 ┌────────────────┐  ┌─────────────┐
                 │ PostgreSQL 16  │  │   Redis 7   │
                 │  (Prisma ORM)  │  │ (Pub/Sub +  │
                 └────────────────┘  │ Cache/Set)  │
                                     └─────────────┘
```

---

## 📁 Directory Structure

```text
devchat/
├── docker-compose.yml       # Docker environment (PostgreSQL 16 & Redis 7)
├── package.json             # Root npm workspace script coordinator
├── README.md
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma    # User, Channel, ChannelMember, Message schemas
│   │   └── seed.ts          # Seed data generator (users, channels, messages)
│   ├── src/
│   │   ├── config/          # Env, Database, Redis, Socket configurations
│   │   ├── middleware/      # JWT Auth, Error Handler, Zod Validator, Rate Limiter
│   │   ├── modules/
│   │   │   ├── auth/        # Auth Controller, Service, Routes, Schemas
│   │   │   ├── channels/    # Channels & DMs Controller, Service, Routes
│   │   │   ├── messages/    # Messages & Threads Controller, Service, Routes
│   │   │   ├── presence/    # Redis-backed Presence Service
│   │   │   └── users/       # User profile search & management
│   │   ├── sockets/         # Socket.io connection manager & event handlers
│   │   ├── app.ts           # Express application setup
│   │   └── server.ts        # Server entry point & graceful shutdown
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── components/      # UI primitives, Auth, Layout, Chat components
    │   ├── hooks/           # useSocket, useAuth, useMessages hooks
    │   ├── services/        # Axios API client & Socket.io client
    │   ├── stores/          # Zustand state stores (auth, chat, presence, UI)
    │   ├── styles/          # Design tokens, global styles, keyframe animations
    │   ├── types/           # TypeScript contracts for model data & events
    │   └── utils/           # Date formatting & grouping utilities
    └── package.json
```

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js**: v20.x or higher
- **Docker Desktop** (or local PostgreSQL 16 + Redis 7 instances)

### 1. Clone & Setup Environment
```bash
# Clone the repository
git clone https://github.com/your-username/devchat.git
cd devchat

# Create environment file
cp .env.example .env
cp backend/.env.example backend/.env
```

### 2. Start PostgreSQL & Redis with Docker
```bash
docker-compose up -d
```

### 3. Install Dependencies & Seed Database
```bash
# Install all dependencies (root, backend, frontend)
npm install

# Generate Prisma client & Run migrations
npm run db:migrate

# Seed demo users & channels
npm run db:seed
```

### 4. Run Development Environment
```bash
# Runs both backend (3001) and frontend (5173) concurrently
npm run dev
```

Visit **`http://localhost:5173`** in your browser.

---

## 🔑 Demo Credentials

All seed accounts use the default password: **`Password123`**

| Name | Email | Role |
| :--- | :--- | :--- |
| **Sarah Chen** | `sarah@devchat.io` | Tech Lead / Admin |
| **Alex Rivera** | `alex@devchat.io` | Senior Engineer |
| **Priya Sharma** | `priya@devchat.io` | UI/UX Designer |
| **Marcus Johnson** | `marcus@devchat.io` | DevOps Engineer |
| **Emma Wilson** | `emma@devchat.io` | Product Manager |

---

## 🛠️ Tech Stack & Engineering Choices

- **Frontend**: React 18, TypeScript, Vite, Zustand, CSS Modules with HSL variables.
- **Backend**: Express.js, Node.js, TypeScript, Winston Logger, Zod validation.
- **Real-Time**: Socket.io, `@socket.io/redis-adapter` for multi-node event distribution.
- **Database**: PostgreSQL 16 with Prisma ORM, indexed fields for cursor pagination.
- **Caching & Presence**: Redis 7 using O(1) Set data structures (`SADD`, `SISMEMBER`, `SCARD`) to manage multi-tab socket sessions.
