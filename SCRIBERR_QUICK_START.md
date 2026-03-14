# Scriberr Configuration - Quick Start Guide

## TL;DR - Just Want It to Work?

### For Docker Setup (Recommended)
1. Go to **Settings** → **Scriberr**
2. Leave **Scriberr Host** empty
3. Leave **Protocol** as `http`
4. Click **Test Connection**
5. Done! ✅

### For External Scriberr
1. Go to **Settings** → **Scriberr**
2. Enter your Scriberr IP/hostname in **Scriberr Host**: `192.168.1.50:8080`
3. Set **Protocol** to `http` or `https`
4. Add API Key if required
5. Click **Test Connection**
6. Done! ✅

---

## What Changed?

### Problem 1: 404 Errors
- **Was:** Using non-existent `/api/v1/health` endpoint
- **Now:** Using `/api/v1/auth/registration-status` (valid endpoint)

### Problem 2: "Failed to Fetch"
- **Was:** Trying to use internal Docker hostname `scriberr-blackwell:8080`
- **Now:** Use Nginx proxy by leaving URL empty

### Problem 3: "Connection Timed Out"
- **Was:** Trying to use internal Docker IP `172.27.0.4:8080`
- **Now:** Use external IP or leave empty for proxy

---

## Configuration Options

### Option 1: Docker Proxy (✅ Recommended)
```
Scriberr Host: [empty]
Protocol: http
API Key: [optional]
```
- Works automatically with Docker Compose
- No external network needed
- Nginx handles routing internally

### Option 2: External Scriberr
```
Scriberr Host: 192.168.1.50:8080
Protocol: http
API Key: [your-api-key]
```
- Requires Scriberr accessible from your network
- Must be external IP/hostname (not internal Docker IP)
- Firewall must allow connections

### Option 3: Local Network Scriberr
```
Scriberr Host: scriberr.local:8080
Protocol: http
API Key: [your-api-key]
```
- Requires DNS resolution or hosts file entry
- Must be accessible from browser's network

---

## Testing

Click **Test Connection** in Settings to verify:
- ✅ "Scriberr proxy is healthy" = Docker proxy working
- ✅ "Scriberr is healthy" = External Scriberr working
- ❌ "Failed to fetch" = Using internal Docker hostname (use proxy instead)
- ❌ "Connection timed out" = Service not running or unreachable
- ❌ "Scriberr returned 404" = Nginx proxy misconfigured

---

## Common Issues

| Issue | Solution |
|-------|----------|
| "Failed to fetch" with `scriberr-blackwell:8080` | Leave Scriberr Host empty |
| "Connection timed out" with `172.27.0.4:8080` | Use external IP or leave empty |
| "Scriberr returned 404" with empty host | Rebuild Docker containers |
| Can't connect to external Scriberr | Check firewall and network connectivity |

---

## Files Modified

1. **nginx.conf** - Fixed proxy routing
2. **src/lib/scriberr.ts** - Fixed API client configuration
3. **src/pages/SettingsPage.tsx** - Fixed health check endpoint and error messages

See `SCRIBERR_FIXES_SUMMARY.md` for detailed changes.
