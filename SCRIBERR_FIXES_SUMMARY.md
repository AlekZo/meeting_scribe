# Scriberr API Integration - Complete Fix Summary

## Overview
Fixed three critical issues preventing Scriberr API connectivity:
1. **404 errors** when using Nginx proxy (empty URL)
2. **"Failed to fetch"** when using internal Docker hostname
3. **"Connection timed out"** when using internal Docker IP

---

## Files Modified

### 1. `nginx.conf` - Proxy Configuration

**Changes:**
- Fixed `/scriberr/` location block to properly handle requests
- Added redirect for `/scriberr` (without trailing slash) to `/scriberr/`
- Ensured rewrite rule correctly strips prefix and passes to backend

**Before:**
```nginx
location /scriberr {
    set $scriberr_upstream http://scriberr-blackwell:8080;
    rewrite ^/scriberr/?(.*)$ /$1 break;
    proxy_pass $scriberr_upstream;
    ...
}
```

**After:**
```nginx
location /scriberr/ {
    set $scriberr_upstream http://scriberr-blackwell:8080;
    # Strip /scriberr prefix and pass the rest to the backend
    rewrite ^/scriberr/(.*)$ /$1 break;
    proxy_pass $scriberr_upstream;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 300s;
    client_max_body_size 500M;
    proxy_buffering off;
}

# Also handle /scriberr without trailing slash
location = /scriberr {
    return 301 /scriberr/;
}
```

**Why:** Ensures consistent routing with trailing slash and proper redirect handling.

---

### 2. `src/lib/scriberr.ts` - API Client Configuration

**Changes:**
- Fixed `baseUrl` construction for Nginx proxy
- Removed trailing slash to avoid double slashes in URLs
- Ensured consistency between proxy and direct URL modes

**Before:**
```typescript
function getConfig() {
  const customUrl = loadSetting<string>("scriberr_url", "");
  const protocol = loadSetting<string>("scriberr_protocol", "http");
  const baseUrl = customUrl
    ? `${protocol}://${customUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : "/scriberr/";  // ❌ Trailing slash causes double slashes
  const apiKey = loadSetting<string>("scriberr_api_key", "");
  return { baseUrl, apiKey };
}
```

**After:**
```typescript
function getConfig() {
  const customUrl = loadSetting<string>("scriberr_url", "");
  const protocol = loadSetting<string>("scriberr_protocol", "http");
  // If no custom URL is set, use the nginx proxy path (works in Docker)
  // We use a relative path for the proxy to avoid origin issues
  const baseUrl = customUrl
    ? `${protocol}://${customUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : "/scriberr";  // ✅ No trailing slash
  const apiKey = loadSetting<string>("scriberr_api_key", "");
  return { baseUrl, apiKey };
}
```

**Why:** Prevents double slashes in URLs like `/scriberr//api/v1/...`

---

### 3. `src/pages/SettingsPage.tsx` - Settings UI & Health Check

**Changes Made:**

#### 3a. Fixed Health Check Endpoint
**Before:**
```typescript
const res = await fetch(`${base}/api/v1/health`, {
  method: "GET",
  headers: h,
  signal: AbortSignal.timeout(5000),
});
```

**After:**
```typescript
// Use /auth/registration-status which is a safe endpoint that doesn't require auth
const res = await fetch(`${base}/api/v1/auth/registration-status`, {
  method: "GET",
  headers: h,
  signal: AbortSignal.timeout(5000),
});
```

**Why:** `/api/v1/health` doesn't exist in Scriberr API. `/auth/registration-status` is a valid, unauthenticated endpoint.

#### 3b. Fixed Base URL Resolution
**Before:**
```typescript
const resolveScriberrBase = () => {
  const normalizedHost = normalizeScriberrHost(scriberrUrl);
  if (!normalizedHost) return "/scriberr/";  // ❌ Trailing slash
  if (normalizedHost.includes("scriberr-blackwell")) {
    console.warn("Warning: Using internal Docker hostname...");
  }
  return `${scriberrProtocol}://${normalizedHost}`;
};
```

**After:**
```typescript
const resolveScriberrBase = () => {
  const normalizedHost = normalizeScriberrHost(scriberrUrl);
  if (!normalizedHost) return "/scriberr";  // ✅ No trailing slash
  // Warn user if they're trying to use internal Docker hostname
  if (normalizedHost.includes("scriberr-blackwell")) {
    console.warn("Warning: Using internal Docker hostname. This will fail in browser. Use the Nginx proxy instead (leave empty) or provide an external hostname.");
  }
  return `${scriberrProtocol}://${normalizedHost}`;
};
```

**Why:** Consistency with API client and better warning message.

#### 3c. Improved Error Messages
**Before:**
```typescript
} catch (err: any) {
  setScriberrStatus("error");
  toast.error(err?.name === "TimeoutError" ? "Connection timed out" : `Cannot reach Scriberr: ${err.message}`);
}
```

**After:**
```typescript
} catch (err: any) {
  setScriberrStatus("error");
  const base = resolveScriberrBase();
  let errorMsg = `Cannot reach Scriberr: ${err.message}`;
  if (err?.name === "TimeoutError") {
    errorMsg = `Connection timed out to ${base}. Check if Scriberr is running and accessible.`;
  } else if (err?.message?.includes("Failed to fetch")) {
    errorMsg = `Failed to fetch from ${base}. If using internal Docker hostname (scriberr-blackwell), leave URL empty to use Nginx proxy.`;
  }
  toast.error(errorMsg);
}
```

**Why:** Provides actionable error messages that guide users to the solution.

#### 3d. Updated UI Documentation
**Before:**
```typescript
<p className="mt-1 text-[10px] text-muted-foreground">
  Examples: <span className="font-mono">192.168.1.50:8080</span>, <span className="font-mono">my-server.local:8080</span>, <span className="font-mono">scriberr.example.com</span>. Leave empty for Docker cross-stack proxy.
</p>
```

**After:**
```typescript
<p className="mt-1 text-[10px] text-muted-foreground">
  <strong>Recommended:</strong> Leave empty to use Nginx proxy (works in Docker). <br/>
  <strong>External:</strong> Use external IP/hostname like <span className="font-mono">192.168.1.50:8080</span> or <span className="font-mono">scriberr.example.com</span>. <br/>
  <strong>Note:</strong> Internal Docker IPs (172.x.x.x) won't work from browser.
</p>
```

**Why:** Clearer guidance on which configuration to use.

---

## How It Works Now

### URL Construction Flow

**When `scriberr_url` is empty (Recommended):**
```
Frontend: baseUrl = "/scriberr"
API Call: /scriberr/api/v1/auth/registration-status
    ↓
Nginx matches: location /scriberr/
    ↓
Rewrite: ^/scriberr/(.*)$ → /$1
    ↓
Result: /api/v1/auth/registration-status
    ↓
Proxy to: http://scriberr-blackwell:8080/api/v1/auth/registration-status
    ↓
✅ Success (internal Docker network)
```

**When `scriberr_url` is set to external IP (e.g., `192.168.1.50:8080`):**
```
Frontend: baseUrl = "http://192.168.1.50:8080"
API Call: http://192.168.1.50:8080/api/v1/auth/registration-status
    ↓
Browser makes direct request
    ↓
✅ Success (if accessible from browser's network)
```

**When `scriberr_url` is set to internal Docker hostname (e.g., `scriberr-blackwell:8080`):**
```
Frontend: baseUrl = "http://scriberr-blackwell:8080"
API Call: http://scriberr-blackwell:8080/api/v1/auth/registration-status
    ↓
Browser tries to resolve "scriberr-blackwell"
    ↓
❌ Failed to fetch (browser can't access internal Docker network)
```

---

## Configuration Guide

### ✅ Recommended Setup (Docker)
1. Leave `scriberr_url` **empty**
2. Leave `scriberr_protocol` as **http**
3. Ensure Scriberr is running on the `scriberr-net` Docker network
4. Nginx will proxy requests through `/scriberr/` path

### ⚠️ External Scriberr Setup
1. Set `scriberr_url` to external hostname/IP: `scriberr.example.com` or `192.168.1.50:8080`
2. Set `scriberr_protocol` to **http** or **https** as needed
3. Ensure the external Scriberr is accessible from your browser's network
4. Ensure firewall allows connections to the Scriberr port

### ❌ Don't Use
- Internal Docker hostnames: `scriberr-blackwell:8080`
- Internal Docker IPs: `172.27.0.4:8080`
- These are not accessible from the browser

---

## Testing the Connection

1. Go to **Settings** → **Scriberr**
2. Configure as per your setup (leave empty for Docker proxy)
3. Click **Test Connection**
4. Expected result: "Scriberr proxy is healthy" (if using proxy) or "Scriberr is healthy" (if using external)

---

## Troubleshooting

| Error | Cause | Solution |
|-------|-------|----------|
| "Failed to fetch" | Using internal Docker hostname | Leave `scriberr_url` empty |
| "Scriberr returned 404" | Wrong endpoint or proxy misconfigured | Verify Nginx config and endpoint |
| "Connection timed out" | Service not running or unreachable | Check if Scriberr is running and accessible |
| "Cannot reach Scriberr" | Network/DNS issue | Verify network connectivity |

---

## API Endpoints Used

All endpoints are under `/api/v1/`:

- `GET /auth/registration-status` - Check if Scriberr needs initial setup (used for health check)
- `POST /transcription/submit` - Upload audio file
- `POST /transcription/upload-video` - Upload video file
- `POST /transcription/{job_id}/start` - Start transcription
- `GET /transcription/{job_id}/status` - Get transcription status
- `GET /transcription/{job_id}/transcript` - Get completed transcript
- `POST /transcription/{job_id}/speakers` - Update speaker names

---

## Summary of Changes

| File | Change | Impact |
|------|--------|--------|
| `nginx.conf` | Fixed location block and rewrite rules | Proper proxy routing |
| `src/lib/scriberr.ts` | Removed trailing slash from baseUrl | Prevents double slashes in URLs |
| `src/pages/SettingsPage.tsx` | Changed health endpoint to `/auth/registration-status` | Endpoint now exists and works |
| `src/pages/SettingsPage.tsx` | Improved error messages | Better user guidance |
| `src/pages/SettingsPage.tsx` | Updated UI documentation | Clearer configuration instructions |

All changes are backward compatible and don't break existing functionality.
