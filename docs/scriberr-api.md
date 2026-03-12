# Scriberr API Documentation

This document describes the Scriberr API endpoints used by MeetScribe.

## Base URL

```
http://localhost:8080
```

## Authentication

All API requests require an `X-API-Key` header:

```http
X-API-Key: your_api_key_here
```

## Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/transcription/submit` | Upload audio file |
| POST | `/api/v1/transcription/upload-video` | Upload video file |
| POST | `/api/v1/transcription/{job_id}/start` | Start transcription |
| GET | `/api/v1/transcription/{job_id}/status` | Get transcription status |
| GET | `/api/v1/transcription/{job_id}/transcript` | Get transcript |
| POST | `/api/v1/transcription/{job_id}/speakers` | Update speaker names |

## Upload Audio

```bash
curl -X POST http://localhost:8080/api/v1/transcription/submit \
  -H "X-API-Key: your_api_key" \
  -F "audio=@meeting.mp3" \
  -F "title=Weekly Team Meeting" \
  -F "diarization=true" \
  -F "language=en"
```

Response: `{ "id": "abc123", "status": "pending", "message": "File uploaded successfully" }`

## Upload Video

```bash
curl -X POST http://localhost:8080/api/v1/transcription/upload-video \
  -H "X-API-Key: your_api_key" \
  -F "video=@meeting.mp4" \
  -F "title=Weekly Team Meeting"
```

## Start Transcription

```bash
curl -X POST http://localhost:8080/api/v1/transcription/{job_id}/start \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model_family": "whisper",
    "model": "large-v3",
    "device": "cuda",
    "batch_size": 4,
    "compute_type": "float16",
    "diarize": true,
    "diarize_model": "pyannote",
    "language": "en"
  }'
```

### Key Parameters

| Parameter | Type | Description | Values |
|-----------|------|-------------|--------|
| `model` | string | Model size | `tiny`, `base`, `small`, `medium`, `large-v3` |
| `device` | string | Compute device | `cuda` (GPU), `cpu` |
| `batch_size` | int | Batch size | 1-8 |
| `compute_type` | string | Precision | `float16`, `int8` |
| `diarize` | boolean | Speaker diarization | `true`, `false` |
| `language` | string | Language code | `en`, `ru`, `auto` |

## Get Status

```bash
curl http://localhost:8080/api/v1/transcription/{job_id}/status \
  -H "X-API-Key: your_api_key"
```

Statuses: `pending`, `processing`, `completed`, `failed`

## Get Transcript

Response:
```json
{
  "id": "abc123",
  "title": "Weekly Team Meeting",
  "language": "en",
  "segments": [
    { "id": 1, "start": 0.0, "end": 5.5, "speaker": "SPEAKER_00", "text": "Hello" }
  ],
  "duration": 3600.0
}
```

## Update Speaker Names

```bash
curl -X POST http://localhost:8080/api/v1/transcription/{job_id}/speakers \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{ "mappings": [{"original_speaker": "SPEAKER_00", "custom_name": "John"}] }'
```

## View in Scriberr Web UI

```
http://localhost:8080/audio/{job_id}
```

## OOM Handling

If CUDA OOM occurs, retry with CPU:
```json
{ "device": "cpu", "compute_type": "int8", "batch_size": 1 }
```
