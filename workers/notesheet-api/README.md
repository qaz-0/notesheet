# Notesheet Sync API

Cloudflare Workers backend for multi-device sync in Notesheet.

## How Sync Works

### Architecture

```
  Device A            Cloudflare Edge            Device B
┌───────────┐         ┌──────────────┐         ┌───────────┐
│ IndexedDB │◄─────►│   Workers    │◄─────►│ IndexedDB │
│ SyncQueue │         │      +       │         │ SyncQueue │
└───────────┘         │     D1       │         └───────────┘
                      └──────────────┘
```

### Sync Protocol

1. **Action-Based Sync**: Instead of syncing full state, Notesheet syncs individual operations (actions). Each action represents a discrete change like "edit cell", "create table", or "delete row".

2. **Offline-First**: Actions are queued locally in `localStorage` when offline. When the device comes back online, queued actions are pushed to the server.

3. **Server Sequence Numbers**: The server assigns a monotonically increasing `server_seq` to each action, establishing a global ordering across all devices.

4. **Vector Clocks**: Each action includes a vector clock for causal ordering and conflict detection.

5. **Conflict Resolution**: Last-writer-wins at the cell level. The server's sequence number determines the authoritative order.

### Authentication Flow

1. **Device Registration**: On first sync, the client generates a UUID and registers with the server. The server creates an account and returns a token.

2. **Device Pairing**: To sync across devices:
   - Device A generates a 6-digit pairing code (valid for 10 minutes)
   - User enters the code on Device B
   - Device B is linked to Device A's account
   - Full sync is triggered to bring Device B up to date

### API Endpoints

| Endpoint           | Method | Auth | Description            |
| ------------------ | ------ | ---- | ---------------------- |
| `/`                | GET    | No   | Health check           |
| `/api/auth/device` | POST   | No   | Register new device    |
| `/api/auth/link`   | POST   | Yes  | Generate pairing code  |
| `/api/auth/pair`   | POST   | Yes  | Link device using code |
| `/api/sync`        | POST   | Yes  | Push/pull actions      |
| `/api/sync/full`   | GET    | Yes  | Full state sync        |

## Deployment

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Cloudflare account

### 1. Install Dependencies

```bash
cd workers/notesheet-api
npm install
```

### 2. Login to Cloudflare

```bash
npx wrangler login
```

### 3. Create D1 Database

```bash
npx wrangler d1 create notesheet
```

Copy the `database_id` from the output and update `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "notesheet"
database_id = "your-database-id-here"
```

### 4. Initialize Database Schema

**Local development:**

```bash
npm run db:init:local
```

**Production:**

```bash
npm run db:init:remote
```

### 5. Local Development

Start the local dev server:

```bash
npm run dev
```

The API will be available at `http://localhost:8787`.

### 6. Deploy to Production

```bash
npm run deploy
```

The API will be deployed to `https://notesheet-api.<your-subdomain>.workers.dev`.

### 7. Update Frontend

Update the API URL in `src/App.svelte`:

```typescript
const SYNC_API_URL = "https://notesheet-api.<your-subdomain>.workers.dev";
```

## Database Schema

### Tables

- **accounts**: User accounts (id, created_at, email)
- **devices**: Registered devices linked to accounts
- **actions**: Append-only action log for sync
- **pairing_codes**: Temporary codes for device linking

### Viewing Data

```bash
# Local
npx wrangler d1 execute notesheet --local --command "SELECT * FROM accounts"

# Production
npx wrangler d1 execute notesheet --remote --command "SELECT * FROM accounts"
```

## Configuration

### Environment Variables

Set secrets using Wrangler:

```bash
# Optional: Set a custom JWT secret (auto-generated if not set)
npx wrangler secret put JWT_SECRET
```

### CORS

By default, CORS allows all origins. For production, update `src/index.ts`:

```typescript
cors({
  origin: "https://your-frontend-domain.com",
  // ...
});
```

## Development

### Project Structure

```
workers/notesheet-api/
├── src/
│   ├── index.ts      # Main router
│   ├── auth.ts       # Authentication endpoints
│   ├── sync.ts       # Sync endpoints
│   ├── middleware.ts # Auth middleware
│   ├── db.ts         # Database helpers
│   └── types.ts      # TypeScript types
├── schema.sql        # D1 database schema
├── wrangler.toml     # Cloudflare config
└── package.json
```

### Scripts

| Script                   | Description                       |
| ------------------------ | --------------------------------- |
| `npm run dev`            | Start local dev server            |
| `npm run deploy`         | Deploy to Cloudflare              |
| `npm run db:init:local`  | Initialize local D1 database      |
| `npm run db:init:remote` | Initialize production D1 database |

### Type Checking

```bash
npx tsc --noEmit
```

## Troubleshooting

### "Database not found"

Make sure you've created the D1 database and updated `wrangler.toml` with the correct `database_id`.

### "Unauthorized" errors

- Check that the device has registered (look for token in localStorage)
- Verify the Authorization header is being sent
- Check that the token hasn't been corrupted

### Actions not syncing

1. Check browser console for network errors
2. Verify the API URL is correct
3. Check if actions are queuing in localStorage (`notesheet_sync_queue`)
4. Try triggering a manual sync by going online/offline

### Pairing code invalid

- Codes expire after 10 minutes
- Codes are single-use
- Codes are case-insensitive but must be exactly 6 characters
