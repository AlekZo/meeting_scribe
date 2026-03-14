# Detailed Code Changes - Line by Line

## File 1: `nginx.conf`

### Location: Lines 22-40

**BEFORE:**
```nginx
    # Proxy Scriberr API requests via shared Docker network
    location /scriberr {
        set $scriberr_upstream http://scriberr-blackwell:8080;
        rewrite ^/scriberr/?(.*)$ /$1 break;
        proxy_pass $scriberr_upstream;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        client_max_body_size 500M;
        proxy_buffering off;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
```

**AFTER:**
```nginx
    # Proxy Scriberr API requests via shared Docker network
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

    location / {
        try_files $uri $uri/ /index.html;
    }
```

**Changes:**
- Line 23: `location /scriberr` → `location /scriberr/` (added trailing slash)
- Line 26: `rewrite ^/scriberr/?(.*)$ /$1 break;` → `rewrite ^/scriberr/(.*)$ /$1 break;` (removed optional slash)
- Lines 37-39: Added new location block to redirect `/scriberr` to `/scriberr/`

**Why:** Ensures consistent routing with trailing slash and proper redirect handling.

---

## File 2: `src/lib/scriberr.ts`

### Location: Lines 7-17

**BEFORE:**
```typescript
function getConfig() {
  const customUrl = loadSetting<string>("scriberr_url", "");
  const protocol = loadSetting<string>("scriberr_protocol", "http");
  // If no custom URL is set, use the nginx proxy path (works in Docker)
  // We use a relative path for the proxy to avoid origin issues
  const baseUrl = customUrl
    ? `${protocol}://${customUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : "/scriberr/";
  const apiKey = loadSetting<string>("scriberr_api_key", "");
  return { baseUrl, apiKey };
}
```

**AFTER:**
```typescript
function getConfig() {
  const customUrl = loadSetting<string>("scriberr_url", "");
  const protocol = loadSetting<string>("scriberr_protocol", "http");
  // If no custom URL is set, use the nginx proxy path (works in Docker)
  // We use a relative path for the proxy to avoid origin issues
  const baseUrl = customUrl
    ? `${protocol}://${customUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`
    : "/scriberr";
  const apiKey = loadSetting<string>("scriberr_api_key", "");
  return { baseUrl, apiKey };
}
```

**Changes:**
- Line 14: `"/scriberr/"` → `"/scriberr"` (removed trailing slash)

**Why:** Prevents double slashes in URLs like `/scriberr//api/v1/...`

---

## File 3: `src/pages/SettingsPage.tsx`

### Change 3a: Health Check Endpoint (Lines 145-150)

**BEFORE:**
```typescript
      const res = await fetch(`${base}/api/v1/health`, {
        method: "GET",
        headers: h,
        signal: AbortSignal.timeout(5000),
      });
```

**AFTER:**
```typescript
      // Use /auth/registration-status which is a safe endpoint that doesn't require auth
      const res = await fetch(`${base}/api/v1/auth/registration-status`, {
        method: "GET",
        headers: h,
        signal: AbortSignal.timeout(5000),
      });
```

**Changes:**
- Line 145: Added comment explaining why this endpoint
- Line 146: `/api/v1/health` → `/api/v1/auth/registration-status`

**Why:** `/api/v1/health` doesn't exist in Scriberr API. `/auth/registration-status` is a valid, unauthenticated endpoint.

---

### Change 3b: Base URL Resolution (Lines 125-133)

**BEFORE:**
```typescript
  const resolveScriberrBase = () => {
    const normalizedHost = normalizeScriberrHost(scriberrUrl);
    if (!normalizedHost) return "/scriberr/"
    return `${scriberrProtocol}://${normalizedHost}`;
  };
```

**AFTER:**
```typescript
  const resolveScriberrBase = () => {
    const normalizedHost = normalizeScriberrHost(scriberrUrl);
    if (!normalizedHost) return "/scriberr";
    // Warn user if they're trying to use internal Docker hostname
    if (normalizedHost.includes("scriberr-blackwell")) {
      console.warn("Warning: Using internal Docker hostname. This will fail in browser. Use the Nginx proxy instead (leave empty) or provide an external hostname.");
    }
    return `${scriberrProtocol}://${normalizedHost}`;
  };
```

**Changes:**
- Line 127: `"/scriberr/"` → `"/scriberr"` (removed trailing slash)
- Lines 128-130: Added warning for internal Docker hostname

**Why:** Consistency with API client and better warning message.

---

### Change 3c: Error Messages (Lines 160-169)

**BEFORE:**
```typescript
    } catch (err: any) {
      setScriberrStatus("error");
      toast.error(err?.name === "TimeoutError" ? "Connection timed out" : `Cannot reach Scriberr: ${err.message}`);
    }
```

**AFTER:**
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

**Changes:**
- Line 161: Added `const base = resolveScriberrBase();`
- Line 162: Changed to `let errorMsg = ...` (variable instead of ternary)
- Lines 163-167: Added conditional logic for different error types
- Line 168: Changed to `toast.error(errorMsg);`

**Why:** Provides actionable error messages that guide users to the solution.

---

### Change 3d: UI Documentation (Lines 325-330)

**BEFORE:**
```typescript
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Examples: <span className="font-mono">192.168.1.50:8080</span>, <span className="font-mono">my-server.local:8080</span>, <span className="font-mono">scriberr.example.com</span>. Leave empty for Docker cross-stack proxy.
                  </p>
```

**AFTER:**
```typescript
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    <strong>Recommended:</strong> Leave empty to use Nginx proxy (works in Docker). <br/>
                    <strong>External:</strong> Use external IP/hostname like <span className="font-mono">192.168.1.50:8080</span> or <span className="font-mono">scriberr.example.com</span>. <br/>
                    <strong>Note:</strong> Internal Docker IPs (172.x.x.x) won't work from browser.
                  </p>
```

**Changes:**
- Restructured text with `<strong>` tags for emphasis
- Added `<br/>` for line breaks
- Added warning about internal Docker IPs
- Clearer guidance on which configuration to use

**Why:** Clearer guidance on which configuration to use.

---

## Summary of All Changes

| File | Lines | Type | Change |
|------|-------|------|--------|
| nginx.conf | 23 | Config | `location /scriberr` → `location /scriberr/` |
| nginx.conf | 26 | Config | Rewrite rule simplified |
| nginx.conf | 37-39 | Config | Added redirect for `/scriberr` |
| scriberr.ts | 14 | Code | `"/scriberr/"` → `"/scriberr"` |
| SettingsPage.tsx | 145-146 | Code | Changed health endpoint |
| SettingsPage.tsx | 127 | Code | `"/scriberr/"` → `"/scriberr"` |
| SettingsPage.tsx | 128-130 | Code | Added Docker hostname warning |
| SettingsPage.tsx | 160-169 | Code | Improved error messages |
| SettingsPage.tsx | 325-330 | UI | Updated documentation text |

---

## Testing the Changes

After applying these changes:

1. **Rebuild Docker containers:**
   ```bash
   docker-compose up --build
   ```

2. **Test Scriberr connection:**
   - Go to Settings → Scriberr
   - Leave Scriberr Host empty
   - Click "Test Connection"
   - Expected: "Scriberr proxy is healthy" ✅

3. **Verify API calls work:**
   - Upload a file
   - Check transcription status
   - Verify speaker detection works

---

## Rollback Instructions

If you need to revert these changes:

1. **nginx.conf:** Revert to original location block (remove trailing slash handling)
2. **scriberr.ts:** Change `"/scriberr"` back to `"/scriberr/"`
3. **SettingsPage.tsx:** 
   - Change endpoint back to `/api/v1/health`
   - Change `"/scriberr"` back to `"/scriberr/"`
   - Simplify error handling
   - Revert UI text

However, these changes are recommended and should not cause any issues.
