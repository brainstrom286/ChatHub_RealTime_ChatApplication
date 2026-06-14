# ChatHub

A modern real-time chat application built with **React, Node.js, Socket.IO, and MongoDB** that enables instant communication through room-based messaging.

---

## Features

- Real-time messaging using Socket.IO
- Create or join rooms using a unique Room ID
- Admin role — room creator can clear chat and delete the room
- Username support with typing indicators
- File & image sharing (up to 20MB)
- Delete messages for yourself or for everyone
- Dark / Light mode toggle
- Persistent chat history via MongoDB Atlas
- Fully responsive UI — mobile and desktop
- Vite-powered frontend

---

## Tech Stack

**Frontend**
- React.js
- Vite
- Tailwind CSS
- Socket.IO Client

**Backend**
- Node.js
- Express.js
- Socket.IO
- MongoDB Atlas
- Mongoose
- Multer (file uploads)
- UUID (room ID generation)

**Deployment**
- Vercel (Frontend)
- Render (Backend)

---

## Local Installation

### 1. Clone Repository

```bash
git clone https://github.com/yourusername/chathub.git
cd chathub
```

### 2. Install Backend Dependencies

```bash
cd server
npm install
```

### 3. Install Frontend Dependencies

```bash
cd ../client
npm install
```

---

## Environment Variables

Create a `.env` file inside the `server` folder:

```env
MONGO_URI=your_mongodb_connection_string
PORT=5000
```

Create a `.env` file inside the `client` folder:

```env
VITE_SERVER_URL=http://localhost:5000
```

---

## Run Locally

**Start Backend**

```bash
cd server
npm start
```

**Start Frontend**

```bash
cd client
npm run dev
```

Frontend runs on `http://localhost:5173`

---

## Deployment

**Backend → Render**

1. Connect your GitHub repo to Render
2. Set root directory to `server`
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add environment variables: `MONGO_URI`

**Frontend → Vercel**

1. Connect your GitHub repo to Vercel
2. Set root directory to `client`
3. Framework preset: Vite
4. Add environment variable: `VITE_SERVER_URL` → your Render backend URL

---

## Project Architecture

```
Client (React + Socket.IO)
        ↓
Node.js + Express Server
        ↓
Socket.IO Realtime Communication
        ↓
MongoDB Atlas Database
```

---

## Room Roles

| Feature | Admin (Creator) | User |
|---|---|---|
| Send messages | Yes | Yes |
| Share files | Yes | Yes |
| Delete own message | Yes | Yes |
| Delete for everyone | Yes | Yes |
| Clear chat | Yes | No |
| Delete room | Yes | No |
| Exit room | Yes | Yes |

---

## Future Improvements

- Authentication & Authorization
- User profile avatars
- Direct messaging
- Progressive Web App (PWA)
- Chat search functionality
- Multi-language support

---

