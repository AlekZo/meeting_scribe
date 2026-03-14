# Scriberr API Documentation

Complete API reference for the Scriberr transcription service.

## Base URL

```
http://localhost:8080/api/v1
```

## Authentication

Scriberr supports two auth methods:

| Method | Header | Example |
|--------|--------|---------|
| API Key | `X-API-Key` | `X-API-Key: your_api_key_here` |
| Bearer Token | `Authorization` | `Authorization: Bearer jwt_token` |

---

## Auth Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/auth/registration-status` | Check if initial registration is needed |
| POST | `/auth/register` | Register initial admin user |
| POST | `/auth/login` | Login and get JWT token |
| POST | `/auth/logout` | Logout (invalidate token) |
| POST | `/auth/refresh` | Refresh access token |
| POST | `/auth/change-password` | Change password |
| POST | `/auth/change-username` | Change username |

### Login

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "admin", "password": "password"}'
```

Response:
```json
{
  "token": "jwt_token_here",
  "user": { "id": 1, "username": "admin" }
}
```

---

## Transcription Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/transcription/submit` | Upload audio file |
| POST | `/transcription/upload-video` | Upload video file |
| POST | `/transcription/{job_id}/start` | Start transcription |
| GET | `/transcription/{job_id}/status` | Get transcription status |
| GET | `/transcription/{job_id}/transcript` | Get transcript |
| POST | `/transcription/{job_id}/speakers` | Update speaker names |
| DELETE | `/transcription/{job_id}` | Delete transcription job |

### Upload Audio

```bash
curl -X POST http://localhost:8080/api/v1/transcription/submit \
  -H "X-API-Key: your_api_key" \
  -F "audio=@meeting.mp3" \
  -F "title=Weekly Team Meeting" \
  -F "diarization=true" \
  -F "language=en"
```

Response: `{ "id": "abc123", "status": "pending", "message": "File uploaded successfully" }`

### Upload Video

```bash
curl -X POST http://localhost:8080/api/v1/transcription/upload-video \
  -H "X-API-Key: your_api_key" \
  -F "video=@meeting.mp4" \
  -F "title=Weekly Team Meeting"
```

### Start Transcription

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

#### WhisperX Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `model_family` | string | `whisper` or `nvidia` |
| `model` | string | Model size: `tiny`, `base`, `small`, `medium`, `large-v3` |
| `device` | string | `cuda` (GPU) or `cpu` |
| `device_index` | int | GPU device index |
| `batch_size` | int | Batch size (1-8) |
| `compute_type` | string | `float16`, `int8` |
| `threads` | int | CPU threads |
| `task` | string | `transcribe` or `translate` |
| `language` | string | Language code (`en`, `ru`, `auto`) |
| `diarize` | bool | Enable speaker diarization |
| `diarize_model` | string | `pyannote` or `nvidia_sortformer` |
| `min_speakers` | int | Minimum expected speakers |
| `max_speakers` | int | Maximum expected speakers |
| `vad_method` | string | VAD method: `pyannote`, `none` |
| `vad_onset` | float | VAD onset threshold |
| `vad_offset` | float | VAD offset threshold |
| `chunk_size` | int | Audio chunk size |
| `beam_size` | int | Beam search width |
| `best_of` | int | Best-of sampling |
| `temperature` | float | Sampling temperature |
| `fp16` | bool | Use FP16 precision |
| `condition_on_previous_text` | bool | Condition on previous text |
| `compression_ratio_threshold` | float | Compression ratio threshold |
| `no_speech_threshold` | float | No-speech threshold |
| `logprob_threshold` | float | Log probability threshold |
| `patience` | float | Beam search patience |
| `length_penalty` | float | Length penalty |
| `suppress_numerals` | bool | Suppress numeral tokens |
| `segment_resolution` | string | `sentence` or `chunk` |
| `output_format` | string | Output format: `all`, `json`, `srt`, `vtt` |
| `model_cache_only` | bool | Use cached models only |
| `verbose` | bool | Verbose output |
| `initial_prompt` | string | Initial prompt for decoder |
| `is_multi_track_enabled` | bool | Enable multi-track transcription |

### Job Status

```bash
curl http://localhost:8080/api/v1/transcription/{job_id}/status \
  -H "X-API-Key: your_api_key"
```

Statuses: `uploaded`, `pending`, `processing`, `completed`, `failed`

### Get Transcript

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

### Update Speaker Names

```bash
curl -X POST http://localhost:8080/api/v1/transcription/{job_id}/speakers \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{ "mappings": [{"original_speaker": "SPEAKER_00", "custom_name": "John"}] }'
```

---

## SSE Events

```bash
curl http://localhost:8080/api/v1/events \
  -H "Accept: text/event-stream"
```

Real-time server-sent events for transcription progress. Use instead of polling for live updates.

---

## Transcription Profiles

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/profiles` | List all profiles |
| POST | `/profiles` | Create profile |
| GET | `/profiles/{id}` | Get profile |
| PUT | `/profiles/{id}` | Update profile |
| DELETE | `/profiles/{id}` | Delete profile |
| POST | `/profiles/{id}/set-default` | Set as default |

Profiles store reusable WhisperX parameter presets.

---

## Summarization

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/summarize` | Summarize a transcription |
| GET | `/summaries` | List summary templates |
| POST | `/summaries` | Create template |
| GET | `/summaries/{id}` | Get template |
| PUT | `/summaries/{id}` | Update template |
| DELETE | `/summaries/{id}` | Delete template |
| GET | `/summaries/settings` | Get summary settings |
| POST | `/summaries/settings` | Save summary settings |

### Summarize

```bash
curl -X POST http://localhost:8080/api/v1/summarize \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "transcription_id": "abc123",
    "content": "transcript text...",
    "model": "gpt-4",
    "template_id": "template-id"
  }'
```

---

## Chat

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/chat/models` | Get available chat models |
| POST | `/chat/sessions` | Create chat session |
| GET | `/chat/sessions/{session_id}` | Get session with messages |
| DELETE | `/chat/sessions/{session_id}` | Delete session |
| POST | `/chat/sessions/{session_id}/messages` | Send message (streaming) |
| PUT | `/chat/sessions/{session_id}/title` | Update session title |
| POST | `/chat/sessions/{session_id}/title/auto` | Auto-generate title |
| GET | `/chat/transcriptions/{transcription_id}/sessions` | Get sessions for transcription |

---

## Notes

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notes/{note_id}` | Get a note |
| PUT | `/notes/{note_id}` | Update a note |
| DELETE | `/notes/{note_id}` | Delete a note |

Notes are attached to transcript selections with word-level positioning.

---

## YouTube Download

```bash
curl -X POST http://localhost:8080/api/v1/transcription/youtube \
  -H "X-API-Key: your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://youtube.com/watch?v=...", "title": "Video Title"}'
```

---

## LLM Configuration

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/llm/config` | Get LLM config |
| POST | `/llm/config` | Create/update LLM config |
| POST | `/config/openai/validate` | Validate OpenAI API key |

---

## API Keys

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api-keys` | List API keys |
| POST | `/api-keys` | Create API key |
| DELETE | `/api-keys/{id}` | Delete API key |

---

## User Settings

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/user/settings` | Get user settings |
| PUT | `/user/settings` | Update user settings |
| POST | `/user/settings/default-profile` | Set default profile |

---

## Admin

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/admin/queue/stats` | Get queue statistics |

---

## Audio Streaming

```
http://localhost:8080/audio/{job_id}
```

Direct audio file access for playback.

---

## OOM Handling

If CUDA OOM occurs, retry with CPU fallback:
```json
{ "device": "cpu", "compute_type": "int8", "batch_size": 1 }
```

## Error Response

All errors return:
```json
{ "error": "description of the error" }
```
